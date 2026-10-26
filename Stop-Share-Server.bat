@echo off
title Stop ZoneHub Server
cd /d "%~dp0"

echo ===================================================================
echo   Stopping ZoneHub and Online Tunnel...
echo ===================================================================

taskkill /f /im server.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im ZoneHubBubble.exe >nul 2>&1

del /f /q "%~dp0cloudflared.log" >nul 2>&1


echo.
echo ===================================================================
echo   [SUCCESS] ZoneHub & Online Tunnel are STOPPED!
echo ===================================================================
echo.
timeout /t 3
