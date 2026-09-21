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

    All four are registered with -AllowStartIfOnBatteries and
    -DontStopIfGoingOnBatteries, since the Windows battery defaults silently kill
    these jobs on a laptop. Each action runs through run_job.cmd (beside this
    script), which rolls a log past 5 MB to <log>.1, writes a timestamped
    start/end header, appends stdout and stderr to
    remediation\jobs\logs\<TaskName>.log (*.log is git-ignored), and propagates
    the job's exit code so a failed run shows as failed in the task history.

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
$LogDir     = Join-Path $JobsDir "logs"
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
        # Tolerate a BOM left by an older Set-Content -Encoding utf8 write: a
        # leading U+FEFF makes the path fail Test-Path for no visible reason.
        $PythonExe = (Get-Content $PyPathFile -Raw).Trim().TrimStart([char]0xFEFF)
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
# WriteAllText with UTF8Encoding($false), NOT Set-Content -Encoding utf8: in
# PowerShell 5.1 that switch writes a BOM, and every reader of this file then has
# to strip a stray U+FEFF before the path resolves.
[IO.File]::WriteAllText($PyPathFile, $PythonExe, (New-Object Text.UTF8Encoding($false)))
Write-Host "using python: $PythonExe"

if (-not (Test-Path $Db)) {
    Write-Warning "Production DB not found yet at $Db (tasks will run against it post-swap)."
}

# ── log directory (stdout/stderr of every job lands here) ─────────────────────
New-Item -ItemType Directory -Force -Path $LogDir | Out-Null

# ── shared settings + principal ───────────────────────────────────────────────
$Settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Hours 12) `
    -MultipleInstances IgnoreNew
$Principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

$Runner = Join-Path $JobsDir "run_job.cmd"
if (-not (Test-Path $Runner)) {
    Write-Error "run_job.cmd not found beside this script at $Runner"
    return
}

function Get-JobArgument {
    # run_job.cmd appends a timestamped header, rolls a log past 5 MB to .1, runs
    # the job with stdout/stderr appended, and propagates the exit code. Keeping
    # that logic in the .cmd keeps this argument short (schtasks caps /TR at 261
    # characters) and leaves it readable in the Task Scheduler UI.
    param([string]$Name, [string]$Script)
    $scriptPath = Join-Path $JobsDir $Script
    $logPath = Join-Path $LogDir "$Name.log"
    return "`"$Name`" `"$PythonExe`" `"$scriptPath`" `"$Db`" `"$logPath`""
}

function Register-Job {
    param(
        [string]$Name,
        [string]$Script,
        [Parameter(Mandatory = $true)] $Trigger
    )
    $arg = Get-JobArgument -Name $Name -Script $Script
    $action = New-ScheduledTaskAction -Execute $Runner -Argument $arg -WorkingDirectory $RepoRoot
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
$bulkArg = Get-JobArgument -Name "BulkSweep" -Script "bulk_sweep.py"
$bulkTaskName = "$TaskFolder" + "BulkSweep"
# schtasks caps /TR at 261 characters, so create the monthly trigger with a
# PLACEHOLDER action and set the real one (and the module $Settings: battery
# flags, StartWhenAvailable, 12h limit) immediately afterwards. The
# ScheduleByMonth trigger survives the update.
#
# If that second step fails, the task survives with the placeholder action:
# Task Scheduler then runs a bare cmd.exe every quarter, reports success, and
# the sweep silently never happens. So the update is guarded AND the result is
# read back; a task still holding the placeholder is removed rather than left
# looking healthy.
schtasks.exe /Create /TN $bulkTaskName /TR "cmd.exe" /SC MONTHLY /M FEB,MAY,AUG,NOV /D 15 /ST 09:00 /F | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Warning "schtasks failed to create BulkSweep (exit $LASTEXITCODE)"
} else {
    $bulkOk = $false
    try {
        $bulkAction = New-ScheduledTaskAction -Execute $Runner -Argument $bulkArg -WorkingDirectory $RepoRoot
        Set-ScheduledTask -TaskName "BulkSweep" -TaskPath $TaskFolder -Action $bulkAction -Settings $Settings -ErrorAction Stop | Out-Null
        $bulkOk = $true
    } catch {
        Write-Warning "BulkSweep action update failed: $($_.Exception.Message)"
    }

    $final = $null
    try {
        $final = (Get-ScheduledTask -TaskName "BulkSweep" -TaskPath $TaskFolder -ErrorAction Stop).Actions | Select-Object -First 1
    } catch {
        Write-Warning "BulkSweep could not be read back: $($_.Exception.Message)"
    }
    $isPlaceholder = ($null -eq $final) -or
                     ([string]::IsNullOrWhiteSpace($final.Arguments)) -or
                     ($final.Execute -eq "cmd.exe")
    if ($bulkOk -and -not $isPlaceholder) {
        Write-Host "registered $bulkTaskName (quarterly 15th Feb/May/Aug/Nov 09:00)"
    } else {
        try {
            Unregister-ScheduledTask -TaskName "BulkSweep" -TaskPath $TaskFolder -Confirm:$false -ErrorAction Stop
            Write-Host "removed $bulkTaskName (it still held the cmd.exe placeholder)"
        } catch {
            Write-Warning "could not remove the placeholder BulkSweep task: $($_.Exception.Message)"
        }
        Write-Error "BulkSweep was NOT registered: its action never moved off the cmd.exe placeholder. Re-run this script as the same user, then confirm the action under Task Scheduler -> $TaskFolder."
    }
}

Write-Host ""
Write-Host "Done. Review under Task Scheduler -> $TaskFolder"
Write-Host "Note: freshness_monitor.py is run on demand or chained after FilingsWatch; it is not one of the four registered tasks."
