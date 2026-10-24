@echo off
title Setup Auto-Start at Boot (No Login Needed)
cd /d "%~dp0"

:: Check for Administrative Privileges and Elevate if needed
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo Requesting Administrator permission to install Boot Task...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

echo ===================================================================
echo   Installing SkyCommerce Media Hub Boot Service...
echo   (This will run automatically at PC boot WITHOUT needing to login)
echo ===================================================================
echo.

powershell -Command "$action = New-ScheduledTaskAction -Execute '%~dp0server.exe' -WorkingDirectory '%~dp0'; $trigger = New-ScheduledTaskTrigger -AtStartup; Register-ScheduledTask -TaskName 'SkyCommerceMediaHub_Boot' -Action $action -Trigger $trigger -User 'NT AUTHORITY\SYSTEM' -RunLevel Highest -Force"

echo Opening Windows Firewall for Port 8080...
netsh advfirewall firewall delete rule name="SkyCommerce_Port_8080" >nul 2>&1
netsh advfirewall firewall add rule name="SkyCommerce_Port_8080" dir=in action=allow protocol=TCP localport=8080 profile=any >nul 2>&1
netsh advfirewall firewall delete rule name="SkyCommerce_Media_Hub_Prog" >nul 2>&1
netsh advfirewall firewall add rule name="SkyCommerce_Media_Hub_Prog" dir=in action=allow program="%~dp0server.exe" profile=any >nul 2>&1

if %errorLevel% equ 0 (
    echo.
    echo ===================================================================
    echo   [SUCCESS] SkyCommerce Media Hub is now set to START AT BOOT!
    echo   [SUCCESS] Windows Firewall port 8080 is unblocked for all devices!
    echo.
    echo   Even if NO ONE logs into this PC, the server will start
    echo   automatically as soon as the PC is powered on!
    echo ===================================================================
) else (
    echo.
    echo   [ERROR] Failed to register task. Please try running as Administrator.
)

echo.
pause
