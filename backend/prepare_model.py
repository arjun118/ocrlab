"""Model verification and download utility for Docker build and offline setups."""

import shutil
import sys
from pathlib import Path
from huggingface_hub import snapshot_download

REQUIRED_FILES = ("det.onnx", "rec.onnx", "meta.json")
ALLOW_PATTERNS = ["*.onnx", "*.json", "*.npz", "model.safetensors"]


def ensure_model(model_dir: Path | str = "/app/model", revision: str = "main") -> None:
    path = Path(model_dir)
    path.mkdir(parents=True, exist_ok=True)
    missing = [f for f in REQUIRED_FILES if not (path / f).exists()]
    if missing:
        print(f"Model files {missing} missing in {path}. Downloading Indra OCR ({revision} branch)...")
        snapshot_download(
            "datalab-to/indra-ocr",
            revision=revision,
            local_dir=str(path),
            allow_patterns=ALLOW_PATTERNS,
        )
        # Remove huggingface hub local .cache directory if created
        cache_dir = path / ".cache"
        if cache_dir.exists():
            shutil.rmtree(cache_dir, ignore_errors=True)
        print(f"Model download complete in {path}.")
    else:
        print(f"Using verified model files from {path}.")


if __name__ == "__main__":
    target = sys.argv[1] if len(sys.argv) > 1 else "/app/model"
    rev = sys.argv[2] if len(sys.argv) > 2 else "main"
    ensure_model(target, revision=rev)
