import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(root, "backend/.next/standalone");
const out = path.join(root, "deploy/busnow-api.tar.gz");

if (!existsSync(path.join(standalone, "server.js"))) {
  console.error("Сначала: npm run build:api");
  process.exit(1);
}

execSync(
  `tar -czf "${out}" -C "${standalone}" --exclude=data/busnow.sqlite --exclude=data/busnow.sqlite-journal --exclude=data/weather-now.json .`,
  { stdio: "inherit", cwd: root },
);
console.log(`[api-zip] ${out}`);
