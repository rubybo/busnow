import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend", "dist");
const swPath = path.join(dist, "sw.js");

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) files.push(...walk(file));
    else files.push(file);
  }
  return files;
}

const urls = new Set(["/"]);
for (const file of walk(dist)) {
  const rel = path.relative(dist, file).replaceAll("\\", "/");
  if (rel === "sw.js" || rel.endsWith(".html") || rel.endsWith(".map") || rel === "robots.txt") continue;
  if (rel.startsWith("assets/") || rel.endsWith(".svg") || rel.endsWith(".webmanifest") || rel.endsWith(".woff2")) {
    urls.add(`/${rel}`);
  }
}

const list = [...urls].sort();
const source = readFileSync(swPath, "utf8");
const next = source.replace(/const PRECACHE = \[[\s\S]*?\]; \/\/ busnow-precache/, `const PRECACHE = ${JSON.stringify(list)}; // busnow-precache`);
if (next === source) {
  console.error("[precache] В sw.js нет метки busnow-precache");
  process.exit(1);
}
writeFileSync(swPath, next);
console.log(`[precache] ${list.length} файлов в sw.js`);
