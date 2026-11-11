@echo off
REM One click: start the IntrinsicFinEd LOCAL site (book features on) and open it.
REM The live site is started by START_WEBSITE.bat and is not touched by this.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_local.ps1"
timeout /t 5 >nul
