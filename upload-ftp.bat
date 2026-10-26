@echo off
cd /d "%~dp0"
chcp 65001 >nul

echo.
echo BusNow: сборка и заливка на /www/busnow.online/
echo Перед запуском выключите ProtonVPN. Иначе FTP обрывается.
echo.
echo Будет собрано и загружено:
echo   сайт                         в  /www/busnow.online/dist/
echo   app.cjs и package.json       в  /www/busnow.online/
echo   deploy\busnow-api.tar.gz     в  /www/busnow.online/
echo.
echo База на хостинге не заменяется.
echo После заливки в ISPmanager только перезапустите Node.js.
echo Способ подключения: Порт. Команда запуска: npm start.
echo npm install на хостинге нажимать не нужно.
echo При старте Node сам распакует новый API.
echo.

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js не найден. Установите Node.js и запустите этот файл снова.
  pause
  exit /b 1
)

rem Кэш npm по умолчанию на D:\npm-cache, туда запись запрещена.
set "npm_config_cache=%~dp0.npm-cache"
if not exist "%npm_config_cache%" mkdir "%npm_config_cache%"

if not exist "deploy\.env.local" (
  copy /y "deploy\env.example" "deploy\.env.local" >nul
  echo Нет пароля FTP.
  echo Откройте deploy\.env.local, впишите FTP_PASSWORD и запустите файл снова.
  pause
  exit /b 1
)

if not exist "frontend\node_modules\@heroicons\react\package.json" (
  echo Ставлю зависимости сайта...
  call npm install --prefix frontend
  if not exist "frontend\node_modules\@heroicons\react\package.json" (
    echo Не удалось поставить зависимости сайта. Заливка отменена.
    pause
    exit /b 1
  )
)

if not exist "node_modules\basic-ftp\package.json" (
  echo Ставлю программу заливки...
  call npm install
  if not exist "node_modules\basic-ftp\package.json" (
    echo Не удалось поставить программу заливки. Заливка отменена.
    pause
    exit /b 1
  )
)

echo Собираю сайт...
call npm run build:web
if errorlevel 1 (
  echo Сборка сайта не удалась. Заливка отменена.
  pause
  exit /b 1
)

if not exist "frontend\dist\index.html" (
  echo Нет frontend\dist\index.html
  pause
  exit /b 1
)

if not exist "frontend\dist\stops\18.html" (
  echo Нет страниц остановок в dist. Сборка SEO не завершилась.
  pause
  exit /b 1
)

echo Собираю API...
call npm run build:api
if errorlevel 1 (
  echo Сборка API не удалась. Заливка отменена.
  pause
  exit /b 1
)

echo Пакую API...
call npm run package:api-zip
if errorlevel 1 (
  echo Архив API не собрался. Заливка отменена.
  pause
  exit /b 1
)

if not exist "deploy\busnow-api.tar.gz" (
  echo Нет deploy\busnow-api.tar.gz
  pause
  exit /b 1
)

echo.
echo Заливаю по FTP...
node deploy\run-ftp-entry.mjs
set ERR=%ERRORLEVEL%
echo.
if not "%ERR%"=="0" (
  echo Заливка не удалась. Код %ERR%.
  echo Проверьте, что ProtonVPN выключен, и запустите файл ещё раз.
) else (
  echo Заливка закончилась.
  echo Теперь в ISPmanager: Node.js -^> Перезапустить.
  echo Больше ничего менять не нужно. Сайт поднимется сам.
)
pause
exit /b %ERR%
