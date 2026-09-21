@echo off
rem run_job.cmd — the wrapper every \IntrinsicFinEd\ scheduled task runs.
rem
rem   run_job.cmd <TaskName> <python.exe> <script.py> <db path> <log path>
rem
rem It exists because the alternative is a single Task Scheduler argument
rem carrying log rotation, a timestamped header, a redirect and four quoted
rem paths. schtasks caps /TR at 261 characters, and that one-liner cannot be
rem read or corrected in the Task Scheduler UI. Here the logic is visible, and
rem the task argument stays short.
rem
rem Every job's stdout and stderr is appended to its own log, so:
rem   * a log past MAXBYTES is rolled to <log>.1 (one generation, overwritten)
rem     BEFORE the run, so a single sweep is never split across two files;
rem   * each run opens with a timestamped header, so a reader can tell where one
rem     run ends and the next begins. Without it a resumed multi-batch sweep
rem     reads as one endless run.
rem
rem The job's own exit code is propagated, so a job returning non-zero shows as
rem a failed task in the Task Scheduler history instead of a green one.

setlocal
set "TASKNAME=%~1"
set "PYEXE=%~2"
set "SCRIPT=%~3"
set "DBPATH=%~4"
set "LOGPATH=%~5"
set "MAXBYTES=5242880"

if "%LOGPATH%"=="" (
    echo run_job.cmd: missing arguments 1>&2
    exit /b 2
)

if exist "%LOGPATH%" (
    for %%F in ("%LOGPATH%") do (
        if %%~zF GTR %MAXBYTES% move /Y "%LOGPATH%" "%LOGPATH%.1" >nul
    )
)

echo.>> "%LOGPATH%"
echo [%date% %time%] === %TASKNAME% start ===>> "%LOGPATH%"

rem -u is load-bearing: redirected stdout is block-buffered, so a job killed
rem mid-run (the battery case) would otherwise lose everything it had printed.
"%PYEXE%" -u "%SCRIPT%" "%DBPATH%" >> "%LOGPATH%" 2>&1
set "RC=%ERRORLEVEL%"
echo [%date% %time%] === %TASKNAME% end (exit %RC%) ===>> "%LOGPATH%"
exit /b %RC%
