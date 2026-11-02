@echo off
title Uninstall ZoneHub
cd /d "%~dp0"

echo ==================================================================
echo               ZoneHub - Uninstall & Cleanup Service               
echo ==================================================================
echo.
echo   This will:
echo     1. Stop ZoneHub background services.
echo     2. Remove Windows Auto-Start on PC boot.
echo     3. Remove Desktop shortcut.
echo.
echo   NOTE: Your shared files in storage will NOT be deleted.
echo.
set /p CONFIRM="Are you sure you want to uninstall? (Y/N) [Default: N]: "
if /i not "%CONFIRM%"=="Y" (
    echo Uninstall cancelled.
    timeout /t 2 >nul
    exit /b 0
)

echo.
echo Stopping services...
taskkill /f /im server.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im ZoneHubBubble.exe >nul 2>&1

echo Removing startup shortcuts...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Service.lnk') -Force -ErrorAction SilentlyContinue; Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\SkyCommerce-Server.lnk') -Force -ErrorAction SilentlyContinue; Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Server.lnk') -Force -ErrorAction SilentlyContinue; $desk = [Environment]::GetFolderPath('Desktop'); Remove-Item (Join-Path $desk 'ZoneHub.lnk') -Force -ErrorAction SilentlyContinue"

echo.
echo ==================================================================
echo   [SUCCESS] ZoneHub has been uninstalled!
echo   Auto-start removed. Services stopped.
echo ==================================================================
echo.
timeout /t 4 >nul

