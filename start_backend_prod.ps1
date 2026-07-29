# Production backend launcher.
# --workers 1 is MANDATORY: each worker would duplicate the in-process
# marketdata + weekly-PE scheduler threads and fragment the TTL cache.
# Loopback only - nginx + the Cloudflare tunnel front this process.
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot
if (-not $env:ADMIN_TOKEN) {
    Write-Warning "ADMIN_TOKEN not set - admin routes will always return 403 (fail-closed)"
}
if (-not $env:ALLOWED_ORIGINS) {
    Write-Warning "ALLOWED_ORIGINS not set - CORS falls back to localhost dev origins"
}
$env:ENV = "production"

# Resolve a REAL interpreter. Bare `python` is NOT on PATH on this machine, and
# where it is present it is the Windows Store alias stub, which prints
# "'python' is not recognized" and exits without running anything. The Store
# package ships the genuine interpreter one directory down, under
# PythonSoftwareFoundation.Python.<version>. Glob for it rather than hardcoding a
# version, so a Python upgrade does not silently break the launcher.
$py = Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.*\python.exe" `
        -ErrorAction SilentlyContinue | Sort-Object FullName | Select-Object -Last 1 -ExpandProperty FullName
if (-not $py) { $py = (Get-Command py -ErrorAction SilentlyContinue).Source }
if (-not $py) {
    Write-Error "No Python interpreter found. Looked for PythonSoftwareFoundation.Python.*\python.exe under $env:LOCALAPPDATA\Microsoft\WindowsApps and the py launcher."
    exit 1
}
Write-Host "Using $py"
& $py -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --workers 1 --log-level info --proxy-headers --forwarded-allow-ips=127.0.0.1
