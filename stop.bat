@echo off
setlocal
set "NANHU_PS=%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe"
if not exist "%NANHU_PS%" set "NANHU_PS=pwsh.exe"
"%NANHU_PS%" -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop.ps1"
if errorlevel 1 pause
