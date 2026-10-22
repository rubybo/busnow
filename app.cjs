/**
 * Продакшен: один процесс для HB.BY — `node app.cjs`
 * (.cjs — чтобы работало, если в package.json на хостинге осталось "type": "module")
 */
const http = require("node:http");
const net = require("node:net");
const fs = require("node:fs");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const ROOT = __dirname;

function ensureApi() {
  const archive = path.join(ROOT, "busnow-api.tar.gz");
  const dest = path.join(ROOT, "backend", ".next", "standalone");
  const serverJs = path.join(dest, "server.js");
  if (!fs.existsSync(archive)) return;
  const archiveTime = String(fs.statSync(archive).mtimeMs);
  const stampPath = path.join(ROOT, ".busnow-api-stamp");
  const stamp = fs.existsSync(stampPath) ? fs.readFileSync(stampPath, "utf8") : "";
  if (fs.existsSync(serverJs) && stamp === archiveTime) return;
  fs.mkdirSync(dest, { recursive: true });
  console.log("[busnow] Распаковка busnow-api.tar.gz …");
  const result = spawnSync("tar", ["-xzf", archive, "-C", dest], { stdio: "inherit" });
  if (result.status !== 0) {
    console.error("[busnow] tar API завершился с кодом", result.status);
    return;
  }
  fs.writeFileSync(stampPath, archiveTime);
}

ensureApi();

function resolveDist() {
  if (process.env.BUSNOW_STATIC_DIR) return path.resolve(process.env.BUSNOW_STATIC_DIR);
  for (const rel of ["dist", path.join("frontend", "dist")]) {
    const dir = path.join(ROOT, rel);
    if (fs.existsSync(path.join(dir, "index.html"))) return dir;
  }
  return ROOT;
}
const DIST = resolveDist();
const API_DIR = process.env.BUSNOW_API_DIR
  ? path.resolve(process.env.BUSNOW_API_DIR)
  : path.join(ROOT, "backend", ".next", "standalone");
const API_ENTRY = path.join(API_DIR, "server.js");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
let API_PORT = 0;
let apiChild = null;
let apiReady = false;

function reserveApiPort() {
  if (process.env.BUSNOW_API_PORT) return Promise.resolve(Number(process.env.BUSNOW_API_PORT));
  const avoid = new Set([PORT, 3000, 3001]);
  return new Promise((resolve, reject) => {
    const probe = (port) => {
      if (port > 45000) {
        reject(new Error("нет свободного порта для API"));
        return;
      }
      if (avoid.has(port)) {
        probe(port + 1);
        return;
      }
      const srv = net.createServer();
      srv.once("error", () => probe(port + 1));
      srv.listen(port, "127.0.0.1", () => srv.close(() => resolve(port)));
    };
    probe(35100);
  });
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".xml": "application/xml",
  ".txt": "text/plain; charset=utf-8",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function safeFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\//, "");
  const file = path.normalize(path.join(DIST, relative));
  if (!file.startsWith(DIST)) return null;
  return file;
}

function sendFile(res, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const stream = fs.createReadStream(file);
  res.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
  });
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(500).end("Ошибка чтения файла");
  });
  stream.pipe(res);
}

function proxyToApi(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` };
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: API_PORT,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, proxyRes.headers);
      proxyRes.pipe(res);
    },
  );
  upstream.on("error", () => {
    if (!res.headersSent) {
      res.writeHead(502, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "API недоступен" }));
    }
  });
  req.pipe(upstream);
}

function seoFile(urlPath) {
  const pathname = decodeURIComponent((urlPath || "/").split("?")[0]);
  let rel = null;
  const stop = pathname.match(/^\/stops\/(\d+)\/?$/);
  const route = pathname.match(/^\/routes\/([^/]+)\/?$/);
  const priv = pathname.match(/^\/(login|register|profile)\/?$/);
  if (stop) rel = path.join("stops", `${stop[1]}.html`);
  else if (route && /^[\w.-]+$/.test(route[1])) rel = path.join("routes", `${route[1]}.html`);
  else if (priv) rel = `${priv[1]}.html`;
  if (!rel) return null;
  const file = path.join(DIST, rel);
  return fs.existsSync(file) ? file : null;
}

function handleStatic(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405).end();
    return;
  }
  const file = safeFile(req.url || "/");
  if (!file) {
    res.writeHead(400).end();
    return;
  }
  fs.stat(file, (err, stat) => {
    if (!err && stat.isFile()) {
      if (req.method === "HEAD") {
        res.writeHead(200);
        res.end();
        return;
      }
      sendFile(res, file);
      return;
    }
    const seo = seoFile(req.url || "/");
    const spa = seo || path.join(DIST, "index.html");
    if (req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }
    sendFile(res, spa);
  });
}

function startApi() {
  if (process.env.BUSNOW_API === "0") return null;
  if (!fs.existsSync(API_ENTRY)) {
    console.warn("[busnow] API не найден:", API_ENTRY);
    return null;
  }
  const childEnv = { ...process.env, PORT: String(API_PORT), HOSTNAME: "127.0.0.1", NODE_ENV: "production" };
  delete childEnv.SOCKET;
  delete childEnv.INSTANCE_HOST;
  const child = spawn(process.execPath, ["server.js"], {
    cwd: API_DIR,
    env: childEnv,
    stdio: "inherit",
  });
  apiReady = true;
  child.on("exit", (code) => {
    apiReady = false;
    apiChild = null;
    console.error("[busnow] API завершился с кодом", code, "— статика продолжает работать");
  });
  console.log(`[busnow] API → 127.0.0.1:${API_PORT} (${API_DIR})`);
  return child;
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("[busnow] Нет index.html в", DIST, "— сначала: npm run build:web и заливка фронта");
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/api")) {
    if (!apiReady || !apiChild) {
      res.writeHead(503, {
        "Content-Type": "application/json; charset=utf-8",
        "X-BusNow-Server": "1",
      });
      res.end(JSON.stringify({ error: "BusNow API не запущен" }));
      return;
    }
    proxyToApi(req, res);
    return;
  }
  handleStatic(req, res);
});

reserveApiPort()
  .then((port) => {
    API_PORT = port;
    apiChild = startApi();
    if (!apiChild) console.log("[busnow] API не запущен");
  })
  .catch((error) => {
    console.error("[busnow]", error.message);
  });

if ("SOCKET" in process.env && process.env.SOCKET) {
  const socket = process.env.SOCKET;
  if (fs.existsSync(socket)) fs.unlinkSync(socket);
  server.listen(socket, () => {
    fs.chmodSync(socket, 0o660);
    console.log(`[busnow] Сайт → сокет ${socket} (${DIST})`);
  });
} else if ("PORT" in process.env) {
  const hostname = process.env.INSTANCE_HOST || "127.0.0.1";
  server.listen(PORT, hostname, () => {
    console.log(`[busnow] Сайт → http://${hostname}:${PORT} (${DIST})`);
  });
} else {
  server.listen(PORT, HOST, () => {
    console.log(`[busnow] Сайт → http://${HOST}:${PORT} (${DIST})`);
  });
}

function shutdown() {
  if (apiChild) apiChild.kill("SIGTERM");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
