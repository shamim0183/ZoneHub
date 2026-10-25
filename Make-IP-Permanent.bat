@echo off
:: Self-elevation to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

title ZoneHub - Make IP Permanent (Static IP)
color 0b
echo ============================================================
echo         ZoneHub - Permanent Wi-Fi IP Configuration
echo ============================================================
echo.
echo Setting permanent IP for your Wi-Fi adapter:
echo   - Fixed IP:    192.168.0.118
echo   - Subnet Mask: 255.255.255.0
echo   - Gateway:     192.168.0.1
echo   - DNS:         8.8.8.8, 1.1.1.1
echo.

netsh interface ipv4 set address name="Wi-Fi" static 192.168.0.118 255.255.255.0 192.168.0.1 1
netsh interface ipv4 set dns name="Wi-Fi" static 8.8.8.8
netsh interface ipv4 add dns name="Wi-Fi" 1.1.1.1 index=2

echo.
echo [SUCCESS] Apnar PC-er Wi-Fi IP 192.168.0.118 permanent kora hoyeche!
echo Ekhon PC shutdown/restart dileo IP r change hobe na.
echo.
echo Sob employee-ra erpor theke aie link-e 24 ghonta access korte parbe:
echo http://192.168.0.118:8080/
echo ============================================================
echo.
pause
