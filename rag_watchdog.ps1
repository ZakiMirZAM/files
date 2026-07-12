# ============================================================================
#  RAG server watchdog.
#  The RAG server (rag/server.py) is single-threaded aiohttp + the Claude Agent
#  SDK. A single wedged SDK request can freeze the whole server so /health stops
#  responding and ALL "Explain using AI" calls hang. server.py is untouchable
#  (SDK logic), so this external watchdog detects the freeze and restarts it.
#
#  Launched automatically by start_all.ps1. Runs for the life of the login
#  session. Logs to rag/watchdog.log.
# ============================================================================
$ROOT = "C:\Users\Zaki_Mir\Downloads\files"
$RAG_DIR = "$ROOT\rag"
$LOG = "$RAG_DIR\watchdog.log"
$HEALTH = "http://127.0.0.1:3001/health"
$CHECK_EVERY_SEC = 45
$HEALTH_TIMEOUT_SEC = 12
$FAILS_BEFORE_RESTART = 2   # consecutive failures before we act (avoids flapping)

function Log($msg) {
    $line = "$([DateTime]::Now.ToString('yyyy-MM-dd HH:mm:ss'))  $msg"
    Add-Content -Path $LOG -Value $line
}

function Restart-Rag {
    Log "RESTART: killing anything on :3001 and relaunching server.py"
    $conn = Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
    if ($conn) { Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 2 }
    Start-Process "python" -ArgumentList "server.py" -WorkingDirectory $RAG_DIR -WindowStyle Minimized
    # give it time to load the SDK + vault index before we start checking again
    Start-Sleep -Seconds 20
}

function Ensure-Proxy {
    # ai_proxy.py (port 3002) is a thin passthrough; if it died, /ask breaks.
    if (-not (Get-NetTCPConnection -LocalPort 3002 -State Listen -ErrorAction SilentlyContinue)) {
        Log "PROXY DOWN: relaunching ai_proxy.py"
        Start-Process "python" -ArgumentList "ai_proxy.py" -WorkingDirectory $RAG_DIR -WindowStyle Minimized
        Start-Sleep -Seconds 5
    }
}

Log "watchdog started (check every ${CHECK_EVERY_SEC}s, timeout ${HEALTH_TIMEOUT_SEC}s)"
$fails = 0
while ($true) {
    Start-Sleep -Seconds $CHECK_EVERY_SEC
    Ensure-Proxy
    $ok = $false
    try {
        $r = Invoke-WebRequest -Uri $HEALTH -UseBasicParsing -TimeoutSec $HEALTH_TIMEOUT_SEC
        if ($r.StatusCode -eq 200 -and $r.Content -match '"status"') { $ok = $true }
    } catch { $ok = $false }

    if ($ok) {
        if ($fails -gt 0) { Log "recovered after $fails failed check(s)" }
        $fails = 0
    } else {
        $fails++
        Log "health check FAILED ($fails/$FAILS_BEFORE_RESTART)"
        if ($fails -ge $FAILS_BEFORE_RESTART) {
            Restart-Rag
            $fails = 0
        }
    }
}
