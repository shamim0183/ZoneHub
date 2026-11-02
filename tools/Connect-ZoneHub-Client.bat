@echo off
title Connect to ZoneHub - Employee Client Setup
cd /d "%~dp0"
color 0b

echo ============================================================
echo      ZoneHub - Employee PC Desktop Client Setup
echo ============================================================
echo.

if not exist "%~dp0ZoneHubBubble.exe" (
    echo [INFO] ZoneHubBubble.exe not found. Building now...
    call "%~dp0Build.bat"
)

echo Connecting to ZoneHub on your network...
start "" "%~dp0ZoneHubBubble.exe" %*

echo.
echo ============================================================
echo  [SUCCESS] ZoneHub Desktop Bubble launched on your screen!
echo ============================================================
echo  - Click the floating circle anytime to open or minimize.
echo  - Right-click the circle to snap edges or change server URL.
echo ============================================================
echo.
timeout /t 3
