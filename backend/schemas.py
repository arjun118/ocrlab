"""Pydantic schemas for request and response models."""

from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field


class ProcessOptions(BaseModel):
    mode: Literal["auto", "ocr", "text"] = Field(
        default="auto",
        description="auto: text layer + OCR fallback; ocr: pure visual OCR; text: digital text layer only",
    )
    math: bool = Field(
        default=False,
        description="Enable LaTeX math detection and inline formula transcription ($...$)",
    )
    furniture: bool = Field(
        default=False,
        description="Keep running page headers and footers in markdown output",
    )
    model_order: bool = Field(
        default=False,
        description="Re-order text-layer lines using the order model instead of PDF order",
    )
    image_ocr: bool = Field(
        default=True,
        description="OCR text embedded inside images on digital text-layer pages",
    )
    dpi: float = Field(
        default=200.0,
        description="Resolution for rendering PDF pages to image (dots per inch)",
    )
    password: Optional[str] = Field(
        default=None,
        description="Optional password for encrypted PDF files",
    )


class LineItem(BaseModel):
    box: List[float] = Field(..., description="[x0, y0, x1, y1] coordinates")
    text: str = Field(..., description="Detected text for this line")
    conf: float = Field(..., description="Confidence score between 0.0 and 1.0")


class BlockItem(BaseModel):
    label: str = Field(
        ...,
        description="Block label: Text, Section-Header, Page-Header, Page-Footer, List-Group, Table, Caption, Footnote, Table-Of-Contents, Form",
    )
    box: List[float] = Field(..., description="[x0, y0, x1, y1] bounding box")
    text: str = Field(default="", description="Text contained in block")


class PageResult(BaseModel):
    page_index: int
    page_number: int
    w: int
    h: int
    image_data: Optional[str] = None
    lines: List[LineItem] = []
    blocks: List[BlockItem] = []
    markdown: str = ""
    text: str = ""
    source: str = "ocr"  # "text", "ocr", "hybrid", "error"
    rotation: int = 0
    skew: float = 0.0
    note: str = ""
    timings: Dict[str, float] = {}
    json_data: Dict[str, Any] = {}


class UploadResponse(BaseModel):
    doc_id: str
    filename: str
    file_type: str
    total_pages: int
    file_size_bytes: int


class ConvertAllResponse(BaseModel):
    doc_id: str
    filename: str
    total_pages: int
    markdown: str
    text: str
    pages: List[PageResult]
    total_time_ms: float


class SampleItem(BaseModel):
    id: str
    name: str
    description: str
    filename: str


class BatchFileResponse(BaseModel):
    filename: str
    status: str
    pages: int = 0
    total_time_ms: float = 0.0
    markdown: str = ""
    text: str = ""
    error: Optional[str] = None


class BatchResponse(BaseModel):
    total_files: int
    successful_files: int
    total_pages: int
    total_time_ms: float
    results: List[BatchFileResponse]


class DocumentSummary(BaseModel):
    doc_id: str
    file_hash: str
    filename: str
    file_type: str
    total_pages: int
    file_size_bytes: int
    cached_pages_count: int = 0
    has_full_conversion: int = 0
    created_at: float
    last_accessed: float
