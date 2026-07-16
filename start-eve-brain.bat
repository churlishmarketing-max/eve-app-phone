@echo off
title EVE brain
rem EVE brain launcher — double-click to start her, or let the "EVE Brain"
rem scheduled task run this at logon. Keeps a console window with her logs.
cd /d C:\dev\eve\brain
rem If she's already running, don't double-start (port 8787 would collide).
netstat -an | findstr /r ":8787.*LISTENING" >nul 2>&1
if %errorlevel%==0 (
  echo EVE brain is already running on :8787 — nothing to do.
  timeout /t 5 >nul
  exit /b 0
)
echo Starting EVE brain...
call npm start
rem If she crashes, keep the window open so the error is readable.
echo.
echo EVE brain exited. Press any key to close.
pause >nul
