"""SQLite database storage layer for Indra OCR persistence.

Stores:
1. Uploaded document metadata and file locations (deduplicated by SHA-256)
2. Per-page OCR results (keyed by doc_id, page_idx, and options_hash)
3. Full document conversion outputs (markdown, text, timings)
"""

import json
import sqlite3
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from backend.config import DB_PATH


def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), timeout=30.0)
    conn.row_factory = sqlite3.Row
    # Enable Write-Ahead Logging for fast concurrent reads & durability
    conn.execute("PRAGMA journal_mode = WAL;")
    conn.execute("PRAGMA synchronous = NORMAL;")
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def init_db():
    """Create tables and indexes if they do not exist."""
    with get_db_connection() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS documents (
            doc_id TEXT PRIMARY KEY,
            file_hash TEXT UNIQUE NOT NULL,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            file_size INTEGER NOT NULL,
            total_pages INTEGER NOT NULL,
            is_pdf INTEGER NOT NULL,
            created_at REAL NOT NULL,
            last_accessed REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS page_results (
            doc_id TEXT NOT NULL,
            page_idx INTEGER NOT NULL,
            options_hash TEXT NOT NULL,
            markdown TEXT NOT NULL,
            plain_text TEXT NOT NULL,
            json_data TEXT NOT NULL,
            timings_json TEXT NOT NULL,
            image_data TEXT,
            rotation INTEGER NOT NULL DEFAULT 0,
            skew REAL NOT NULL DEFAULT 0.0,
            source TEXT NOT NULL DEFAULT 'ocr',
            note TEXT NOT NULL DEFAULT '',
            w INTEGER NOT NULL DEFAULT 0,
            h INTEGER NOT NULL DEFAULT 0,
            lines_json TEXT NOT NULL DEFAULT '[]',
            blocks_json TEXT NOT NULL DEFAULT '[]',
            created_at REAL NOT NULL,
            PRIMARY KEY (doc_id, page_idx, options_hash),
            FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS document_conversions (
            doc_id TEXT NOT NULL,
            options_hash TEXT NOT NULL,
            total_pages INTEGER NOT NULL,
            total_time_ms REAL NOT NULL,
            markdown TEXT NOT NULL,
            plain_text TEXT NOT NULL,
            created_at REAL NOT NULL,
            PRIMARY KEY (doc_id, options_hash),
            FOREIGN KEY (doc_id) REFERENCES documents(doc_id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_docs_last_accessed ON documents(last_accessed DESC);
        CREATE INDEX IF NOT EXISTS idx_page_lookup ON page_results(doc_id, page_idx, options_hash);
        """)


# Initialize DB upon import
init_db()


def get_document_by_hash(file_hash: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE file_hash = ?", (file_hash,)
        ).fetchone()
        return dict(row) if row else None


def get_document(doc_id: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM documents WHERE doc_id = ?", (doc_id,)
        ).fetchone()
        return dict(row) if row else None


def list_documents(limit: int = 50) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        rows = conn.execute(
            """
            SELECT d.*, 
                   (SELECT COUNT(*) FROM page_results p WHERE p.doc_id = d.doc_id) as cached_pages_count,
                   (SELECT COUNT(*) FROM document_conversions c WHERE c.doc_id = d.doc_id) as has_full_conversion
            FROM documents d 
            ORDER BY d.last_accessed DESC 
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
        return [dict(r) for r in rows]


def upsert_document(
    doc_id: str,
    file_hash: str,
    filename: str,
    file_path: str,
    file_size: int,
    total_pages: int,
    is_pdf: int,
) -> Dict[str, Any]:
    now = time.time()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO documents (doc_id, file_hash, filename, file_path, file_size, total_pages, is_pdf, created_at, last_accessed)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id) DO UPDATE SET
                filename = excluded.filename,
                last_accessed = excluded.last_accessed
            """,
            (
                doc_id,
                file_hash,
                filename,
                str(file_path),
                file_size,
                total_pages,
                int(is_pdf),
                now,
                now,
            ),
        )
        return get_document(doc_id)  # type: ignore


def touch_document(doc_id: str):
    with get_db_connection() as conn:
        conn.execute(
            "UPDATE documents SET last_accessed = ? WHERE doc_id = ?",
            (time.time(), doc_id),
        )


def get_page_result(
    doc_id: str, page_idx: int, options_hash: str
) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute(
            """
            SELECT * FROM page_results 
            WHERE doc_id = ? AND page_idx = ? AND options_hash = ?
            """,
            (doc_id, page_idx, options_hash),
        ).fetchone()
        if not row:
            return None
        d = dict(row)
        return {
            "page_index": d["page_idx"],
            "page_number": d["page_idx"] + 1,
            "w": d["w"],
            "h": d["h"],
            "image_data": d["image_data"],
            "lines": json.loads(d["lines_json"]),
            "blocks": json.loads(d["blocks_json"]),
            "markdown": d["markdown"],
            "text": d["plain_text"],
            "source": d["source"],
            "rotation": d["rotation"],
            "skew": d["skew"],
            "note": d["note"],
            "timings": json.loads(d["timings_json"]),
            "json_data": json.loads(d["json_data"]),
        }


def save_page_result(
    doc_id: str,
    page_idx: int,
    options_hash: str,
    result_data: Dict[str, Any],
):
    now = time.time()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO page_results (
                doc_id, page_idx, options_hash, markdown, plain_text, 
                json_data, timings_json, image_data, rotation, skew, 
                source, note, w, h, lines_json, blocks_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id, page_idx, options_hash) DO UPDATE SET
                markdown = excluded.markdown,
                plain_text = excluded.plain_text,
                json_data = excluded.json_data,
                timings_json = excluded.timings_json,
                image_data = excluded.image_data,
                rotation = excluded.rotation,
                skew = excluded.skew,
                source = excluded.source,
                note = excluded.note,
                w = excluded.w,
                h = excluded.h,
                lines_json = excluded.lines_json,
                blocks_json = excluded.blocks_json
            """,
            (
                doc_id,
                page_idx,
                options_hash,
                result_data.get("markdown", ""),
                result_data.get("text", ""),
                json.dumps(result_data.get("json_data", {})),
                json.dumps(result_data.get("timings", {})),
                result_data.get("image_data"),
                result_data.get("rotation", 0),
                result_data.get("skew", 0.0),
                result_data.get("source", "ocr"),
                result_data.get("note", ""),
                result_data.get("w", 0),
                result_data.get("h", 0),
                json.dumps([ln.dict() if hasattr(ln, "dict") else ln for ln in result_data.get("lines", [])]),
                json.dumps([b.dict() if hasattr(b, "dict") else b for b in result_data.get("blocks", [])]),
                now,
            ),
        )


def get_conversion(doc_id: str, options_hash: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        row = conn.execute(
            "SELECT * FROM document_conversions WHERE doc_id = ? AND options_hash = ?",
            (doc_id, options_hash),
        ).fetchone()
        return dict(row) if row else None


def save_conversion(
    doc_id: str,
    options_hash: str,
    total_pages: int,
    total_time_ms: float,
    markdown: str,
    plain_text: str,
):
    now = time.time()
    with get_db_connection() as conn:
        conn.execute(
            """
            INSERT INTO document_conversions (doc_id, options_hash, total_pages, total_time_ms, markdown, plain_text, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(doc_id, options_hash) DO UPDATE SET
                total_pages = excluded.total_pages,
                total_time_ms = excluded.total_time_ms,
                markdown = excluded.markdown,
                plain_text = excluded.plain_text
            """,
            (doc_id, options_hash, total_pages, total_time_ms, markdown, plain_text, now),
        )


def delete_document(doc_id: str):
    doc = get_document(doc_id)
    if doc:
        path = Path(doc["file_path"])
        if path.exists() and not str(path).endswith("samples"):
            try:
                path.unlink()
            except OSError:
                pass
        with get_db_connection() as conn:
            conn.execute("DELETE FROM documents WHERE doc_id = ?", (doc_id,))


def clear_all_documents():
    """Delete all documents, pages, conversions, and uploaded files."""
    with get_db_connection() as conn:
        docs = conn.execute("SELECT file_path FROM documents").fetchall()
        for doc in docs:
            path = Path(doc["file_path"])
            if path.exists() and "samples" not in str(path):
                try:
                    path.unlink()
                except OSError:
                    pass
        conn.execute("DELETE FROM documents")
        conn.execute("DELETE FROM page_results")
        conn.execute("DELETE FROM document_conversions")
