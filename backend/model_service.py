"""Model service: manages Indra OCR inference, caching, and document lifecycle."""

from __future__ import annotations

import base64
import hashlib
import json
import os
import threading
import time
import uuid
from dataclasses import asdict
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import cv2
import numpy as np
import pypdfium2 as pdfium

import indra_ocr
from indra_ocr.document import Converter
from indra_ocr.models import model_dir
from indra_ocr.pipeline import OrtOCR, Page

from backend import database as db
from backend.config import (
    DATA_DIR,
    DB_PATH,
    FILES_DIR,
    MAX_FILE_SIZE_BYTES,
    MAX_PAGE_LIMIT,
    MAX_RENDER_SIDE,
    MODEL_DIR,
    SAMPLES_DIR,
    TEMP_DIR,
    THREADS,
)
from backend.schemas import (
    BlockItem,
    LineItem,
    PageResult,
    ProcessOptions,
    SampleItem,
)

TIMING_KEYS = (
    "text_ms",
    "det_ms",
    "rec_ms",
    "ocr_ms",
    "math_ms",
    "order_ms",
    "orient_ms",
    "total_ms",
)

SAMPLE_CATALOG = [
    SampleItem(
        id="rotated_letter",
        name="Rotated Letter (Auto-Orientation)",
        description="Scanned upside down: Indra OCR auto-detects orientation, rotates upright, reads columns in order and detects headings.",
        filename="rotated_letter.png",
    ),
    SampleItem(
        id="table_pmc",
        name="Journal Page with Tables",
        description="Journal page featuring dual complex tables, recognized with captions and formatted as clean HTML tables.",
        filename="table_pmc.png",
    ),
    SampleItem(
        id="multi_column",
        name="Multi-Column Layout",
        description="Multi-column document demonstrating layout block segmentation, section headers, and reading order sequencing.",
        filename="multi_column.png",
    ),
    SampleItem(
        id="chinese_essay",
        name="Chinese & Multilingual Document",
        description="Shows high-accuracy multilingual recognition supporting Latin and CJK characters simultaneously.",
        filename="chinese_essay.png",
    ),
]


def compute_options_hash(opts: ProcessOptions) -> str:
    key_dict = {
        "mode": opts.mode,
        "math": opts.math,
        "furniture": opts.furniture,
        "model_order": opts.model_order,
        "image_ocr": opts.image_ocr,
        "dpi": opts.dpi,
    }
    return hashlib.md5(json.dumps(key_dict, sort_keys=True).encode()).hexdigest()[:12]


class DocumentRecord:
    def __init__(
        self,
        doc_id: str,
        filename: str,
        file_path: Path,
        is_pdf: bool,
        total_pages: int,
        is_ppt: bool = False,
        converted_pdf_path: Optional[Path] = None,
    ):
        self.doc_id = doc_id
        self.filename = filename
        self.file_path = file_path
        self.is_pdf = is_pdf
        self.is_ppt = is_ppt
        self.converted_pdf_path = converted_pdf_path
        self.total_pages = total_pages
        self.created_at = time.time()
        # Cache for processed pages: (page_index, options_hash) -> PageResult
        self.page_cache: Dict[str, PageResult] = {}


class ModelService:
    def __init__(self):
        self.lock = threading.Lock()
        self.ocrs: Dict[Tuple[bool, bool], OrtOCR] = {}  # (math, furniture) -> OrtOCR
        self.documents: Dict[str, DocumentRecord] = {}
        self.threads = THREADS
        # Pre-warm default recognizer
        self._get_ocr(math=False, furniture=False)

    def _get_ocr(self, math: bool, furniture: bool) -> OrtOCR:
        key = (math, furniture)
        if key not in self.ocrs:
            model_path = MODEL_DIR if (MODEL_DIR.exists() and (MODEL_DIR / "det.onnx").exists()) else None
            onnx = model_dir(path=model_path, revision="main", math=math)
            ocr = OrtOCR(
                onnx,
                threads=self.threads,
                rec_int8=False,
                math=math,
                furniture=furniture,
            )
            # Warm-up pass so first inference allocation is not counted in timings
            ocr(np.full((200, 200), 255, np.uint8))
            self.ocrs[key] = ocr
        return self.ocrs[key]

    def register_file(self, filename: str, data: bytes) -> DocumentRecord:
        if MAX_FILE_SIZE_BYTES and len(data) > MAX_FILE_SIZE_BYTES:
            raise ValueError(
                f"File size exceeds limit ({len(data) / (1024 * 1024):.1f} MB uploaded)."
            )

        file_hash = hashlib.sha256(data).hexdigest()
        existing = db.get_document_by_hash(file_hash)
        if existing and Path(existing["file_path"]).exists():
            db.touch_document(existing["doc_id"])
            f_path = Path(existing["file_path"])
            is_ppt_val = existing.get("is_pdf") == 2 or f_path.suffix.lower() in (".pptx", ".ppt")
            is_pdf_val = existing.get("is_pdf") == 1
            conv_pdf = TEMP_DIR / "pdf_conv" / f"{f_path.stem}.pdf"
            rec = DocumentRecord(
                doc_id=existing["doc_id"],
                filename=filename or existing["filename"],
                file_path=f_path,
                is_pdf=is_pdf_val,
                is_ppt=is_ppt_val,
                converted_pdf_path=conv_pdf if conv_pdf.exists() else None,
                total_pages=existing["total_pages"],
            )
            self.documents[rec.doc_id] = rec
            return rec

        doc_id = uuid.uuid4().hex[:12]
        ext = Path(filename).suffix.lower()
        is_pptx_doc = ext == ".pptx" or (data[:4] == b"PK\x03\x04" and ext == ".pptx")
        is_ppt_doc = ext == ".ppt" or is_pptx_doc
        is_pdf_doc = data[:5] == b"%PDF-"

        safe_name = Path(filename).name or "document"
        saved_path = FILES_DIR / f"{file_hash[:16]}_{safe_name}"
        saved_path.write_bytes(data)

        converted_pdf: Optional[Path] = None
        doc_type_code = 1 if is_pdf_doc else (2 if is_ppt_doc else 0)

        if is_ppt_doc:
            from backend import ppt_service
            if ppt_service.is_soffice_available():
                converted_pdf = ppt_service.convert_ppt_to_pdf(saved_path, TEMP_DIR / "pdf_conv")
            try:
                total_pages = ppt_service.get_slide_count(saved_path, converted_pdf)
            except Exception as e:
                try:
                    saved_path.unlink()
                except OSError:
                    pass
                raise ValueError(f"Invalid presentation file: {e}") from e

            if MAX_PAGE_LIMIT and total_pages > MAX_PAGE_LIMIT:
                try:
                    saved_path.unlink()
                    if converted_pdf and converted_pdf.exists():
                        converted_pdf.unlink()
                except OSError:
                    pass
                raise ValueError(
                    f"Presentation exceeds slides limit ({total_pages} slides detected). "
                    f"Maximum supported size is {MAX_PAGE_LIMIT} slides."
                )
        elif is_pdf_doc:
            try:
                doc = pdfium.PdfDocument(str(saved_path))
                total_pages = len(doc)
                doc.close()
            except Exception as e:
                try:
                    saved_path.unlink()
                except OSError:
                    pass
                raise ValueError(f"Invalid PDF file: {e}") from e

            if MAX_PAGE_LIMIT and total_pages > MAX_PAGE_LIMIT:
                try:
                    saved_path.unlink()
                except OSError:
                    pass
                raise ValueError(
                    f"Document exceeds pages limit ({total_pages} pages detected). "
                    f"Maximum supported size is {MAX_PAGE_LIMIT} pages."
                )
        else:
            img = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE)
            if img is None:
                try:
                    saved_path.unlink()
                except OSError:
                    pass
                raise ValueError("Uploaded file is not a valid or readable image/PDF/PPT.")
            total_pages = 1

        db.upsert_document(
            doc_id=doc_id,
            file_hash=file_hash,
            filename=filename,
            file_path=str(saved_path),
            file_size=len(data),
            total_pages=total_pages,
            is_pdf=doc_type_code,
        )

        record = DocumentRecord(
            doc_id=doc_id,
            filename=filename,
            file_path=saved_path,
            is_pdf=is_pdf_doc,
            is_ppt=is_ppt_doc,
            converted_pdf_path=converted_pdf,
            total_pages=total_pages,
        )
        self.documents[doc_id] = record
        return record

    def get_document(self, doc_id: str) -> DocumentRecord:
        record = self.documents.get(doc_id)
        if record:
            return record
        existing = db.get_document(doc_id)
        if existing and Path(existing["file_path"]).exists():
            f_path = Path(existing["file_path"])
            is_ppt_val = existing.get("is_pdf") == 2 or f_path.suffix.lower() in (".pptx", ".ppt")
            is_pdf_val = existing.get("is_pdf") == 1
            conv_pdf = TEMP_DIR / "pdf_conv" / f"{f_path.stem}.pdf"
            rec = DocumentRecord(
                doc_id=existing["doc_id"],
                filename=existing["filename"],
                file_path=f_path,
                is_pdf=is_pdf_val,
                is_ppt=is_ppt_val,
                converted_pdf_path=conv_pdf if conv_pdf.exists() else None,
                total_pages=existing["total_pages"],
            )
            self.documents[doc_id] = rec
            return rec
        raise KeyError(f"Document with ID '{doc_id}' not found.")

    def load_sample(self, sample_id: str) -> DocumentRecord:
        sample = next((s for s in SAMPLE_CATALOG if s.id == sample_id), None)
        if not sample:
            raise KeyError(f"Sample '{sample_id}' not found.")
        sample_path = SAMPLES_DIR / sample.filename
        if not sample_path.exists():
            raise FileNotFoundError(f"Sample file {sample.filename} not found.")
        data = sample_path.read_bytes()
        return self.register_file(sample.filename, data)

    def process_page(
        self,
        doc_id: str,
        page_idx: int,
        opts: ProcessOptions,
        include_image: bool = True,
    ) -> PageResult:
        doc_record = self.get_document(doc_id)
        if page_idx < 0 or page_idx >= doc_record.total_pages:
            raise IndexError(
                f"Page index {page_idx} out of bounds (document has {doc_record.total_pages} pages)."
            )

        opts_hash = compute_options_hash(opts)
        cached = db.get_page_result(doc_id, page_idx, opts_hash)
        if cached:
            if not include_image or cached.get("image_data"):
                return PageResult(**cached)

        if doc_record.is_ppt:
            from backend import ppt_service
            if doc_record.converted_pdf_path is None or not doc_record.converted_pdf_path.exists():
                doc_record.converted_pdf_path = ppt_service.convert_ppt_to_pdf(doc_record.file_path, TEMP_DIR / "pdf_conv")

            with self.lock:
                ocr_pipeline = self._get_ocr(math=opts.math, furniture=opts.furniture)
                result = ppt_service.extract_slide(
                    ppt_path=doc_record.file_path,
                    slide_idx=page_idx,
                    opts=opts,
                    converted_pdf_path=doc_record.converted_pdf_path,
                    ocr_pipeline=ocr_pipeline,
                    include_image=include_image,
                )
            db.save_page_result(doc_id, page_idx, opts_hash, result.dict())
            return result

        with self.lock:
            ocr = self._get_ocr(math=opts.math, furniture=opts.furniture)
            conv = Converter(
                ocr,
                dpi=opts.dpi,
                mode=opts.mode,
                pdf_order=not opts.model_order,
                image_ocr=opts.image_ocr,
            )

            render_ms = 0.0
            if doc_record.is_pdf:
                doc = pdfium.PdfDocument(str(doc_record.file_path), password=opts.password)
                try:
                    t0 = time.perf_counter()
                    scale = conv.page_scale(doc[page_idx])
                    arr = doc[page_idx].render(scale=scale, grayscale=True).to_numpy()
                    render_ms = 1000 * (time.perf_counter() - t0)
                    page = conv.pdf_page(str(doc_record.file_path), doc, page_idx)
                finally:
                    doc.close()
                gray = np.ascontiguousarray(arr[..., 0] if arr.ndim == 3 else arr)
            else:
                data = doc_record.file_path.read_bytes()
                t0 = time.perf_counter()
                gray = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_GRAYSCALE)
                render_ms = 1000 * (time.perf_counter() - t0)
                page = ocr(gray)

            # If page orientation was detected and rotated, make gray upright to match bounding boxes
            if page.rotation:
                gray = np.ascontiguousarray(np.rot90(gray, -(page.rotation // 90)))

            h, w = gray.shape
            s = min(1.0, MAX_RENDER_SIDE / max(h, w))
            small = (
                cv2.resize(gray, None, fx=s, fy=s, interpolation=cv2.INTER_AREA)
                if s < 1
                else gray
            )

            image_data = None
            if include_image:
                ok, jpg = cv2.imencode(".jpg", small, [cv2.IMWRITE_JPEG_QUALITY, 85])
                if ok:
                    image_data = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode()

            scaled_box = lambda b: [round(float(v) * s, 1) for v in b[:4]]

            lines_list = [
                LineItem(
                    box=scaled_box(ln.box),
                    text=ln.text,
                    conf=round(float(ln.conf), 3),
                )
                for ln in page.lines
            ]

            blocks_list = [
                BlockItem(
                    label=b.get("label", "Text"),
                    box=scaled_box(b.get("bbox", [0, 0, 0, 0])),
                    text=b.get("text", ""),
                )
                for b in page.blocks
            ]

            markdown_text = page.markdown if page.markdown is not None else ""
            if markdown_text:
                import re
                markdown_text = re.sub(r'(?<=\S)\s*[•●·▪▫‣]\s*', r'\n\n* ', markdown_text)
            plain_text = page.text if hasattr(page, "text") and page.text else "\n".join(ln.text for ln in page.lines)

            timings_dict = {
                "render_ms": round(render_ms, 1),
                **{k: 0.0 for k in TIMING_KEYS},
                **{k: round(float(v), 1) for k, v in page.timings.items()},
            }

            json_dict = {
                "page": page_idx,
                "page_number": page_idx + 1,
                "source": page.source,
                "rotation": page.rotation,
                "skew": page.skew,
                "note": page.note,
                "lines": [asdict(ln) for ln in page.lines],
                "blocks": page.blocks,
                "markdown": markdown_text,
                "timings": timings_dict,
            }

            result = PageResult(
                page_index=page_idx,
                page_number=page_idx + 1,
                w=small.shape[1],
                h=small.shape[0],
                image_data=image_data,
                lines=lines_list,
                blocks=blocks_list,
                markdown=markdown_text,
                text=plain_text,
                source=page.source,
                rotation=page.rotation,
                skew=round(page.skew, 2),
                note=page.note,
                timings=timings_dict,
                json_data=json_dict,
            )

            db.save_page_result(doc_id, page_idx, opts_hash, result.dict())
            return result

    def convert_all(
        self,
        doc_id: str,
        opts: ProcessOptions,
        max_pages: int = 0,
    ) -> Tuple[List[PageResult], str, str, float]:
        doc_record = self.get_document(doc_id)
        limit = min(doc_record.total_pages, MAX_PAGE_LIMIT)
        if max_pages > 0:
            limit = min(limit, max_pages)

        opts_hash = compute_options_hash(opts)
        cached_conv = db.get_conversion(doc_id, opts_hash)
        if cached_conv and cached_conv["total_pages"] >= limit:
            pages: List[PageResult] = []
            for i in range(limit):
                p = db.get_page_result(doc_id, i, opts_hash)
                if p:
                    pages.append(PageResult(**p))
            if len(pages) == limit:
                return pages, cached_conv["markdown"], cached_conv["plain_text"], cached_conv["total_time_ms"]

        pages: List[PageResult] = []
        md_parts: List[str] = []
        txt_parts: List[str] = []
        total_time_ms = 0.0

        for i in range(limit):
            # Process page (will read from page cache if already done)
            page_res = self.process_page(doc_id, i, opts, include_image=False)
            pages.append(page_res)
            if page_res.markdown:
                md_parts.append(f"<!-- Page {i + 1} -->\n{page_res.markdown}")
            if page_res.text:
                txt_parts.append(f"--- Page {i + 1} ---\n{page_res.text}")
            total_time_ms += page_res.timings.get("total_ms", 0.0)

        full_md = "\n\n\n".join(md_parts)
        full_txt = "\n\n\n".join(txt_parts)
        round_ms = round(total_time_ms, 1)

        db.save_conversion(doc_id, opts_hash, limit, round_ms, full_md, full_txt)
        return pages, full_md, full_txt, round_ms


# Global singleton instance
service = ModelService()
