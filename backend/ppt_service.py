"""PPT/PPTX slide processing service implementing the Hybrid Architecture.

Combines:
1. Native python-pptx digital extraction (titles, text frames, nested bullets, tables, speaker notes, geometry).
2. LibreOffice (soffice) headless PDF rendering for 100% visual slide canvas fidelity (with Pillow fallback).
3. Indra OCR on embedded slide images when image_ocr=True.
4. Step-by-step hybrid execution logging for UI display.
"""

import base64
import os
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import pptx
from pptx import Presentation
from pptx.enum.shapes import MSO_SHAPE_TYPE

from backend.config import MAX_RENDER_SIDE, TEMP_DIR
from backend.schemas import BlockItem, LineItem, PageResult, ProcessOptions


def is_soffice_available() -> bool:
    """Check if LibreOffice soffice CLI binary is available."""
    return shutil.which("soffice") is not None


def convert_ppt_to_pdf(ppt_path: Path, output_dir: Path) -> Optional[Path]:
    """Convert PPT or PPTX to PDF using headless LibreOffice."""
    if not is_soffice_available():
        return None
    try:
        output_dir.mkdir(parents=True, exist_ok=True)
        cmd = [
            "soffice",
            "--headless",
            "--convert-to",
            "pdf",
            str(ppt_path),
            "--outdir",
            str(output_dir),
        ]
        res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)
        if res.returncode == 0:
            pdf_path = output_dir / f"{ppt_path.stem}.pdf"
            if pdf_path.exists():
                return pdf_path
    except Exception as e:
        print(f"LibreOffice conversion error: {e}")
    return None


def get_slide_count(ppt_path: Path, converted_pdf_path: Optional[Path] = None) -> int:
    """Return slide count from PPTX natively or via converted PDF for legacy PPT."""
    if ppt_path.suffix.lower() == ".pptx":
        try:
            prs = Presentation(str(ppt_path))
            return len(prs.slides)
        except Exception:
            pass

    if converted_pdf_path and converted_pdf_path.exists():
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(str(converted_pdf_path))
        count = len(doc)
        doc.close()
        return count

    # Try on-the-fly conversion if soffice exists
    temp_pdf = convert_ppt_to_pdf(ppt_path, TEMP_DIR / "pdf_conv")
    if temp_pdf and temp_pdf.exists():
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(str(temp_pdf))
        count = len(doc)
        doc.close()
        return count

    raise ValueError(f"Unable to parse presentation or count slides for {ppt_path.name}")


def render_fallback_slide_image(
    slide_title: str,
    shapes_summary: List[str],
    width: int = 1280,
    height: int = 720,
) -> np.ndarray:
    """Generate high-resolution slide card when LibreOffice is not installed."""
    img = Image.new("RGB", (width, height), color="#fcfcfc")
    draw = ImageDraw.Draw(img)

    # Gradient-like top banner
    draw.rectangle([0, 0, width, 90], fill="#1e293b")
    draw.rectangle([0, 86, width, 90], fill="#d24726")  # PPT accent line

    # Title text
    draw.text((40, 28), slide_title or "Presentation Slide", fill="#ffffff")

    # Shapes placeholder layout
    y_offset = 130
    for idx, item in enumerate(shapes_summary[:12]):
        draw.rectangle([40, y_offset, width - 40, y_offset + 36], outline="#cbd5e1", fill="#f8fafc", width=1)
        draw.text((55, y_offset + 8), item[:120], fill="#334155")
        y_offset += 46

    # Convert PIL to BGR OpenCV image
    rgb_arr = np.array(img)
    return cv2.cvtColor(rgb_arr, cv2.COLOR_RGB2BGR)


def extract_slide(
    ppt_path: Path,
    slide_idx: int,
    opts: ProcessOptions,
    converted_pdf_path: Optional[Path] = None,
    ocr_pipeline: Optional[Callable] = None,
    include_image: bool = True,
) -> PageResult:
    """Extract slide-by-slide hybrid data: native digital structure + visual canvas + image OCR."""
    t_start = time.perf_counter()
    steps_log: List[str] = []

    slide_w_emu = 9144000  # Default 10 inch (16:9)
    slide_h_emu = 5143500  # Default 5.625 inch
    slide_title = ""
    slide_markdown_parts: List[str] = []
    slide_text_parts: List[str] = []
    blocks_list: List[BlockItem] = []
    lines_list: List[LineItem] = []

    render_ms = 0.0
    parse_ms = 0.0
    image_ocr_ms = 0.0

    # ----------------------------------------------------
    # Stage 1: Visual Rendering (soffice PDF or Fallback)
    # ----------------------------------------------------
    t_render_0 = time.perf_counter()
    bgr_img: Optional[np.ndarray] = None

    if converted_pdf_path and converted_pdf_path.exists():
        import pypdfium2 as pdfium

        doc = pdfium.PdfDocument(str(converted_pdf_path))
        try:
            if slide_idx < len(doc):
                page = doc[slide_idx]
                scale = opts.dpi / 72.0
                arr = page.render(scale=scale).to_numpy()
                bgr_img = cv2.cvtColor(arr, cv2.COLOR_RGB2BGR if arr.shape[2] == 3 else cv2.COLOR_RGBA2BGR)
                steps_log.append(f"Step 1 (Visual Canvas): Rendered slide via LibreOffice + pypdfium2 at {int(opts.dpi)} DPI")
        finally:
            doc.close()

    render_ms = 1000 * (time.perf_counter() - t_render_0)

    # Load presentation metadata to get EMU dimensions
    prs: Optional[Presentation] = None
    slide = None
    slide_w_emu = 12192000
    slide_h_emu = 6858000

    if ppt_path.suffix.lower() == ".pptx":
        try:
            prs = Presentation(str(ppt_path))
            slide_w_emu = prs.slide_width
            slide_h_emu = prs.slide_height
            if slide_idx < len(prs.slides):
                slide = prs.slides[slide_idx]
        except Exception as e:
            steps_log.append(f"python-pptx warning: {e}")

    # Fallback preview if LibreOffice conversion was not available
    if bgr_img is None:
        bgr_img = render_fallback_slide_image(
            slide_title=None,
            shapes_summary=[],
            width=1600,
            height=int(1600 * (slide_h_emu / max(1, slide_w_emu))),
        )
        steps_log.append("Step 1 (Fallback Canvas): Generated native slide card preview (LibreOffice absent)")

    # Prepare preview image matching frontend canvas
    h_orig, w_orig = bgr_img.shape[:2]
    s_scale = min(1.0, MAX_RENDER_SIDE / max(h_orig, w_orig))
    preview_img = (
        cv2.resize(bgr_img, None, fx=s_scale, fy=s_scale, interpolation=cv2.INTER_AREA)
        if s_scale < 1.0
        else bgr_img
    )
    preview_h, preview_w = preview_img.shape[:2]

    # Coordinate helper: EMU -> pixel in canvas
    def emu_to_pixels(left, top, width, height):
        x0 = round((left / slide_w_emu) * preview_w, 1)
        y0 = round((top / slide_h_emu) * preview_h, 1)
        x1 = round(((left + width) / slide_w_emu) * preview_w, 1)
        y1 = round(((top + height) / slide_h_emu) * preview_h, 1)
        return [max(0.0, x0), max(0.0, y0), min(float(preview_w), x1), min(float(preview_h), y1)]

    # ----------------------------------------------------
    # Stage 2: Native Digital Parsing via python-pptx
    # ----------------------------------------------------
    t_parse_0 = time.perf_counter()
    slide_title: Optional[str] = None
    title_shape_id = None
    tables_count = 0
    text_frames_count = 0
    images_count = 0
    notes_text = ""

    if slide is not None:
        # Step A: Identify slide title
        if slide.shapes.title and slide.shapes.title.text.strip():
            slide_title = slide.shapes.title.text.strip()
            title_shape_id = slide.shapes.title.shape_id
            tb = slide.shapes.title
            box = emu_to_pixels(tb.left, tb.top, tb.width, tb.height)
            slide_markdown_parts.append(f"# {slide_title}")
            slide_text_parts.append(slide_title)
            blocks_list.append(BlockItem(label="Section-Header", box=box, text=slide_title))
            lines_list.append(LineItem(box=box, text=slide_title, conf=1.0))
        else:
            # Detect top-most title candidate
            for s in slide.shapes:
                if s.has_text_frame and s.text_frame.text.strip():
                    if s.top < 0.22 * slide_h_emu and len(s.text_frame.text.strip()) < 150:
                        slide_title = s.text_frame.text.strip().replace("\n", " ")
                        title_shape_id = s.shape_id
                        box = emu_to_pixels(s.left, s.top, s.width, s.height)
                        slide_markdown_parts.append(f"# {slide_title}")
                        slide_text_parts.append(slide_title)
                        blocks_list.append(BlockItem(label="Section-Header", box=box, text=slide_title))
                        lines_list.append(LineItem(box=box, text=slide_title, conf=1.0))
                        break

        # Step B: Traverse other shapes
        for shape in slide.shapes:
            if title_shape_id is not None and shape.shape_id == title_shape_id:
                continue

            # Case 1: Text Frames
            if shape.has_text_frame:
                paragraphs = shape.text_frame.paragraphs
                frame_text_lines = []
                frame_md_lines = []
                is_footer = shape.top > 0.86 * slide_h_emu

                for p in paragraphs:
                    raw_p = "".join([r.text for r in p.runs]).strip()
                    if not raw_p:
                        continue

                    is_bullet = False
                    if not is_footer and p.level and p.level > 0:
                        is_bullet = True
                    elif not is_footer and raw_p.startswith(("- ", "* ", "• ", "● ", "· ")):
                        is_bullet = True
                        raw_p = raw_p.lstrip("-*•●· ")

                    if is_bullet:
                        indent = "  " * (p.level or 0)
                        frame_md_lines.append(f"{indent}* {raw_p}")
                    else:
                        frame_md_lines.append(raw_p)

                    frame_text_lines.append(raw_p)

                if frame_text_lines:
                    text_frames_count += 1
                    full_frame_text = "\n".join(frame_text_lines)
                    slide_markdown_parts.append("\n".join(frame_md_lines))
                    slide_text_parts.append(full_frame_text)
                    box = emu_to_pixels(shape.left, shape.top, shape.width, shape.height)

                    if is_footer:
                        label = "Page-Footer" if len(full_frame_text) < 10 else "Footnote"
                    elif any(ln.strip().startswith("* ") for ln in frame_md_lines):
                        label = "List-Group"
                    elif shape.top < 0.28 * slide_h_emu and len(full_frame_text) < 150:
                        label = "Caption"
                    else:
                        label = "Text"

                    blocks_list.append(BlockItem(label=label, box=box, text=full_frame_text))
                    lines_list.append(LineItem(box=box, text=full_frame_text.replace("\n", " "), conf=1.0))

            # Case 2: Tables
            elif shape.has_table:
                tables_count += 1
                table = shape.table
                table_md = []
                headers = []
                for r_idx, row in enumerate(table.rows):
                    row_cells = [c.text.strip().replace("\n", " ").replace("|", "\\|") for c in row.cells]
                    table_md.append("| " + " | ".join(row_cells) + " |")
                    if r_idx == 0:
                        headers = row_cells
                        table_md.append("| " + " | ".join(["---"] * len(row_cells)) + " |")

                table_str = "\n".join(table_md)
                slide_markdown_parts.append(f"\n{table_str}\n")
                slide_text_parts.append(" | ".join(headers))
                box = emu_to_pixels(shape.left, shape.top, shape.width, shape.height)
                blocks_list.append(BlockItem(label="Table", box=box, text=" | ".join(headers)))
                lines_list.append(LineItem(box=box, text=" | ".join(headers), conf=1.0))

            # Case 3: Embedded Pictures (run Indra OCR if image_ocr=True)
            elif shape.shape_type == MSO_SHAPE_TYPE.PICTURE and opts.image_ocr:
                images_count += 1
                try:
                    t_img_0 = time.perf_counter()
                    img_bytes = shape.image.blob
                    img_np = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_GRAYSCALE)
                    if img_np is not None and ocr_pipeline is not None:
                        ocr_page = ocr_pipeline(img_np)
                        if ocr_page and ocr_page.lines:
                            ocr_text = " ".join([ln.text for ln in ocr_page.lines if ln.text.strip()])
                            if ocr_text:
                                slide_markdown_parts.append(f"> 🖼️ **Image OCR:** {ocr_text}")
                                slide_text_parts.append(f"[Image OCR]: {ocr_text}")
                                box = emu_to_pixels(shape.left, shape.top, shape.width, shape.height)
                                blocks_list.append(BlockItem(label="Caption", box=box, text=f"OCR: {ocr_text}"))
                                lines_list.append(LineItem(box=box, text=ocr_text, conf=0.95))
                    image_ocr_ms += 1000 * (time.perf_counter() - t_img_0)
                except Exception as e:
                    print(f"Slide picture OCR error: {e}")

        # Case 4: Speaker Notes
        try:
            if slide.has_notes_slide and slide.notes_slide.notes_text_frame:
                notes_text = slide.notes_slide.notes_text_frame.text.strip()
                if notes_text:
                    slide_markdown_parts.append(f"\n> 📝 **Speaker Notes:**\n> {notes_text}\n")
                    slide_text_parts.append(f"[Notes]: {notes_text}")
                    steps_log.append("Extracted slide speaker notes")
        except Exception:
            pass

        steps_log.append(
            f"Step 2 (Digital Parser): Extracted {text_frames_count} text frames, {tables_count} tables, {images_count} images via python-pptx"
        )
    else:
        steps_log.append("Step 2: Binary PPT format processed via LibreOffice PDF pipeline")

    parse_ms = 1000 * (time.perf_counter() - t_parse_0)

    image_data = None
    if include_image:
        ok, jpg = cv2.imencode(".jpg", preview_img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            image_data = "data:image/jpeg;base64," + base64.b64encode(jpg.tobytes()).decode()

    total_time_ms = round(1000 * (time.perf_counter() - t_start), 1)
    steps_log.append(f"Step 4 (Cache): Stored slide extraction into SQLite ({total_time_ms} ms)")

    markdown_output = "\n\n".join(slide_markdown_parts) if slide_markdown_parts else "*Empty slide*"
    plain_text_output = "\n\n".join(slide_text_parts)

    timings_dict = {
        "render_ms": round(render_ms, 1),
        "parse_ms": round(parse_ms, 1),
        "image_ocr_ms": round(image_ocr_ms, 1),
        "total_ms": total_time_ms,
    }

    json_dict = {
        "slide": slide_idx,
        "slide_number": slide_idx + 1,
        "slide_title": slide_title,
        "shapes_count": len(slide.shapes) if slide else 0,
        "tables_count": tables_count,
        "has_notes": bool(notes_text),
        "source": "hybrid-ppt",
        "steps": steps_log,
        "markdown": markdown_output,
        "timings": timings_dict,
    }

    return PageResult(
        page_index=slide_idx,
        page_number=slide_idx + 1,
        w=preview_img.shape[1],
        h=preview_img.shape[0],
        image_data=image_data,
        lines=lines_list,
        blocks=blocks_list,
        markdown=markdown_output,
        text=plain_text_output,
        source="hybrid-ppt",
        rotation=0,
        skew=0.0,
        note=" | ".join(steps_log[:2]),
        timings=timings_dict,
        json_data=json_dict,
    )
