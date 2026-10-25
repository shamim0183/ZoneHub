@echo off
:: Self-elevation to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

title ZoneHub - Revert to Automatic IP (DHCP)
color 0a
echo ============================================================
echo         ZoneHub - Revert to Automatic DHCP IP
echo ============================================================
echo.
echo Reverting Wi-Fi to Automatic DHCP (Default router assigned IP)...

netsh interface ipv4 set address name="Wi-Fi" source=dhcp
netsh interface ipv4 set dns name="Wi-Fi" source=dhcp

echo.
echo [SUCCESS] Wi-Fi IP abar automatic (DHCP) kora hoyeche!
echo ============================================================
echo.
pause
