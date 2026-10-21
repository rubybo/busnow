@echo off
cd /d "%~dp0"

echo BusNow FTP upload to /www/busnow.online/ on 176.60.210.120
echo Turn ProtonVPN off before continuing.
echo This uploads:
echo   frontend\dist  to  /www/busnow.online/dist/
echo   deploy\busnow-release.tar.gz
echo   app.cjs and package.json
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js and run this file again.
  pause
  exit /b 1
)

if not exist "app.cjs" (
  echo Missing app.cjs
  pause
  exit /b 1
)

if not exist "frontend\dist\index.html" (
  echo Missing frontend\dist\index.html. Run: npm run build:web
  pause
  exit /b 1
)

if not exist "deploy\busnow-release.tar.gz" (
  echo Missing deploy\busnow-release.tar.gz
  pause
  exit /b 1
)

if not exist "deploy\.env.local" (
  echo Missing deploy\.env.local
  pause
  exit /b 1
)

node deploy\run-ftp-entry.mjs
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo Upload failed. Code %ERR%.
) else (
  echo Upload finished.
  echo Automatic npm install is OK: package.json has no dependencies.
  echo In ISPmanager set the Node.js directory to:
  echo   /var/www/u41977-8185/data/www/busnow.online
  echo Startup command:
  echo   npm start
  echo Then restart Node.js.
)
pause
exit /b %ERR%
