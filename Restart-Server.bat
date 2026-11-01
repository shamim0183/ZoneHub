@echo off
title Restart ZoneHub Server
cd /d "%~dp0"

echo ===================================================
echo   Restarting ZoneHub Server...
echo ===================================================

taskkill /f /im server.exe >nul 2>&1
taskkill /f /im server_old.exe >nul 2>&1
ping 127.0.0.1 -n 4 >nul

if exist server_old.exe del /f /q server_old.exe >nul 2>&1

:: Apply pending update if server_new.exe exists
if exist server_new.exe (
    echo Applying server update...
    copy /y server_new.exe server.exe >nul
    del /f /q server_new.exe >nul 2>&1
    echo [UPDATED] New server.exe applied!
)

echo Starting ZoneHub server.exe...
start "ZoneHub Server" /d "%~dp0" "%~dp0server.exe"

echo.
echo ===================================================
echo   [SUCCESS] ZoneHub has been restarted!
echo   Open browser: http://localhost:8080
echo   Press Ctrl+Shift+R in browser to force refresh!
echo ===================================================
ping 127.0.0.1 -n 3 >nul
