@echo off
title EVE Desktop
rem EVE Desktop launcher — double-click to open her deck.
rem She needs the brain running on Railway (she is, by default) and her token
rem in the Windows vault (already linked). No terminal knowledge required.
cd /d C:\dev\eve\desktop
if not exist "out\main\index.js" (
  echo Build missing - building her once, this takes about ten seconds...
  call npm run build
)
start "" "node_modules\electron\dist\electron.exe" .
exit /b 0
