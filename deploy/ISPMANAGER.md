# BusNow в ISPmanager (HB.BY)

## Ошибка `can't cd to /var/www/.../busnow.online` и `EACCES ... /usr/local/mgr5/package.json`

Панель **не нашла каталог приложения** (`cd` упал) и запустила **npm** из системной папки ISPmanager — так делать не нужно.

### Что сделать

1. **Файловый менеджер** → откройте сайт, где лежат `app.js` и `index.html`.
2. Клик по **`app.js`** → **Свойства** / путь — скопируйте **реальный** каталог (у HB.BY часто это  
   `/var/www/u41977-8185/data/www/busnow.online`, но если `cd` падает — путь другой, например без `data` или другое имя папки).
3. **Node.js** для домена `busnow.online`:
   - **Рабочая / корневая директория** — только этот путь из п.2 (где точно есть `app.js`).
   - **Запуск:** `node app.cjs` или **`npm start`** (`"start": "node app.cjs"`), **не** `npm install`, **не** `vite`.
4. Кнопку **«Установить зависимости» / `npm install`** **не нажимать** — зависимости уже в `backend/.next/standalone/node_modules`.
5. В корне: **`app.cjs`** и **`package.json`** **без** `"type": "module"` (удалите строку из старого Vite-`package.json` или замените файл с деплоя).

### Переменные окружения

| Переменная | Значение |
|------------|----------|
| `NODE_ENV` | `production` |
| `BUSNOW_STATIC_DIR` | полный путь к корню сайта, если `index.html` в корне, а не в `frontend/dist/` |
| `CRON_SECRET` | для `/api/cron/reminders` |
| `PORT` | обычно задаёт панель — не менять без необходимости |

### После распаковки `busnow-api.zip`

Распаковать в `backend/.next/standalone/` → **Перезапустить Node.js**.

### Проверка

- `https://busnow.online/`
- `https://busnow.online/api/routes`
