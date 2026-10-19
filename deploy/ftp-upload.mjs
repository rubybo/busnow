import { Client } from "basic-ftp";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const deployDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(deployDir, "..");

function loadEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const i = trimmed.indexOf("=");
    if (i < 0) continue;
    out[trimmed.slice(0, i).trim()] = trimmed.slice(i + 1).trim();
  }
  return out;
}

const env = { ...loadEnv(path.join(deployDir, "env.example")), ...loadEnv(path.join(deployDir, ".env.local")) };

const host = process.env.FTP_HOST ?? env.FTP_HOST;
const user = process.env.FTP_USER ?? env.FTP_USER;
const password = process.env.FTP_PASSWORD ?? env.FTP_PASSWORD;
const port = Number(process.env.FTP_PORT ?? env.FTP_PORT ?? 21);
const frontDir = process.env.FTP_FRONT_DIR ?? env.FTP_FRONT_DIR ?? "/";
const apiDir = process.env.FTP_API_DIR ?? env.FTP_API_DIR ?? "/api/";

if (!host || !user || !password) {
  console.error("Задайте FTP_HOST, FTP_USER, FTP_PASSWORD в deploy/.env.local");
  process.exit(1);
}

const releaseSrc = path.join(root, "release");

if (!existsSync(path.join(releaseSrc, "app.js"))) {
  console.error("Нет release/ — выполните: npm run release");
  process.exit(1);
}

async function uploadDir(client, local, remote) {
  console.log(`↑ ${local} → ${remote}`);
  await client.ensureDir(remote);
  await client.uploadFromDir(local, remote);
}

const client = new Client(120_000);
client.ftp.verbose = process.env.FTP_VERBOSE === "1";

try {
  await client.access({ host, user, password, port, secure: false });
  const target = frontDir || "/";
  await uploadDir(client, releaseSrc, target);
  console.log("FTP: загрузка завершена (release/ → корень сайта)");
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  client.close();
}
