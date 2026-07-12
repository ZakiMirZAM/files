@echo off
REM Production backend launcher (used by the NSSM service).
REM --workers 1 is MANDATORY: each worker would duplicate the in-process
REM marketdata + weekly-PE scheduler threads and fragment the TTL cache.
REM Loopback only - nginx + the Cloudflare tunnel front this process.
REM Requires env vars (machine-level or set here): ADMIN_TOKEN, ALLOWED_ORIGINS,
REM FRED_API_KEY. See .env.example.
cd /d "%~dp0"
set ENV=production

echo Checking if port 8000 is already in use...
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul
if %ERRORLEVEL% EQU 0 (
    echo.
    echo ============================================================
    echo  A backend is ALREADY running on port 8000. Not starting a
    echo  second one - only one can use this port at a time.
    echo  If you want to restart it, close the other window first,
    echo  or find it in Task Manager and end it.
    echo ============================================================
    echo.
    pause
    exit /b 1
)

python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --workers 1 --log-level info --proxy-headers --forwarded-allow-ips=127.0.0.1

REM If uvicorn exits (crash, or you close it), keep the window open so any
REM error message is readable instead of vanishing instantly.
echo.
echo ============================================================
echo  Backend process has stopped. Scroll up to see why (error,
echo  crash, or you closed it). Press any key to close this window.
echo ============================================================
pause >nul
