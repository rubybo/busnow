# Деплой BusNow на HB.BY

## 1. SEO перед выкладкой

```bash
npm run sitemap
npm run build
```

Проверьте: `https://busnow.online/robots.txt`, `https://busnow.online/sitemap.xml`, Open Graph в исходнике главной.

## 2. Сборка

```bash
npm run build
```

- Фронт: `frontend/dist/`
- API (Next standalone): `backend/.next/standalone/`

## 3. FTP

1. Скопируйте `deploy/env.example` → `deploy/.env.local`
2. Укажите **FTP_HOST** из письма HB.BY (часто `serverXXXX.hb.by`)
3. Пароль **не храните в git** — только в `.env.local`

```bash
npm run deploy:ftp
```

- `FTP_FRONT_DIR` — корень сайта `busnow.online` (статика из `frontend/dist`)
- `FTP_API_DIR` — корень Node.js-приложения API (содержимое `backend/.next/standalone`)

## 4. Один запуск: `node app.js` (фронт + API)

В корне проекта на сервере должны быть:

- `app.js`
- `frontend/dist/` (после `npm run build:web`)
- `backend/.next/standalone/` (после `npm run build:api`)

В панели HB.BY для **busnow.online**:

| Поле | Значение |
|------|----------|
| Файл запуска / команда | `node app.js` или `app.js` |
| Корневая папка | каталог, где лежит `app.js` |
| `PORT` | задаёт панель (не меняйте вручную, если уже подставлен) |
| `NODE_ENV` | `production` |

Локальная проверка после сборки:

```bash
npm run build
npm start
```

Сайт на `http://127.0.0.1:3000`, API проксируется на `/api`.

Опционально:

- `BUSNOW_STATIC_DIR` — другой путь к `dist`
- `BUSNOW_API_DIR` — другой путь к standalone
- `BUSNOW_API_PORT` — внутренний порт API (по умолчанию 3001)

## 5. Node.js API отдельным доменом (альтернатива)

1. Домен **api.busnow.online** (или прокси `/api` на тот же домен)
2. Обработчик **Node.js 20+**
3. **Файл запуска:** `server.js`
4. **Корневая папка:** каталог после заливки `FTP_API_DIR`
5. В панели: **Npm install** → **Перезапустить Node.js**
6. Переменные окружения:
   - `NODE_ENV=production`
   - `CRON_SECRET=…` (для `/api/cron/reminders`)
   - `PORT` — как в панели

Папка `data/` с `busnow.sqlite` должна лежать рядом с `server.js` (скрипт `prepare-standalone` копирует при сборке).

## 6. Фронт и API на одном домене (без app.js)

В `.htaccess` на фронте включите прокси `/api` на порт Node (см. комментарий в `frontend/public/.htaccess`) **или** в `vite`/сборке оставьте относительные запросы `/api` и настройте reverse proxy в панели.

## 7. Напоминания (cron)

Каждую минуту (планировщик HB.BY):

```http
POST https://api.busnow.online/api/cron/reminders
Authorization: Bearer <CRON_SECRET>
```

## 8. SSL

Включите Let's Encrypt для `busnow.online` и `www` / `api` в панели HB.BY.
