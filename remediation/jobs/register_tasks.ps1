<#
.SYNOPSIS
    Register (or remove) the Phase 5 standing-automation scheduled tasks.

.DESCRIPTION
    Creates four tasks under the \IntrinsicFinEd\ Task Scheduler folder, all
    invoking the production DB (financials.db) post-swap:

        UniverseSync  weekly   Monday 07:00
        FilingsWatch  daily    07:30
        MarketWeekly  weekly   Saturday 08:00
        BulkSweep     quarterly 15th of Feb / May / Aug / Nov at 09:00

    The first three use the ScheduledTasks module (which has native Daily/Weekly
    triggers). BulkSweep uses schtasks.exe /SC MONTHLY /M FEB,MAY,AUG,NOV, since
    the ScheduledTasks module in PowerShell 5.1 has no monthly/yearly trigger
    cmdlet; that produces the four quarter-month yearly triggers. All four live
    in the same Task Scheduler store, so -Unregister removes them uniformly.

    The real interpreter is taken from -PythonExe, or from python_path.txt
    (written by `python remediation/jobs/_jobslib.py`, which records
    sys.executable — the real python, never the broken WindowsApps alias).
    Passing -PythonExe also (re)writes python_path.txt for next time.

.PARAMETER PythonExe
    Full path to the real python.exe. Defaults to the contents of
    python_path.txt beside this script.

.PARAMETER Unregister
    Remove the four tasks instead of creating them.

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File register_tasks.ps1 -PythonExe "C:\Program Files\WindowsApps\...\python3.11.exe"

.EXAMPLE
    powershell -ExecutionPolicy Bypass -File register_tasks.ps1 -Unregister
#>

param(
    [string]$PythonExe = "",
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"

# ── paths (all $PSScriptRoot-relative) ────────────────────────────────────────
$JobsDir  = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $JobsDir "..\..")).Path
$Db       = Join-Path $RepoRoot "financials.db"
$PyPathFile = Join-Path $JobsDir "python_path.txt"
$TaskFolder = "\IntrinsicFinEd\"

$TaskNames = @("UniverseSync", "FilingsWatch", "MarketWeekly", "BulkSweep")

# ── unregister path ───────────────────────────────────────────────────────────
if ($Unregister) {
    foreach ($name in $TaskNames) {
        $full = "$TaskFolder$name"
        try {
            Unregister-ScheduledTask -TaskName $name -TaskPath $TaskFolder -Confirm:$false -ErrorAction Stop
            Write-Host "removed $full"
        } catch {
            Write-Host "not present (skipped): $full"
        }
    }
    return
}

# ── resolve the real interpreter ──────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
    if (Test-Path $PyPathFile) {
        $PythonExe = (Get-Content $PyPathFile -Raw).Trim()
    }
}
if ([string]::IsNullOrWhiteSpace($PythonExe)) {
    Write-Error "No python resolved. Pass -PythonExe <path>, or create python_path.txt by running: python `"$JobsDir\_jobslib.py`""
    return
}
if (-not (Test-Path $PythonExe)) {
    Write-Error "PythonExe not found: $PythonExe"
    return
}
if ($PythonExe -like "*WindowsApps*python.exe") {
    Write-Warning "PythonExe looks like the WindowsApps alias, which breaks scheduled tasks. Use the real interpreter path."
}
# Persist for next time (this is the 'orchestrator writes python_path.txt' step).
Set-Content -Path $PyPathFile -Value $PythonExe -Encoding utf8
Write-Host "using python: $PythonExe"

if (-not (Test-Path $Db)) {
    Write-Warning "Production DB not found yet at $Db (tasks will run against it post-swap)."
}

# ── shared settings + principal ───────────────────────────────────────────────
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
    -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

function Register-Job {
    param(
        [string]$Name,
        [string]$Script,
        [Parameter(Mandatory = $true)] $Trigger
    )
    $scriptPath = Join-Path $JobsDir $Script
    $arg = "`"$scriptPath`" `"$Db`""
    $action = New-ScheduledTaskAction -Execute $PythonExe -Argument $arg -WorkingDirectory $RepoRoot
    Register-ScheduledTask `
        -TaskName $Name `
        -TaskPath $TaskFolder `
        -Action $action `
        -Trigger $Trigger `
        -Settings $Settings `
        -Principal $Principal `
        -Force | Out-Null
    Write-Host "registered $TaskFolder$Name"
}

# ── the three module-trigger tasks ────────────────────────────────────────────
Register-Job -Name "UniverseSync" -Script "universe_sync.py" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Monday -At "07:00")

Register-Job -Name "FilingsWatch" -Script "filings_watch.py" `
    -Trigger (New-ScheduledTaskTrigger -Daily -At "07:30")

Register-Job -Name "MarketWeekly" -Script "market_weekly.py" `
    -Trigger (New-ScheduledTaskTrigger -Weekly -DaysOfWeek Saturday -At "08:00")

# ── BulkSweep: quarterly on the 15th of Feb/May/Aug/Nov via schtasks.exe ───────
# The ScheduledTasks module (PS 5.1) has no monthly trigger cmdlet, so this uses
# schtasks. /SC MONTHLY with /M FEB,MAY,AUG,NOV /D 15 realises the four yearly
# quarter-month triggers. It lands in the same store, so -Unregister removes it.
$bulkScript = Join-Path $JobsDir "bulk_sweep.py"
$bulkCmd = "`"$PythonExe`" `"$bulkScript`" `"$Db`""
$bulkTaskName = "$TaskFolder" + "BulkSweep"
schtasks.exe /Create /TN $bulkTaskName /TR $bulkCmd /SC MONTHLY /M FEB,MAY,AUG,NOV /D 15 /ST 09:00 /F | Out-Null
if ($LASTEXITCODE -eq 0) {
    Write-Host "registered $bulkTaskName (quarterly 15th Feb/May/Aug/Nov 09:00)"
} else {
    Write-Warning "schtasks failed to create BulkSweep (exit $LASTEXITCODE)"
}

Write-Host ""
Write-Host "Done. Review under Task Scheduler -> $TaskFolder"
Write-Host "Note: freshness_monitor.py is run on demand or chained after FilingsWatch; it is not one of the four registered tasks."
