@echo off
title Install Auto-Start on PC Boot - ZoneHub
cd /d "%~dp0"

powershell -Command "Remove-Item \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SkyCommerce-Server.lnk\" -ErrorAction SilentlyContinue; Remove-Item \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Server.lnk\" -ErrorAction SilentlyContinue; $WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Service.lnk\"); $Shortcut.TargetPath = \"wscript.exe\"; $Shortcut.Arguments = \"`\"%~dp0Run-Background-Service.vbs`\"\"; $Shortcut.WorkingDirectory = \"%~dp0\"; $Shortcut.IconLocation = \"%~dp0ZoneHubBubble.exe,0\"; $Shortcut.Save()"

echo.
echo =========================================================
echo   [SUCCESS] ZoneHub is now set to AUTO-START on PC Boot!
echo.
echo   When your PC starts:
echo     1. ZoneHub Server starts in background.
echo     2. Online Tunnel activates automatically.
echo     3. Floating Desktop Bubble appears on your screen!
echo =========================================================
echo.
pause
