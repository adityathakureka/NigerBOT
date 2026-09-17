@echo off
title Teams LAN Desktop Workspace
cls
echo ===================================================
echo     TEAMS LAN MULTI-DESKTOP CHAT WORKSPACE
echo ===================================================
echo.
echo Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not found in PATH!
    echo Please ensure Node.js is installed.
    pause
    exit /b 1
)

echo Starting server...
echo.
start "" "http://localhost:3000"
node server.js
pause
