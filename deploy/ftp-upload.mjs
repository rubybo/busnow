import { Client } from "basic-ftp";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
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

function envFlag(name, fallback) {
  const raw = process.env[name] ?? env[name];
  if (raw === undefined || raw === "") return fallback;
  return raw === "1" || raw.toLowerCase() === "true" || raw.toLowerCase() === "yes";
}

const env = { ...loadEnv(path.join(deployDir, "env.example")), ...loadEnv(path.join(deployDir, ".env.local")) };

const host = process.env.FTP_HOST ?? env.FTP_HOST;
const user = process.env.FTP_USER ?? env.FTP_USER;
const password = process.env.FTP_PASSWORD ?? env.FTP_PASSWORD;
const port = Number(process.env.FTP_PORT ?? env.FTP_PORT ?? 21);
const secure = envFlag("FTP_SECURE", true);
const passive = envFlag("FTP_PASSIVE", false);
function absDir(value, fallback) {
  let raw = String(value || fallback).trim().replace(/\\/g, "/");
  raw = raw.replace(/\/{2,}/g, "/");
  if (!raw.startsWith("/")) raw = `/${raw}`;
  if (!raw.endsWith("/")) raw += "/";
  return raw;
}

const frontDir = absDir(process.env.FTP_FRONT_DIR ?? env.FTP_FRONT_DIR, "/www/busnow.online/");
const mode = (process.env.FTP_MODE ?? env.FTP_MODE ?? "front").toLowerCase();
const frontLayout = (process.env.FTP_FRONT_LAYOUT ?? env.FTP_FRONT_LAYOUT ?? "root").toLowerCase();

if (!host || !user || !password) {
  console.error("Задайте FTP_HOST, FTP_USER, FTP_PASSWORD в deploy/.env.local");
  process.exit(1);
}

const releaseSrc = path.join(root, "release");
const distSrc = path.join(root, "frontend", "dist");
const apiSrc = path.join(root, "backend", ".next", "standalone");
const apiRemoteBase = absDir(
  process.env.FTP_API_DIR ?? env.FTP_API_DIR,
  `${frontDir}backend/.next/standalone/`,
);

let localDir;
let remoteDir;
/** @type {{ local: string; remote: string }[]} */
let extraFiles = [];

if (mode === "release") {
  if (!existsSync(path.join(releaseSrc, "app.cjs"))) {
    console.error("Нет release/ — выполните: npm run release");
    process.exit(1);
  }
  localDir = releaseSrc;
  remoteDir = frontDir;
} else if (mode === "front" || mode === "frontend") {
  if (!existsSync(path.join(distSrc, "index.html"))) {
    console.error("Нет frontend/dist — выполните: npm run build:web");
    process.exit(1);
  }
  localDir = distSrc;
  remoteDir =
    frontLayout === "appjs" || frontLayout === "nested"
      ? `${frontDir}frontend/dist/`
      : frontDir;
} else if (mode === "entry") {
  const prodPkg = path.join(deployDir, "package.production.json");
  const appCjs = path.join(root, "app.cjs");
  if (!existsSync(appCjs)) {
    console.error("Нет app.cjs");
    process.exit(1);
  }
  if (!existsSync(path.join(distSrc, "index.html"))) {
    console.error("Нет frontend/dist/index.html — выполните: npm run build:web");
    process.exit(1);
  }
  localDir = distSrc;
  remoteDir = `${frontDir}dist/`;
  const startSh = path.join(deployDir, "start.sh");
  const prodLock = path.join(deployDir, "package-lock.production.json");
  const prodNpmrc = path.join(deployDir, "npmrc.production");
  const bundle = path.join(deployDir, "busnow-release.tar.gz");
  extraFiles = [
    { local: appCjs, remote: `${frontDir}app.cjs` },
    ...(existsSync(prodPkg) ? [{ local: prodPkg, remote: `${frontDir}package.json` }] : []),
    ...(existsSync(prodLock) ? [{ local: prodLock, remote: `${frontDir}package-lock.json` }] : []),
    ...(existsSync(prodNpmrc) ? [{ local: prodNpmrc, remote: `${frontDir}.npmrc` }] : []),
    ...(existsSync(startSh) ? [{ local: startSh, remote: `${frontDir}start.sh` }] : []),
    ...(existsSync(bundle) ? [{ local: bundle, remote: `${frontDir}busnow-release.tar.gz` }] : []),
  ];
} else if (mode === "api-zip") {
  const zipPath = path.join(deployDir, "busnow-api.zip");
  if (!existsSync(zipPath)) {
    console.error("Нет deploy/busnow-api.zip — выполните: npm run package:api-zip");
    process.exit(1);
  }
  localDir = deployDir;
  remoteDir = frontDir;
  const prodPkg = path.join(deployDir, "package.production.json");
  extraFiles = [
    { local: zipPath, remote: `${frontDir}busnow-api.zip` },
    ...(existsSync(path.join(root, "app.cjs"))
      ? [{ local: path.join(root, "app.cjs"), remote: `${frontDir}app.cjs` }]
      : []),
    ...(existsSync(prodPkg)
      ? [{ local: prodPkg, remote: `${frontDir}package.json` }]
      : []),
  ];
  // только extraFiles (архив + app.js)
  localDir = null;
} else if (mode === "api" || mode === "back" || mode === "backend") {
  if (!existsSync(path.join(apiSrc, "server.js"))) {
    console.error("Нет backend/.next/standalone — выполните: npm run build:api");
    process.exit(1);
  }
  localDir = apiSrc;
  remoteDir = apiRemoteBase;
  const appEntry = path.join(root, "app.cjs");
  if (existsSync(appEntry)) {
    extraFiles.push({ local: appEntry, remote: `${frontDir}app.cjs` });
  }
} else {
  console.error("FTP_MODE: front | api | api-zip | release");
  process.exit(1);
}

function walkFiles(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full, base));
    else {
      const rel = path.relative(base, full).split(path.sep).join("/");
      if (rel.endsWith(".nft.json") || rel.endsWith(".map")) continue;
      out.push(rel);
    }
  }
  return out;
}

function makeClient() {
  const client = new Client(300_000);
  client.ftp.verbose = process.env.FTP_VERBOSE === "1";
  client.ftp.passive = passive;
  return client;
}

async function connect(client) {
  await client.access({
    host,
    user,
    password,
    port,
    secure,
    secureOptions: { rejectUnauthorized: false },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function prepareSite(client) {
  const dir = frontDir.replace(/\/+$/, "");
  await client.ensureDir(dir);
  await client.cd(dir);
  const nested = (await client.list()).some((item) => item.isDirectory && item.name === "www");
  if (nested) {
    console.log(`  удаляю вложенную папку ${dir}/www`);
    await client.removeDir(`${dir}/www`);
  }
  await client.cd("/");
  for (const target of ["/www", dir]) {
    try {
      await client.send(`SITE CHMOD 755 ${target}`);
      console.log(`  права 755 ${target}`);
    } catch (error) {
      console.warn(`  права ${target}: ${error.message}`);
    }
  }
}

async function openClient() {
  for (let i = 1; i <= 6; i++) {
    try {
      const client = makeClient();
      await connect(client);
      return client;
    } catch (error) {
      if (i === 6) throw error;
      console.warn(`  FTP connect (${i}/6): ${error.code ?? error.message}`);
      await sleep(1500 * i);
    }
  }
  throw new Error("FTP connect failed");
}

async function uploadSingleFile(client, localFile, remoteFile) {
  const remotePosix = remoteFile.replace(/\\/g, "/");
  const relDir = path.posix.dirname(remotePosix);
  const targetDir = relDir === "." ? "/" : `${relDir.replace(/\/+$/, "")}/`;
  const remoteName = path.basename(remoteFile);
  const localSize = statSync(localFile).size;
  await client.ensureDir(targetDir);
  if (mode !== "entry") {
    try {
      const remoteSize = await client.size(remoteName);
      if (remoteSize === localSize) return "skip";
    } catch {
      /* upload */
    }
  }
  await client.uploadFrom(localFile, remoteName);
  return "ok";
}

async function uploadOneFile(client, remote, rel) {
  const localFile = path.join(localDir, rel);
  const relDir = path.dirname(rel).replace(/\\/g, "/");
  const targetDir =
    relDir === "." ? remote : `${remote.replace(/\/+$/, "")}/${relDir}/`;
  const localSize = statSync(localFile).size;
  const remoteName = path.basename(rel);

  await client.ensureDir(targetDir);
  if (mode !== "entry") {
    try {
      const remoteSize = await client.size(remoteName);
      if (remoteSize === localSize) return "skip";
    } catch {
      /* upload */
    }
  }
  await client.uploadFrom(localFile, remoteName);
  return "ok";
}

const statePath = path.join(deployDir, ".ftp-uploaded.json");

function loadState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function filePriority(rel) {
  if (rel === "app.cjs" || rel === "package.json") return 0;
  if (rel.startsWith("frontend/")) return 1;
  if (rel === "backend/.next/standalone/server.js" || rel.endsWith("/server.js")) return 2;
  return 3;
}

async function uploadDir(local, remote) {
  console.log(`↑ ${local} → ${remote}`);
  const files = walkFiles(local).sort((a, b) => filePriority(a) - filePriority(b) || a.localeCompare(b));
  console.log(`  файлов: ${files.length}`);
  const state = loadState();
  let client = await openClient();
  let done = 0;
  let sinceSave = 0;
  for (const rel of files) {
    const force = rel === "app.cjs" || rel === "package.json";
    const key = `${remote}${rel}`.replace(/\/{2,}/g, "/");
    const localSize = statSync(path.join(local, rel)).size;
    if (mode !== "entry" && !force && state[key] === localSize) {
      done++;
      if (done % 100 === 0 || done === files.length) console.log(`  ${done}/${files.length} ${rel} (skip)`);
      continue;
    }
    for (let i = 1; i <= 12; i++) {
      try {
        const status = await uploadOneFile(client, remote, rel);
        state[key] = localSize;
        sinceSave++;
        if (sinceSave >= 15) {
          writeFileSync(statePath, JSON.stringify(state));
          sinceSave = 0;
        }
        done++;
        if (mode === "entry" || done % 20 === 0 || done === files.length || filePriority(rel) < 3) {
          console.log(`  ${done}/${files.length} ${rel}${status === "skip" ? " (skip)" : ""}`);
        }
        await sleep(files.length > 100 ? 80 : 200);
        break;
      } catch (error) {
        console.warn(`  повтор ${rel} (${i}/12): ${error.code ?? error.message}`);
        client.close();
        await sleep(800 * i);
        if (i === 12) throw error;
        client = await openClient();
      }
    }
  }
  writeFileSync(statePath, JSON.stringify(state));
  for (const { local: lf, remote: rf } of extraFiles) {
    for (let i = 1; i <= 8; i++) {
      try {
        const status = await uploadSingleFile(client, lf, rf);
        console.log(`  extra ${path.basename(lf)} → ${rf}${status === "skip" ? " (skip)" : ""}`);
        break;
      } catch (error) {
        console.warn(`  повтор ${rf} (${i}/8): ${error.code ?? error.message}`);
        client.close();
        await sleep(1000 * i);
        if (i === 8) throw error;
        client = await openClient();
      }
    }
  }
  client.close();
  console.log(`FTP: загрузка завершена (${mode}: ${local} → ${remote})`);
}

try {
  if (localDir) await uploadDir(localDir, remoteDir);
  else if (extraFiles.length) {
    console.log(`↑ extra → ${frontDir}`);
    let client = await openClient();
    try {
      await prepareSite(client);
    } catch (error) {
      console.warn(`  каталог сайта: ${error.message}`);
    }
    for (const { local: lf, remote: rf } of extraFiles) {
      for (let i = 1; i <= 8; i++) {
        try {
          const status = await uploadSingleFile(client, lf, rf);
          console.log(`  ${path.basename(lf)} → ${rf}${status === "skip" ? " (skip)" : ""}`);
          break;
        } catch (error) {
          console.warn(`  повтор ${rf} (${i}/8): ${error.code ?? error.message}`);
          client.close();
          await sleep(1000 * i);
          if (i === 8) throw error;
          client = await openClient();
        }
      }
    }
    client.close();
    console.log("FTP: загрузка завершена (api-zip)");
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
