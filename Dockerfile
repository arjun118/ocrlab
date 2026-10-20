# ----------------------------------------------------
# Stage 1: Build Frontend Single Page App
# ----------------------------------------------------
FROM node:22-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package.json ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# ----------------------------------------------------
# Stage 2: Python Virtualenv & Model Builder
# ----------------------------------------------------
FROM python:3.12-slim AS python-builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Install binutils for stripping binary shared libraries
RUN apt-get update && apt-get install -y --no-install-recommends \
    binutils \
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reproducible dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Copy dependency specifications and install into virtualenv using BuildKit cache
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev --no-install-project

# Copy model helper and download model weights (main branch) during build
COPY backend/prepare_model.py /app/backend/prepare_model.py
COPY model/ /app/model/
RUN --mount=type=cache,target=/root/.cache/huggingface \
    /app/.venv/bin/python -m backend.prepare_model /app/model main

# Strip binary shared libraries and clean bytecode caches to minimize size
RUN find /app/.venv -name "*.so*" -exec strip --strip-unneeded {} + 2>/dev/null || true \
    && find /app/.venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true \
    && find /app/.venv -name "*.pyc" -delete

# ----------------------------------------------------
# Stage 3: Minimal Final Runtime Image
# ----------------------------------------------------
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    INDRA_HOST=0.0.0.0 \
    INDRA_PORT=8000 \
    INDRA_OCR_MODEL_DIR=/app/model

# Install minimal headless LibreOffice (for PPT conversion) and graphics runtime libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    libreoffice-nogui \
    libgl1 \
    libglib2.0-0 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /usr/share/doc/* /usr/share/man/*

WORKDIR /app

# Copy stripped virtualenv from python-builder
COPY --from=python-builder /app/.venv /app/.venv

# Copy pre-downloaded model weights from python-builder
COPY --from=python-builder /app/model /app/model

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy application source
COPY backend/ /app/backend/

# Expose port and declare persistent volume for SQLite DB and uploaded files
EXPOSE 8000
VOLUME ["/app/data"]

CMD ["/app/.venv/bin/uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
