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
REM Resolve a REAL interpreter. Bare `python` is NOT on PATH on this machine, and
REM where it is present it is the Windows Store alias stub, which prints
REM "'python' is not recognized" and exits without running anything. The genuine
REM interpreter ships one directory down, under PythonSoftwareFoundation.Python.*.
set "PY="
for /d %%D in ("%LOCALAPPDATA%\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.*") do (
    if exist "%%D\python.exe" set "PY=%%D\python.exe"
)
if not defined PY (
    for /f "delims=" %%P in ('where py 2^>nul') do set "PY=py -3"
)
if not defined PY (
    echo.
    echo [ERROR] No Python interpreter found. Looked for:
    echo   %LOCALAPPDATA%\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.*\python.exe
    echo   the py launcher
    echo Install Python 3.10+, or edit this script with a full path.
    pause
    exit /b 1
)
echo Using %PY%

echo Installing/updating Python dependencies (first run only)...
"%PY%" -m pip install -q -r backend\requirements.txt
if errorlevel 1 (
    echo.
    echo [ERROR] pip install failed.
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

"%PY%" -m uvicorn backend.api:app --reload --port 8000 --host 127.0.0.1

pause
