@echo off
title Install Auto-Start on PC Boot - ZoneHub
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Server.lnk\"); $Shortcut.TargetPath = \"%~dp0Start-Share-Server.bat\"; $Shortcut.WorkingDirectory = \"%~dp0\"; $Shortcut.IconLocation = \"shell32.dll,13\"; $Shortcut.Save()"
echo.
echo =========================================================
echo   [SUCCESS] ZoneHub will now AUTO-START
echo   every time this PC is turned on!
echo =========================================================
echo.
pause
