# ============================================================================
#  IntrinsicFinEd LOCAL site: start everything with one click.
#  Starts (in order): Ollama -> dev backend (8001) -> local AI server (3013)
#  -> page (Vite, 5173), then opens the Learn page.
#
#  The local book features (Books folder list, book AI, decks and tests from a
#  book) are switched on here with LOCAL_BOOKS=1, so there is nothing to remember.
#  Safe to run any time: anything already running is left alone.
#
#  This never touches the live site: production uses start_all.ps1 on ports
#  8000 / 3001 / 3002 / 8080, and the book routes stay off there.
# ============================================================================
$ErrorActionPreference = "Continue"
$ROOT = $PSScriptRoot
# The financial databases live in the main folder (they are not in git), so a
# worktree copy of the repo reads them from there.
$DATA = if (Test-Path "$ROOT\financials.db") { $ROOT } else { "C:\Users\Zaki_Mir\Downloads\files" }

$PYTHON = (Get-ChildItem "$env:LOCALAPPDATA\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.*\python.exe" -ErrorAction SilentlyContinue |
           Select-Object -First 1 -ExpandProperty FullName)
if (-not $PYTHON) {
    $PYTHON = "C:\Users\Zaki_Mir\AppData\Local\Microsoft\WindowsApps\PythonSoftwareFoundation.Python.3.11_qbz5n2kfra8p0\python.exe"
}

# Tries IPv4 and IPv6 loopback: Vite listens on "localhost", which Node binds to
# ::1 only, while the Python servers bind 127.0.0.1.
function Test-Port($port) {
    foreach ($addr in @("127.0.0.1", "::1")) {
        $family = if ($addr -eq "::1") { [System.Net.Sockets.AddressFamily]::InterNetworkV6 } else { [System.Net.Sockets.AddressFamily]::InterNetwork }
        $client = New-Object System.Net.Sockets.TcpClient($family)
        try { if ($client.ConnectAsync($addr, $port).Wait(1000) -and $client.Connected) { return $true } }
        catch { }
        finally { $client.Close() }
    }
    return $false
}

function Wait-Port($port, $label, $seconds = 90) {
    for ($i = 0; $i -lt $seconds; $i++) {
        if (Test-Port $port) { Write-Host "  [OK] $label is up (port $port)" -ForegroundColor Green; return $true }
        Start-Sleep -Seconds 1
    }
    Write-Host "  [!!] $label did NOT come up on port $port after ${seconds}s" -ForegroundColor Red
    return $false
}

# Starts a command in its own minimized PowerShell window with its own settings,
# so the window shows the server's log and closing it stops the server.
function Start-Window($title, $dir, $envVars, $command) {
    $sets = ($envVars.GetEnumerator() | ForEach-Object { "`$env:$($_.Key) = '$($_.Value)'" }) -join "; "
    $script = "`$Host.UI.RawUI.WindowTitle = '$title'; $sets; Set-Location '$dir'; $command"
    Start-Process powershell.exe -ArgumentList "-NoProfile", "-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $script -WindowStyle Minimized
}

Write-Host ""
Write-Host "=== IntrinsicFinEd local site ===" -ForegroundColor Cyan

# 1. Ollama (11434): embeddings for the AI's book-library search. Shared with the live site.
if (Test-Port 11434) { Write-Host "1. Ollama: already running" }
else {
    Write-Host "1. Ollama: starting..."
    Start-Process "C:\Users\Zaki_Mir\AppData\Local\Programs\Ollama\ollama.exe" -ArgumentList "serve" -WindowStyle Minimized
    Wait-Port 11434 "Ollama" 30 | Out-Null
}

# 2. Dev backend (8001): development mode, the book shelf on, every data writer off.
if (Test-Port 8001) { Write-Host "2. Local backend: already running" }
else {
    Write-Host "2. Local backend: starting..."
    Start-Window "IFE local backend 8001" $ROOT ([ordered]@{
        ENV = "development"; LOCAL_BOOKS = "1"; ALLOWED_ORIGINS = ""; ADMIN_TOKEN = "";
        FINANCIALS_DB = "$DATA\financials.db"; MARKET_DATA_DB = "$DATA\backend\market_data.db";
        RELATIONSHIP_MAPS_DB = "$DATA\backend\relationship_maps.db";
        DISABLE_WEEKLY_PE = "1"; DISABLE_MARKETDATA_REFRESH = "1"; DISABLE_BENCHMARK_WARM = "1"; DISABLE_CONNECTIONS_WARM = "1"
    }) "& '$PYTHON' -m uvicorn backend.api:app --host 127.0.0.1 --port 8001"
    Wait-Port 8001 "Local backend" 90 | Out-Null
}

# 3. Local AI server (3013): the same AI as the live site, plus the book tools.
if (Test-Port 3013) { Write-Host "3. Local AI server: already running" }
else {
    Write-Host "3. Local AI server: starting..."
    Start-Window "IFE local AI 3013" "$ROOT\rag" ([ordered]@{
        RAG_PORT = "3013"; LOCAL_BOOKS = "1"; RAG_VERIFY = "on"; RAG_VERIFY_EXPOSE = "0"; PYTHONUTF8 = "1"
    }) "& '$PYTHON' -u server.py"
    Wait-Port 3013 "Local AI server" 60 | Out-Null
}

# 4. The page (Vite, 5173), pointed at the two local servers above.
if (Test-Port 5173) { Write-Host "4. Local page: already running" }
else {
    Write-Host "4. Local page: starting..."
    Start-Window "IFE local page 5173" "$ROOT\frontend" ([ordered]@{
        VITE_API_BASE = "http://localhost:8001"; VITE_AI_BASE = "http://localhost:3013"
    }) "npx vite --port 5173 --strictPort"
    Wait-Port 5173 "Local page" 60 | Out-Null
}

Write-Host ""
Write-Host "Opening http://localhost:5173/app/learn" -ForegroundColor Cyan
Start-Process "http://localhost:5173/app/learn"
