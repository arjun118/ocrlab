"""Configuration settings for Indra OCR Backend."""

import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
PROJECT_DIR = BASE_DIR.parent
FRONTEND_DIR = PROJECT_DIR / "frontend"
SAMPLES_DIR = BASE_DIR / "samples"
TEMP_DIR = Path(os.environ.get("INDRA_TEMP_DIR", "/tmp/indra_ocr_uploads"))
TEMP_DIR.mkdir(parents=True, exist_ok=True)

# Persistent data directory for SQLite database and uploaded files
DATA_DIR = Path(os.environ.get("INDRA_DATA_DIR", PROJECT_DIR / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
FILES_DIR = DATA_DIR / "files"
FILES_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "indra_ocr.db"

# Threads for ONNX Runtime (CPU)
THREADS = int(os.environ.get("INDRA_THREADS", min(os.cpu_count() or 4, 8)))

# Model directory (container /app/model or local ./model)
MODEL_DIR = Path(os.environ.get("INDRA_OCR_MODEL_DIR", "/app/model" if Path("/app/model").exists() else PROJECT_DIR / "model"))
if MODEL_DIR.exists():
    os.environ["INDRA_OCR_MODEL_DIR"] = str(MODEL_DIR)

# Host and Port
HOST = os.environ.get("INDRA_HOST", "0.0.0.0")
PORT = int(os.environ.get("INDRA_PORT", 8000))

# Max side for page rendering preview sent to frontend
MAX_RENDER_SIDE = 1600

# Input limits (None = unlimited local processing)
MAX_FILE_SIZE_BYTES = None
MAX_PAGE_LIMIT = None

