@echo off
REM One-click launcher for the whole IntrinsicFinEd website.
REM Double-click this file to start everything. Safe to run twice -
REM anything already running is skipped.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start_all.ps1"
