@echo off
title Remove Auto-Start
powershell -Command "Remove-Item \"$env:APPDATA\Microsoft\Windows\Start Menu\Programs\Startup\SkyCommerce-Server.lnk\" -ErrorAction SilentlyContinue"
echo.
echo =========================================================
echo   [SUCCESS] Auto-start removed successfully.
echo =========================================================
echo.
pause
