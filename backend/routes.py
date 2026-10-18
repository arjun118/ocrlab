import json
from pathlib import Path
from typing import List

from fastapi import APIRouter, File, HTTPException, Query, Response, UploadFile

import indra_ocr
from backend import database as db
from backend.model_service import SAMPLE_CATALOG, service
from backend.schemas import (
    BatchFileResponse,
    BatchResponse,
    ConvertAllResponse,
    DocumentSummary,
    PageResult,
    ProcessOptions,
    SampleItem,
    UploadResponse,
)

router = APIRouter(prefix="/api", tags=["OCR API"])


@router.get("/health")
def health_check():
    """Returns backend system status and loaded model details."""
    recent_docs = db.list_documents(limit=5)
    return {
        "status": "online",
        "model": "datalab-to/indra-ocr",
        "parameters": "1M (Ultra-lightweight ONNX)",
        "threads": service.threads,
        "math_support": True,
        "cached_documents": len(recent_docs),
        "version": getattr(indra_ocr, "__version__", "0.3.2"),
    }


@router.get("/history", response_model=List[DocumentSummary])
def list_document_history(limit: int = 30):
    """List previously uploaded documents and processed results."""
    docs = db.list_documents(limit=limit)
    return [
        DocumentSummary(
            doc_id=d["doc_id"],
            file_hash=d["file_hash"],
            filename=d["filename"],
            file_type="ppt" if d.get("is_pdf") == 2 else ("pdf" if d.get("is_pdf") == 1 else "image"),
            total_pages=d["total_pages"],
            file_size_bytes=d["file_size"],
            cached_pages_count=d.get("cached_pages_count", 0),
            has_full_conversion=d.get("has_full_conversion", 0),
            created_at=d["created_at"],
            last_accessed=d["last_accessed"],
        )
        for d in docs
    ]


@router.get("/document/{doc_id}", response_model=UploadResponse)
def get_document_info(doc_id: str):
    """Retrieve document metadata by doc_id and touch last_accessed."""
    try:
        record = service.get_document(doc_id)
        db.touch_document(doc_id)
        file_type = "ppt" if getattr(record, "is_ppt", False) else ("pdf" if record.is_pdf else "image")
        return UploadResponse(
            doc_id=record.doc_id,
            filename=record.filename,
            file_type=file_type,
            total_pages=record.total_pages,
            file_size_bytes=record.file_path.stat().st_size if record.file_path.exists() else 0,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.delete("/document/{doc_id}")
def remove_document(doc_id: str):
    """Delete a document from database and file storage."""
    db.delete_document(doc_id)
    service.documents.pop(doc_id, None)
    return {"status": "deleted", "doc_id": doc_id}


@router.delete("/history")
def clear_all_history():
    """Clear all document history, cached page results, and uploaded files."""
    db.clear_all_documents()
    service.documents.clear()
    return {"status": "cleared", "message": "All history deleted"}


@router.get("/samples", response_model=List[SampleItem])
def list_samples():
    """List available sample documents."""
    return SAMPLE_CATALOG


@router.post("/samples/load/{sample_id}", response_model=UploadResponse)
def load_sample_document(sample_id: str):
    """Load a sample document directly into active session."""
    try:
        record = service.load_sample(sample_id)
        file_type = "ppt" if getattr(record, "is_ppt", False) else ("pdf" if record.is_pdf else "image")
        return UploadResponse(
            doc_id=record.doc_id,
            filename=record.filename,
            file_type=file_type,
            total_pages=record.total_pages,
            file_size_bytes=record.file_path.stat().st_size,
        )
    except (KeyError, FileNotFoundError) as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to load sample: {e}")


@router.post("/upload", response_model=UploadResponse)
async def upload_file(file: UploadFile = File(...)):
    """Upload a document (PDF, PPT, or image) to be processed."""
    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")
        record = service.register_file(file.filename or "uploaded_file", content)
        file_type = "ppt" if getattr(record, "is_ppt", False) else ("pdf" if record.is_pdf else "image")
        return UploadResponse(
            doc_id=record.doc_id,
            filename=record.filename,
            file_type=file_type,
            total_pages=record.total_pages,
            file_size_bytes=len(content),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload processing error: {e}")


@router.post("/document/{doc_id}/page/{page_idx}", response_model=PageResult)
def process_single_page(
    doc_id: str,
    page_idx: int,
    options: ProcessOptions,
    include_image: bool = Query(default=True),
):
    """Run Indra OCR on a single page with customizable pipeline parameters."""
    try:
        result = service.process_page(
            doc_id=doc_id,
            page_idx=page_idx,
            opts=options,
            include_image=include_image,
        )
        return result
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except IndexError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR execution failed: {e}")


@router.post("/document/{doc_id}/convert-all", response_model=ConvertAllResponse)
def convert_entire_document(
    doc_id: str,
    options: ProcessOptions,
    max_pages: int = Query(default=0, ge=0),
):
    """Convert all pages in document, aggregating Markdown, text, and JSON results."""
    try:
        doc = service.get_document(doc_id)
        pages, full_md, full_txt, total_time_ms = service.convert_all(
            doc_id=doc_id,
            opts=options,
            max_pages=max_pages,
        )
        return ConvertAllResponse(
            doc_id=doc_id,
            filename=doc.filename,
            total_pages=len(pages),
            markdown=full_md,
            text=full_txt,
            pages=pages,
            total_time_ms=total_time_ms,
        )
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Document conversion failed: {e}")


@router.get("/document/{doc_id}/export/{format_type}")
def export_document_result(
    doc_id: str,
    format_type: str,
    mode: str = "auto",
    math: bool = False,
    furniture: bool = False,
    model_order: bool = False,
    image_ocr: bool = True,
    dpi: float = 200.0,
):
    """Export document as raw markdown (.md), plain text (.txt), or structured JSON (.json)."""
    try:
        doc = service.get_document(doc_id)
        opts = ProcessOptions(
            mode=mode,
            math=math,
            furniture=furniture,
            model_order=model_order,
            image_ocr=image_ocr,
            dpi=dpi,
        )
        pages, full_md, full_txt, _ = service.convert_all(doc_id=doc_id, opts=opts)

        base_name = Path(doc.filename).stem

        if format_type.lower() == "md" or format_type.lower() == "markdown":
            return Response(
                content=full_md,
                media_type="text/markdown",
                headers={"Content-Disposition": f'attachment; filename="{base_name}_indra.md"'},
            )
        elif format_type.lower() == "txt" or format_type.lower() == "text":
            return Response(
                content=full_txt,
                media_type="text/plain",
                headers={"Content-Disposition": f'attachment; filename="{base_name}_indra.txt"'},
            )
        elif format_type.lower() == "json":
            json_output = {
                "filename": doc.filename,
                "total_pages": len(pages),
                "options": opts.dict(),
                "pages": [p.json_data for p in pages],
            }
            return Response(
                content=json.dumps(json_output, indent=2, ensure_ascii=False),
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="{base_name}_indra.json"'},
            )
        else:
            raise HTTPException(status_code=400, detail="Invalid format. Supported: md, txt, json")
    except KeyError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Export failed: {e}")


@router.post("/batch/convert", response_model=BatchResponse)
async def batch_convert(
    files: List[UploadFile] = File(...),
    mode: str = "auto",
    math: bool = False,
    furniture: bool = False,
    model_order: bool = False,
    image_ocr: bool = True,
    dpi: float = 200.0,
):
    """Batch convert multiple documents in one API call."""
    opts = ProcessOptions(
        mode=mode,
        math=math,
        furniture=furniture,
        model_order=model_order,
        image_ocr=image_ocr,
        dpi=dpi,
    )

    results: List[BatchFileResponse] = []
    total_pages = 0
    total_time_ms = 0.0
    successful_count = 0

    for file in files:
        try:
            content = await file.read()
            if not content:
                results.append(
                    BatchFileResponse(
                        filename=file.filename or "unknown",
                        status="error",
                        error="Empty file content",
                    )
                )
                continue

            rec = service.register_file(file.filename or "batch_file", content)
            pages, full_md, full_txt, time_taken = service.convert_all(rec.doc_id, opts)

            total_pages += len(pages)
            total_time_ms += time_taken
            successful_count += 1

            results.append(
                BatchFileResponse(
                    filename=rec.filename,
                    status="success",
                    pages=len(pages),
                    total_time_ms=time_taken,
                    markdown=full_md,
                    text=full_txt,
                )
            )
        except Exception as e:
            results.append(
                BatchFileResponse(
                    filename=file.filename or "unknown",
                    status="error",
                    error=str(e),
                )
            )

    return BatchResponse(
        total_files=len(files),
        successful_files=successful_count,
        total_pages=total_pages,
        total_time_ms=round(total_time_ms, 1),
        results=results,
    )
