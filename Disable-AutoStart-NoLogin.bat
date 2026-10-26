@echo off
title Remove Boot Task - ZoneHub
cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ===================================================================
echo   Removing Boot Auto-Start Task...
echo ===================================================================

schtasks /delete /tn "ZoneHub_Boot" /f >nul 2>&1
schtasks /delete /tn "SkyCommerceMediaHub_Boot" /f >nul 2>&1

powershell -Command "Remove-Item \"$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\ZoneHubBubble.lnk\" -ErrorAction SilentlyContinue" >nul 2>&1

echo Stopping any running server, tunnel, and bubble processes...
taskkill /f /im server.exe >nul 2>&1
taskkill /f /im cloudflared.exe >nul 2>&1
taskkill /f /im ZoneHubBubble.exe >nul 2>&1

del /f /q "%~dp0cloudflared.log" >nul 2>&1

echo.
echo ===================================================================
echo   [SUCCESS] Boot Task removed! The server will no longer auto-start.
echo   [SUCCESS] Current running server, bubble, and tunnel have been stopped.
echo ===================================================================
echo.
pause
