import { cpSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const backend = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(backend, ".next/standalone");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Сначала выполните: npm run build --prefix backend");
  process.exit(1);
}

cpSync(path.join(backend, ".next/static"), path.join(standalone, ".next/static"), { recursive: true });
mkdirSync(path.join(standalone, "data"), { recursive: true });
if (!existsSync(path.join(standalone, "data/busnow.sqlite"))) {
  if (existsSync(path.join(backend, "data/busnow.sqlite"))) {
    cpSync(path.join(backend, "data/busnow.sqlite"), path.join(standalone, "data/busnow.sqlite"));
  }
}
console.log(`[standalone] готово: ${standalone}`);
