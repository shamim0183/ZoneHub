@echo off
title Set Custom Short Online URL - Media Hub
cd /d "%~dp0"

echo ==================================================================
echo   Set Custom Minimalist / Short Online URL
echo ==================================================================
echo.
echo Currently active URL in online_url.txt:
if exist online_url.txt (
    type online_url.txt
    echo.
) else (
    echo (No custom URL set yet)
    echo.
)

echo.
echo Examples of easy-to-type minimalist URLs:
echo   1. Cloudflare Custom Domain: https://hub.skycommerce.com
echo   2. Localtunnel Subdomain:    https://skyhub.loca.lt
echo   3. Ngrok Static Domain:      https://skyhub.ngrok-free.app
echo.
set /p USER_URL="Enter your custom short URL (or press Enter to cancel): "

if "%USER_URL%"=="" (
    echo [INFO] No changes made.
    pause
    exit /b 0
)

echo %USER_URL%> online_url.txt
echo.
echo ==================================================================
echo  [SUCCESS] Online URL updated successfully to:
echo  %USER_URL%
echo ==================================================================
echo All connected devices on PC and Mobile will now see this link!
echo.
pause
