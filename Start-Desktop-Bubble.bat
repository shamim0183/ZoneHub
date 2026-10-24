@echo off
title ZoneHub Desktop Bubble
cd /d "%~dp0"
if not exist ZoneHubBubble.exe (
    call Build.bat
)
start "" "%~dp0ZoneHubBubble.exe"
exit
