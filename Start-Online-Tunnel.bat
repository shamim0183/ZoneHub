@echo off
title ZoneHub - Online Internet Tunnel
cd /d "%~dp0"

echo ==================================================================
echo   Starting Cloudflare Public Tunnel for ZoneHub...
echo ==================================================================
echo.

set CF="%~dp0cloudflared.exe"
if not exist %CF% set CF="C:\Program Files (x86)\cloudflared\cloudflared.exe"
if not exist %CF% set CF="C:\Program Files\cloudflared\cloudflared.exe"

if not exist %CF% (
    echo [INFO] Cloudflare tunnel client (cloudflared.exe) not found.
    echo Downloading official standalone cloudflared.exe from Cloudflare...
    powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object System.Net.WebClient).DownloadFile('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', '%~dp0cloudflared.exe')"
    if exist "%~dp0cloudflared.exe" (
        set CF="%~dp0cloudflared.exe"
        echo [SUCCESS] Downloaded cloudflared.exe successfully!
    ) else (
        echo [ERROR] Could not automatically download cloudflared.exe.
        echo You can download it manually from:
        echo https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
        pause
        exit /b 1
    )
)

echo Connecting to Cloudflare Global Edge Network...
echo (Please wait a few seconds for your secure public HTTPS link)
echo.

del /f /q "%~dp0cloudflared.log" >nul 2>&1
echo Tunnel active! Output is also synced to cloudflared.log for ZoneHub.
%CF% tunnel --url http://localhost:8080 --logfile "%~dp0cloudflared.log"
pause
