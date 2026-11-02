@echo off
title Install Auto-Start on PC Boot - ZoneHub
cd /d "%~dp0"

echo =========================================================
echo       ZoneHub - Auto-Start Setup & Installation          
echo =========================================================
echo.
echo   Would you like to choose which Drive or Folder to host
echo   your files in (e.g. C: vs D: drive)?
echo.
set /p CHOICEDRIVE="   Configure Storage Drive now? (Y/N) [Default: N]: "
if /i "%CHOICEDRIVE%"=="Y" (
    call "%~dp0Setup-Storage-Drive.bat"
)

echo.
echo   Installing Windows Startup shortcut...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$dir = '%~dp0'.TrimEnd('\'); $wsPath = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Service.lnk'; Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\SkyCommerce-Server.lnk') -ErrorAction SilentlyContinue; Remove-Item (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Server.lnk') -ErrorAction SilentlyContinue; $WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut($wsPath); $Shortcut.TargetPath = 'wscript.exe'; $Shortcut.Arguments = '\"' + (Join-Path $dir 'Run-Background-Service.vbs') + '\"'; $Shortcut.WorkingDirectory = $dir; if (Test-Path (Join-Path $dir 'ZoneHubBubble.exe')) { $Shortcut.IconLocation = (Join-Path $dir 'ZoneHubBubble.exe') + ',0' }; $Shortcut.Save()"

echo.
echo =========================================================
echo   [SUCCESS] ZoneHub is now set to AUTO-START on PC Boot!
echo.
echo   Starting ZoneHub background service now...
wscript.exe "%~dp0Run-Background-Service.vbs"
echo.
echo   When your PC starts:
echo     1. ZoneHub Server starts in background.
echo     2. Online Tunnel activates automatically.
echo     3. Floating Desktop Bubble appears on your screen!
echo.
echo   Open in browser: http://localhost:8080
echo =========================================================
echo.
timeout /t 3 >nul
