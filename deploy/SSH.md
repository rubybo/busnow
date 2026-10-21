# BusNow через SSH (HB.BY / ISPmanager)

На тарифах HB.BY **SSH обычно есть** — включите в ISPmanager: **Настройки** → **SSH** / **Доступ по SSH** (или в карточке пользователя). Логин чаще всего как у FTP: `u41977-8185`, хост — IP или `server….hb.by`.

Путь к сайту (у вас):

```text
/var/www/u41977-8185/data/www/busnow.online
```

---

## 1. Подключение с Windows

```powershell
ssh u41977-8185@176.60.210.120
```

(порт 22, если в письме другой — `-p 2222`)

---

## 2. Сборка на своём ПК (как сейчас)

```bash
npm run build:web
npm run build:api
npm run package:api-zip
```

---

## 3. Заливка по SCP (вместо FTP)

Из корня репозитория (PowerShell, есть `scp`):

```powershell
$HOST = "176.60.210.120"
$USER = "u41977-8185"
$ROOT = "/var/www/u41977-8185/data/www/busnow.online"

# фронт (содержимое dist в корень сайта)
scp -r frontend/dist/* ${USER}@${HOST}:${ROOT}/

# точка входа и package.json
scp app.cjs deploy/package.production.json ${USER}@${HOST}:${ROOT}/
ssh ${USER}@${HOST} "mv ${ROOT}/package.production.json ${ROOT}/package.json"

# API — один архив
scp deploy/busnow-api.zip ${USER}@${HOST}:${ROOT}/
```

---

## 4. На сервере по SSH (распаковка и проверка)

```bash
cd /var/www/u41977-8185/data/www/busnow.online

# проверка, что app.cjs целый (должен начинаться с комментария или const http)
head -n 5 app.cjs

mkdir -p backend/.next/standalone
unzip -o busnow-api.zip -d backend/.next/standalone

# тестовый запуск (порт подставьте из панели Node или 3000)
export NODE_ENV=production
export PORT=3000
node app.cjs
```

Если в логе `[busnow] Сайт →` и нет SyntaxError — файлы на месте.

---

## 5. Постоянный запуск

**Вариант A — как сейчас:** в ISPmanager Node.js: рабочая папка = каталог с `app.cjs`, команда **`node app.cjs`** или **`npm start`**, без `npm install`.

**Вариант B — только SSH (если панель мешает):** если на тарифе разрешён **PM2** или свой процесс:

```bash
cd /var/www/u41977-8185/data/www/busnow.online
export NODE_ENV=production
export PORT=3000   # или порт, который проксирует nginx на домен
npx pm2 start app.cjs --name busnow
npx pm2 save
```

На shared-хостинге nginx **должен** проксировать `busnow.online` на ваш `PORT` — это часто настраивается только через панель (Node.js для домена). Тогда **A надёжнее**, а SSH — для заливки файлов и `unzip`.

---

## 6. Обновление одной командой с ПК (пример)

```powershell
npm run build:web; npm run package:api-zip
npm run deploy:ftp:front
npm run deploy:ftp:api
```

Или замените FTP на `scp` из п.3.

---

## 7. Если `app.cjs` с ошибкой на строке 3

Файл на сервере **битый** (обрезан или вставлен кусок JSON). Перезалейте:

```powershell
scp app.cjs u41977-8185@176.60.210.120:/var/www/u41977-8185/data/www/busnow.online/app.cjs
```

Проверка: `ssh … "head -3 …/app.cjs"` — третья строка не должна быть просто `},`.
