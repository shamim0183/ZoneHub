@echo off
title ZoneHub - Connected Network Zone
cd /d "%~dp0"
echo ===================================================
echo   Starting ZoneHub in BACKGROUND (Persistent Mode)...
echo ===================================================
echo.
if not exist "%~dp0server.exe" (
    echo [INFO] server.exe not found. Building now...
    call "%~dp0Build.bat"
)

:: Launch silently in background so closing this window never stops the server
wscript.exe "%~dp0Run-Background-Service.vbs"

echo ===================================================
echo   [SUCCESS] ZoneHub is running in the BACKGROUND!
echo.
echo   You can safely CLOSE this window at any time!
echo   Closing this window will NOT stop ZoneHub.
echo.
echo   Access Links:
echo     Localhost:    http://localhost:8080
echo     To Stop:      Double-click Stop-Share-Server.bat
echo ===================================================
echo.
timeout /t 5
