@echo off
title Remove Boot Task
cd /d "%~dp0"

net session >nul 2>&1
if %errorLevel% neq 0 (
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo Removing Boot Task...
schtasks /delete /tn "SkyCommerceMediaHub_Boot" /f >nul 2>&1
echo [SUCCESS] Boot Task removed.
pause
