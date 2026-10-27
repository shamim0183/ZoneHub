@echo off
title Build ZoneHub Server and Desktop Bubble
cd /d "%~dp0"

echo ===================================================
echo   Compiling ZoneHub Server and Desktop Bubble...
echo ===================================================
taskkill /f /im server.exe >nul 2>&1
taskkill /f /im ZoneHubBubble.exe >nul 2>&1

set "CSC=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if not exist "%CSC%" (
    set "CSC=C:\Windows\Microsoft.NET\Framework\v4.0.30319\csc.exe"
)

if not exist "%CSC%" (
    echo [ERROR] C# Compiler [csc.exe] not found in .NET Framework v4.0!
    echo Please make sure .NET Framework 4.0 or higher is enabled.
    pause
    exit /b 1
)

echo Using C# Compiler: %CSC%
echo.
echo [1/2] Compiling server.exe...
"%CSC%" /target:exe /optimize+ /r:System.IO.Compression.dll /r:System.IO.Compression.FileSystem.dll /out:server.exe server.cs
if %ERRORLEVEL% NEQ 0 (
    echo [ERROR] Failed to compile server.exe!
    pause
    exit /b 1
)

echo.
echo [2/2] Compiling ZoneHubBubble.exe (Desktop Floating Circle)...
set "WPF_DIR=C:\Windows\Microsoft.NET\Framework64\v4.0.30319\WPF"
if not exist "%WPF_DIR%" (
    set "WPF_DIR=C:\Windows\Microsoft.NET\Framework\v4.0.30319\WPF"
)
"%CSC%" /target:winexe /optimize+ /r:System.dll /r:System.Core.dll /r:System.Drawing.dll /r:System.Windows.Forms.dll /r:"%WPF_DIR%\WindowsBase.dll" /r:"%WPF_DIR%\PresentationCore.dll" /r:"%WPF_DIR%\PresentationFramework.dll" /r:System.Xaml.dll /out:ZoneHubBubble.exe ZoneHubBubble.cs

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ===================================================
    echo  [SUCCESS] Compiled server.exe and ZoneHubBubble.exe!
    echo ===================================================
) else (
    echo.
    echo [ERROR] ZoneHubBubble build failed!
)

