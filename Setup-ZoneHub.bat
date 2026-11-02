@echo off
title ZoneHub Master Setup
cd /d "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -Command "& { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $wizard = Join-Path '%~dp0' 'scripts\setup_wizard.ps1'; if (Test-Path $wizard) { & $wizard } else { Write-Host 'Error: setup_wizard.ps1 not found' -ForegroundColor Red } }"

pause

