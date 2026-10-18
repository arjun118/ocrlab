.PHONY: backend frontend run-backend run-frontend install test clean help

HOST ?= 0.0.0.0
PORT ?= 8000

help:
	@echo "Indra OCR Commands:"
	@echo "  make backend    Run FastAPI backend server on http://localhost:$(PORT)"
	@echo "  make frontend   Run Vite frontend dev server on http://localhost:5173"
	@echo "  make install    Install Python and Node dependencies"
	@echo "  make test       Run backend API health check"
	@echo "  make clean      Remove temporary files"

backend:
	uv run uvicorn backend.main:app --host $(HOST) --port $(PORT) --reload

run-backend: backend

frontend:
	npm --prefix frontend run dev

run-frontend: frontend

install:
	uv sync
	npm --prefix frontend install

test:
	uv run python -c "from fastapi.testclient import TestClient; from backend.main import app; c = TestClient(app); print(c.get('/api/health').json())"

clean:
	rm -rf /tmp/indra_ocr_uploads __pycache__ backend/__pycache__
