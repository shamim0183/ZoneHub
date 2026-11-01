@echo off
title Restart ZoneHub Server
cd /d "%~dp0"

echo ===================================================
echo   Restarting ZoneHub Background Server...
echo ===================================================

:: Stop existing instances
taskkill /f /im server.exe >nul 2>&1
taskkill /f /im server_old.exe >nul 2>&1
ping 127.0.0.1 -n 3 >nul

if exist server_old.exe del /f /q server_old.exe >nul 2>&1

:: Apply pending update if server_new.exe exists
if exist server_new.exe (
    echo Applying server update...
    copy /y server_new.exe server.exe >nul
    del /f /q server_new.exe >nul 2>&1
    echo [UPDATED] New server.exe applied!
)

:: Launch server silently as a background service (No CMD window to accidentally close!)
echo Starting ZoneHub as a silent background service...
wscript.exe "%~dp0Run-Background-Service.vbs"

echo.
echo ===================================================
echo   [SUCCESS] ZoneHub is running in the BACKGROUND!
echo   It will keep running even after this window closes.
echo.
echo   Localhost:  http://localhost:8080
echo   To stop it anytime, double-click Stop-Share-Server.bat
echo   Press Ctrl + Shift + R in browser to force refresh!
echo ===================================================
ping 127.0.0.1 -n 4 >nul
