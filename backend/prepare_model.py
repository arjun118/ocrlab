"""Model verification and download utility for Docker build and offline setups."""

import sys
from pathlib import Path
from huggingface_hub import snapshot_download

REQUIRED_FILES = ("det.onnx", "rec.onnx", "meta.json")


def ensure_model(model_dir: Path | str = "/app/model") -> None:
    path = Path(model_dir)
    path.mkdir(parents=True, exist_ok=True)
    missing = [f for f in REQUIRED_FILES if not (path / f).exists()]
    if missing:
        print(f"Model files {missing} missing in {path}. Downloading Indra OCR v3.1.1...")
        snapshot_download("datalab-to/indra-ocr", revision="v3.1.1", local_dir=str(path))
        print(f"Model download complete in {path}.")
    else:
        print(f"Using verified model files from {path}.")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "/app/model"
    ensure_model(target)
