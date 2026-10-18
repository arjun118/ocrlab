#!/usr/bin/env bash
set -euo pipefail

# Prepare model files into ./model for Docker build and local offline use
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST_DIR="${REPO_ROOT}/model"
mkdir -p "$DEST_DIR"

HF_CACHE_DIR="${HOME}/.cache/huggingface/hub/models--datalab-to--indra-ocr"

if [ -d "$HF_CACHE_DIR/snapshots" ]; then
    SNAPSHOT_DIR=$(find "$HF_CACHE_DIR/snapshots" -mindepth 1 -maxdepth 1 -type d | head -n 1)
    if [ -n "$SNAPSHOT_DIR" ]; then
        echo "Found Hugging Face model cache at: $SNAPSHOT_DIR"
        echo "Copying model files into $DEST_DIR..."
        cp -L -r "$SNAPSHOT_DIR"/* "$DEST_DIR"/
        echo "Done. Models ready in $DEST_DIR"
        exit 0
    fi
fi

echo "Hugging Face cache not found locally. Downloading to $DEST_DIR..."
uv run python -m backend.prepare_model "$DEST_DIR"
echo "Done. Models ready in $DEST_DIR"
