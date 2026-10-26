@echo off
title Remove Auto-Start - ZoneHub
powershell -Command "Remove-Item \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Service.lnk\" -ErrorAction SilentlyContinue; Remove-Item \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\ZoneHub-Server.lnk\" -ErrorAction SilentlyContinue; Remove-Item \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SkyCommerce-Server.lnk\" -ErrorAction SilentlyContinue; Remove-Item \"$env:ProgramData\Microsoft\Windows\Start Menu\Programs\Startup\ZoneHubBubble.lnk\" -ErrorAction SilentlyContinue"
powershell -Command "[Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run', `$true).DeleteValue('ZoneHubBubble', `$false)"

echo.
echo =========================================================
echo   [SUCCESS] Auto-start removed successfully.
echo =========================================================
echo.
pause
