@echo off
title ZoneHub - Connected Network Zone
cd /d "%~dp0"
echo ===================================================
echo   Starting ZoneHub & Team Collaboration Server...
echo ===================================================
echo.
if not exist "%~dp0server.exe" (
    echo [INFO] server.exe not found. Building now...
    call "%~dp0Build.bat"
)

server.exe
pause
