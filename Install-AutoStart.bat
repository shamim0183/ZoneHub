@echo off
title Install Auto-Start on PC Boot
powershell -Command "$WshShell = New-Object -ComObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut(\"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SkyCommerce-Server.lnk\"); $Shortcut.TargetPath = \"%~dp0Start-Share-Server.bat\"; $Shortcut.WorkingDirectory = \"%~dp0\"; $Shortcut.IconLocation = \"shell32.dll,13\"; $Shortcut.Save()"
echo.
echo =========================================================
echo   [SUCCESS] SkyCommerce Media Hub will now AUTO-START
echo   every time this PC is turned on!
echo =========================================================
echo.
pause
