@echo off
title Stop SkyCommerce Media Hub
cd /d "%~dp0"

echo ===================================================================
echo   Stopping SkyCommerce Media Hub and Online Tunnel...
echo ===================================================================

taskkill /f /im server.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1

echo.
echo ===================================================================
echo   [SUCCESS] SkyCommerce Media Hub & Online Tunnel are STOPPED!
echo ===================================================================
echo.
timeout /t 3
