@echo off
REM ─────────────────────────────────────────────────────────────────
REM IntrinsicFinEd — one-click backend startup for Windows
REM Double-click this file. Leave the window open while using the app.
REM ─────────────────────────────────────────────────────────────────

cd /d "%~dp0"

echo.
echo ============================================================
echo   IntrinsicFinEd API
echo ============================================================
echo.
echo Installing/updating Python dependencies (first run only)...
python -m pip install -q -r backend\requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] pip install failed. Make sure Python 3.10+ is installed:
    echo         python --version
    pause
    exit /b 1
)

echo.
echo Starting FastAPI on http://127.0.0.1:8000
echo Press Ctrl+C to stop.
echo.
echo Health check: http://127.0.0.1:8000/api/health
echo API docs:     http://127.0.0.1:8000/docs
echo.
echo ============================================================
echo.

python -m uvicorn backend.api:app --reload --port 8000 --host 127.0.0.1

pause
