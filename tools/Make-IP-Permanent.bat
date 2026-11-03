@echo off
:: Self-elevation to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Requesting Administrator privileges...
    powershell -Command "Start-Process cmd -ArgumentList '/c \"\"%~f0\"\"' -Verb RunAs"
    exit /b
)

title ZoneHub - Make Office Wi-Fi/LAN IP Permanent (Static IP)
color 0b
echo ============================================================
echo      ZoneHub - Permanent Office Wi-Fi / LAN IP Setup
echo ============================================================
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$cfg = Get-NetIPConfiguration | Where-Object { $_.IPv4DefaultGateway -ne $null } | Select-Object -First 1; " ^
    "if (-not $cfg) { Write-Host '[ERROR] No active network connection with a default gateway found!' -ForegroundColor Red; exit 1 }; " ^
    "$alias = $cfg.InterfaceAlias; " ^
    "$currentIp = ($cfg.IPv4Address | Select-Object -First 1).IPAddress; " ^
    "$gw = $cfg.IPv4DefaultGateway.NextHop; " ^
    "$prefix = ($cfg.IPv4Address | Select-Object -First 1).PrefixLength; " ^
    "$mask = switch ($prefix) { 24 {'255.255.255.0'} 16 {'255.255.0.0'} 8 {'255.0.0.0'} default {'255.255.255.0'} }; " ^
    "Write-Host ('Active Adapter: ' + $alias) -ForegroundColor Cyan; " ^
    "Write-Host ('Current IP:     ' + $currentIp) -ForegroundColor Green; " ^
    "Write-Host ('Gateway:        ' + $gw); " ^
    "Write-Host ('Subnet Mask:    ' + $mask); " ^
    "Write-Host ''; " ^
    "$chosenIp = Read-Host ('Enter Permanent IP to lock [Press ENTER for current: ' + $currentIp + ']'); " ^
    "if ([string]::IsNullOrWhiteSpace($chosenIp)) { $chosenIp = $currentIp }; " ^
    "$chosenIp = $chosenIp.Trim(); " ^
    "Write-Host ''; " ^
    "Write-Host ('Configuring Permanent Static IP: ' + $chosenIp + ' on ' + $alias + '...') -ForegroundColor Yellow; " ^
    "netsh interface ipv4 set address name=`\"$alias`\" static $chosenIp $mask $gw 1; " ^
    "netsh interface ipv4 set dns name=`\"$alias`\" static $gw; " ^
    "netsh interface ipv4 add dns name=`\"$alias`\" 8.8.8.8 index=2; " ^
    "Write-Host ''; " ^
    "Write-Host ('[SUCCESS] Permanent IP ' + $chosenIp + ' is locked permanently!') -ForegroundColor Green; " ^
    "Write-Host 'Windows will NEVER request a new DHCP IP. Even after router reboot or PC restart,'; " ^
    "Write-Host 'ZoneHub will ALWAYS stay on this exact same IP.'; " ^
    "Write-Host ''; " ^
    "Write-Host 'All coworkers & phones can connect 24/7 at:'; " ^
    "Write-Host ('  http://' + $chosenIp + ':8080/') -ForegroundColor Cyan; " ^
    "Write-Host ('  (Or via PC Name: http://' + $env:COMPUTERNAME + ':8080/)') -ForegroundColor Yellow; "

echo.
echo ============================================================
echo To revert back to automatic DHCP IP later, run:
echo   tools\Revert-To-Automatic-IP.bat
echo ============================================================
echo.
pause
