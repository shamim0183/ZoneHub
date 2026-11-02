@echo off
title ZoneHub - Storage Drive Setup
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $script = Join-Path '%~dp0' 'scripts\setup_storage.ps1'; if (Test-Path $script) { & $script } else { Write-Host 'Error: setup_storage.ps1 not found' -ForegroundColor Red } }"

pause

