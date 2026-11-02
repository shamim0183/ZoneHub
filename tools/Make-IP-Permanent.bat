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
echo         ZoneHub - Permanent Network IP Configuration
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1; " ^
    "if (-not $cfg) { Write-Host '[ERROR] No active network connection with a default gateway found!' -ForegroundColor Red; exit 1 }; " ^
    "$alias = $cfg.InterfaceAlias; " ^
    "$ip = ($cfg.IPv4Address | Select-Object -First 1).IPAddress; " ^
    "$gw = $cfg.IPv4DefaultGateway.NextHop; " ^
    "$prefix = ($cfg.IPv4Address | Select-Object -First 1).PrefixLength; " ^
    "$mask = switch ($prefix) { 24 {'255.255.255.0'} 16 {'255.255.0.0'} 8 {'255.0.0.0'} default {'255.255.255.0'} }; " ^
    "Write-Host ('Detected Active Adapter: ' + $alias); " ^
    "Write-Host ('  - Current IP:   ' + $ip); " ^
    "Write-Host ('  - Subnet Mask:  ' + $mask); " ^
    "Write-Host ('  - Gateway:      ' + $gw); " ^
    "Write-Host ('  - DNS:          8.8.8.8, 1.1.1.1'); " ^
    "Write-Host ''; " ^
    "Write-Host 'Setting permanent static IP configuration...' -ForegroundColor Yellow; " ^
    "netsh interface ipv4 set address name=`\"$alias`\" static $ip $mask $gw 1; " ^
    "netsh interface ipv4 set dns name=`\"$alias`\" static 8.8.8.8; " ^
    "netsh interface ipv4 add dns name=`\"$alias`\" 1.1.1.1 index=2; " ^
    "Write-Host ''; " ^
    "Write-Host ('[SUCCESS] Permanent Static IP configured for ' + $alias + '!') -ForegroundColor Green; " ^
    "Write-Host 'Even after PC restart or router reboot, this IP will stay permanently.'; " ^
    "Write-Host ''; " ^
    "Write-Host 'All employees can connect 24/7 at:'; " ^
    "Write-Host ('http://' + $ip + ':8080/') -ForegroundColor Cyan; "

echo ============================================================
echo.
pause
