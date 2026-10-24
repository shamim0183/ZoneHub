@echo off
title Build ZoneHub Server
cd /d "%~dp0"

echo ===================================================
echo   Compiling ZoneHub Server (server.cs)...
echo ===================================================
echo.

set CSC="C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist %CSC% (
    set CSC="C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not exist %CSC% (
    echo [ERROR] C# Compiler (csc.exe) not found in .NET Framework v4.0!
    echo Please make sure .NET Framework 4.0 or higher is enabled.
    pause
    exit /b 1
)

echo Using C# Compiler: %CSC%
echo Compiling...
%CSC% /target:exe /optimize+ /out:server.exe server.cs

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo  [SUCCESS] Compiled server.exe successfully!
    echo ===================================================
) else (
    echo.
    echo [ERROR] Build failed! Check the errors above.
)
pause
