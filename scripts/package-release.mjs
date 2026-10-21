import { cpSync, mkdirSync, rmSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "release");

const dist = path.join(root, "frontend/dist");
const standalone = path.join(root, "backend/.next/standalone");

if (!existsSync(path.join(dist, "index.html"))) {
  console.error("Сначала: npm run build:web");
  process.exit(1);
}
if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Сначала: npm run build:api");
  process.exit(1);
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

cpSync(path.join(root, "app.cjs"), path.join(out, "app.cjs"));
cpSync(dist, path.join(out, "frontend/dist"), { recursive: true });
cpSync(standalone, path.join(out, "backend/.next/standalone"), { recursive: true });

writeFileSync(
  path.join(out, "package.json"),
  JSON.stringify(
    {
      name: "busnow",
      private: true,
      scripts: { start: "node app.cjs" },
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  path.join(out, "README-UPLOAD.txt"),
  `Залейте ВСЁ содержимое этой папки в корень сайта:
/var/www/u41977-8185/data/www/busnow.online/

Должен появиться файл:
  .../busnow.online/app.cjs

В панели Node.js:
  Команда: node app.cjs
  (НЕ npm run build, НЕ vite, НЕ npm run dev)

Переменные: NODE_ENV=production, CRON_SECRET=...
`,
);

console.log(`[release] Готово: ${out}`);
console.log("[release] Залейте содержимое release/ в корень busnow.online по FTP");
