@echo off
title Stop Share Server
echo Stopping Media Share Server...
taskkill /f /im server.exe >nul 2>&1
echo Server stopped successfully!
timeout /t 2 >nul
