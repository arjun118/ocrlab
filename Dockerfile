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
# Stage 2: Minimal Python Runtime
# ----------------------------------------------------
FROM python:3.12-slim-bookworm

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
    && rm -rf /var/lib/apt/lists/*

# Install uv for fast, reproducible dependency resolution
COPY --from=ghcr.io/astral-sh/uv:latest /uv /bin/uv

WORKDIR /app

# Copy dependency specifications and install into virtualenv
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# Copy application source
COPY backend/ /app/backend/

# Copy built frontend assets from stage 1
COPY --from=frontend-builder /app/frontend/dist /app/frontend/dist

# Copy local model weights into container
COPY model/ /app/model/

# Ensure required ONNX models are present in /app/model (downloads during build if missing)
RUN /app/.venv/bin/python -m backend.prepare_model /app/model

# Expose port and declare persistent volume for SQLite DB and uploaded files
EXPOSE 8000
VOLUME ["/app/data"]

CMD ["/app/.venv/bin/uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
