@echo off
title SkyCommerce Media Hub - Online Internet Tunnel
cd /d "%~dp0"

echo ==================================================================
echo   Starting Cloudflare Public Tunnel for SkyCommerce Media Hub...
echo ==================================================================
echo.
echo Connecting to Cloudflare Global Edge Network...
echo (Please wait a few seconds for your secure public HTTPS link)
echo.

set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist %CF% (
    set CF="C:\Program Files\cloudflared\cloudflared.exe"
)

if not exist %CF% (
    echo [ERROR] cloudflared.exe not found!
    pause
    exit /b 1
)

%CF% tunnel --url http://localhost:8080
pause
