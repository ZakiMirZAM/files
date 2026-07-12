#!/bin/bash
# IntrinsicFinEd — one-click backend startup (macOS / Linux / Git Bash on Windows)
cd "$(dirname "$0")"

echo "============================================================"
echo "  IntrinsicFinEd API"
echo "============================================================"
echo
echo "Installing/updating Python dependencies..."
python -m pip install -q -r backend/requirements.txt || { echo "[ERROR] pip install failed"; exit 1; }

echo
echo "Starting FastAPI on http://127.0.0.1:8000"
echo "Press Ctrl+C to stop."
echo
echo "Health check: http://127.0.0.1:8000/api/health"
echo "API docs:     http://127.0.0.1:8000/docs"
echo
echo "============================================================"
echo

python -m uvicorn backend.api:app --reload --port 8000 --host 127.0.0.1
