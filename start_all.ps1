# ============================================================================
#  IntrinsicFinEd — start EVERYTHING with one click.
#  Starts (in order): Ollama -> backend -> RAG server -> nginx -> tunnel.
#  Safe to run any time: anything already running is detected and skipped.
#  A shortcut to this script lives in the Startup folder, so it also runs
#  automatically every time you log into Windows.
# ============================================================================
$ErrorActionPreference = "Continue"
$ROOT = "C:\Users\Zaki_Mir\Downloads\files"

# Bare `python` on this machine resolves to the WindowsApps Store alias, which
# fails to launch under Start-Process ("The system cannot find the file
# specified") and silently took the whole site down for over 24 hours. Resolve the
# REAL interpreter (the PythonSoftwareFoundation subpath), with the known-good path
# as a fallback.
$PYTHON = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.*\python.exe" -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName)
if (-not $PYTHON) {
    $PYTHON = "C:\Users\Zaki_Mir\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\python.exe"
}

function Test-Port($port) {
    return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Port($port, $label, $seconds = 60) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Test-Port $port) { Write-Host "  [OK] $label is up (port $port)" -ForegroundColor Green; return $true }
        Start-Sleep -Seconds 1
    }
    Write-Host "  [!!] $label did NOT come up on port $port after ${seconds}s" -ForegroundColor Red
    return $false
}

Write-Host ""
Write-Host "=== IntrinsicFinEd startup ===" -ForegroundColor Cyan

# 1. Ollama (port 11434) — embeddings for the AI features
if (Test-Port 11434) { Write-Host "1. Ollama: already running" }
else {
    Write-Host "1. Ollama: starting..."
    Start-Process "C:\Users\Zaki_Mir\AppData\Local\Programs\Ollama\ollama.exe" -ArgumentList "serve" -WindowStyle Minimized
    Wait-Port 11434 "Ollama" 30 | Out-Null
}

# 2. Backend (port 8000) — FastAPI analysis server
if (Test-Port 8000) { Write-Host "2. Backend: already running" }
else {
    Write-Host "2. Backend: starting (takes ~15s to load)..."
    Start-Process "cmd.exe" -ArgumentList "/c", "$ROOT\start_backend_prod.bat" -WorkingDirectory $ROOT -WindowStyle Minimized
    Wait-Port 8000 "Backend" 90 | Out-Null
}

# 3. RAG server (port 3001) — "Explain using AI"
if (Test-Port 3001) { Write-Host "3. RAG server: already running" }
else {
    Write-Host "3. RAG server: starting..."
    Start-Process $PYTHON -ArgumentList "server.py" -WorkingDirectory "$ROOT\rag" -WindowStyle Minimized
    Wait-Port 3001 "RAG server" 60 | Out-Null
}

# 3b. AI heartbeat proxy (port 3002) — keeps long /ask alive past Cloudflare's
#     100s edge timeout by streaming keep-alive bytes. nginx routes AI here.
if (Test-Port 3002) { Write-Host "3b. AI proxy: already running" }
else {
    Write-Host "3b. AI proxy: starting..."
    Start-Process $PYTHON -ArgumentList "ai_proxy.py" -WorkingDirectory "$ROOT\rag" -WindowStyle Minimized
    Wait-Port 3002 "AI proxy" 20 | Out-Null
}

# 4. nginx (port 8080) — reverse proxy / security layer
if (Test-Port 8080) { Write-Host "4. nginx: already running" }
else {
    Write-Host "4. nginx: starting..."
    Start-Process "C:\nginx\nginx.exe" -ArgumentList "-p", "C:\nginx\", "-c", "$ROOT\deploy\nginx.conf" -WindowStyle Hidden
    Wait-Port 8080 "nginx" 15 | Out-Null
}

# 5. Cloudflare tunnel — connects this PC to the internet
$tunnelRunning = Get-Process cloudflared -ErrorAction SilentlyContinue
if ($tunnelRunning) { Write-Host "5. Tunnel: already running" }
else {
    Write-Host "5. Tunnel: starting..."
    Start-Process "C:\Program Files (x86)\cloudflared\cloudflared.exe" `
        -ArgumentList "tunnel", "--config", "$ROOT\deploy\cloudflared-config.yml", "run" -WindowStyle Minimized
    Start-Sleep -Seconds 6
    if (Get-Process cloudflared -ErrorAction SilentlyContinue) { Write-Host "  [OK] Tunnel is up" -ForegroundColor Green }
    else { Write-Host "  [!!] Tunnel failed to start" -ForegroundColor Red }
}

# 6. Warm the economic cache so the first visitor never hits the slow cold
#    path (fresh backend takes ~35s on the first /api/economic call, which is
#    longer than the frontend's 30s timeout).
if (Test-Port 8000) {
    Write-Host "6. Warming the economic data cache (up to ~40s, one time)..."
    try {
        Invoke-WebRequest -Uri "http://127.0.0.1:8000/api/economic" -UseBasicParsing -TimeoutSec 90 | Out-Null
        Write-Host "  [OK] Cache warm - Economic page will load instantly" -ForegroundColor Green
    } catch {
        Write-Host "  [!!] Cache warm failed: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# 7. RAG watchdog — restarts the RAG server if it freezes (single wedged SDK
#    request can hang the whole single-threaded server; server.py is untouchable).
$wd = Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -like "*rag_watchdog.ps1*" }
if ($wd) { Write-Host "7. RAG watchdog: already running" }
else {
    Write-Host "7. RAG watchdog: starting..."
    Start-Process "powershell" -ArgumentList "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", "$ROOT\rag_watchdog.ps1" -WindowStyle Hidden
    Write-Host "  [OK] Watchdog running (auto-restarts RAG if it hangs)" -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Final check ===" -ForegroundColor Cyan
try {
    $r = Invoke-WebRequest -Uri "https://api.intrinsicfined.org/api/health" -UseBasicParsing -TimeoutSec 20
    Write-Host "PUBLIC SITE IS LIVE: https://intrinsicfined.org" -ForegroundColor Green
} catch {
    Write-Host "Public check failed - services may still be starting. Wait 30s and visit the site." -ForegroundColor Yellow
}
Write-Host ""
Write-Host "This window closes in 30 seconds."
Start-Sleep -Seconds 30
