@echo off
title Remove Boot Task - SkyCommerce Media Hub
cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ===================================================================
echo   Removing Boot Auto-Start Task...
echo ===================================================================

schtasks /delete /tn "SkyCommerceMediaHub_Boot" /f >nul 2>&1

echo Stopping any running server and tunnel processes...
taskkill /f /im server.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1

echo.
echo ===================================================================
echo   [SUCCESS] Boot Task removed! The server will no longer auto-start.
echo   [SUCCESS] Current running server and tunnel have been stopped.
echo ===================================================================
echo.
pause
