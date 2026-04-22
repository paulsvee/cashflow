@echo off
cd /d "%~dp0"
start "" cmd /k "npm run dev -- -p 3009"
timeout /t 3 >nul
start "" "http://localhost:3009"
exit
