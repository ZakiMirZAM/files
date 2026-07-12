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
python -m uvicorn backend.api:app --host 127.0.0.1 --port 8000 --workers 1 --log-level info --proxy-headers --forwarded-allow-ips=127.0.0.1
