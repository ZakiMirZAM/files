# Deterministic production build for Cloudflare Pages.
# Sets VITE_* as process env vars (highest Vite precedence) so a local
# .env.local (dev Convex URL) can't leak into the production bundle.
#
# Usage:
#   ./build-prod.ps1 -ConvexUrl "https://<prod>.convex.cloud"
# Then deploy ./dist to Cloudflare Pages (or let Pages build from git with the
# same three vars set in the dashboard).
param(
    [Parameter(Mandatory = $true)] [string] $ConvexUrl,
    [string] $ApiBase = "https://api.intrinsicfined.org",
    [string] $AiBase  = "https://ai.intrinsicfined.org"
)
$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$env:VITE_API_BASE   = $ApiBase
$env:VITE_AI_BASE    = $AiBase
$env:VITE_CONVEX_URL = $ConvexUrl

Write-Host "Building with:"
Write-Host "  VITE_API_BASE   = $env:VITE_API_BASE"
Write-Host "  VITE_AI_BASE    = $env:VITE_AI_BASE"
Write-Host "  VITE_CONVEX_URL = $env:VITE_CONVEX_URL"

npm run build

# Fail loudly if the dev API base leaked into the bundle.
if (Select-String -Path "dist/assets/*.js" -Pattern "localhost:8000" -Quiet) {
    Write-Error "Build contains localhost:8000 - dev env leaked into production bundle"
    exit 1
}
Write-Host "Build OK - dist/ ready to deploy" -ForegroundColor Green
