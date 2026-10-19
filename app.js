/**
 * Продакшен: один процесс для HB.BY — `node app.js`
 * - раздаёт frontend/dist (SPA)
 * - поднимает API из backend/.next/standalone и проксирует /api
 *
 * Перед запуском: npm run build
 */
const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const ROOT = __dirname;
const DIST = process.env.BUSNOW_STATIC_DIR
  ? path.resolve(process.env.BUSNOW_STATIC_DIR)
  : path.join(ROOT, "frontend", "dist");
const API_DIR = process.env.BUSNOW_API_DIR
  ? path.resolve(process.env.BUSNOW_API_DIR)
  : path.join(ROOT, "backend", ".next", "standalone");
const API_ENTRY = path.join(API_DIR, "server.js");
const HOST = process.env.HOST || "0.0.0.0";
const PORT = Number(process.env.PORT || 3000);
const API_PORT = Number(process.env.BUSNOW_API_PORT || 3001);

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
    const spa = path.join(DIST, "index.html");
    if (req.method === "HEAD") {
      res.writeHead(200);
      res.end();
      return;
    }
    sendFile(res, spa);
  });
}

function startApi() {
  if (!fs.existsSync(API_ENTRY)) {
    console.warn("[busnow] API не найден:", API_ENTRY);
    console.warn("[busnow] Работает только статика. Выполните: npm run build");
    return null;
  }
  const child = spawn(process.execPath, ["server.js"], {
    cwd: API_DIR,
    env: { ...process.env, PORT: String(API_PORT), HOSTNAME: "127.0.0.1", NODE_ENV: "production" },
    stdio: "inherit",
  });
  child.on("exit", (code) => {
    console.error("[busnow] API завершился с кодом", code);
    process.exit(code ?? 1);
  });
  console.log(`[busnow] API → 127.0.0.1:${API_PORT} (${API_DIR})`);
  return child;
}

if (!fs.existsSync(path.join(DIST, "index.html"))) {
  console.error("[busnow] Нет frontend/dist/index.html — сначала: npm run build:web");
  process.exit(1);
}

const apiChild = startApi();

const server = http.createServer((req, res) => {
  const url = req.url || "/";
  if (url.startsWith("/api")) {
    if (!apiChild) {
      res.writeHead(503, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ error: "API не собран" }));
      return;
    }
    proxyToApi(req, res);
    return;
  }
  handleStatic(req, res);
});

server.listen(PORT, HOST, () => {
  console.log(`[busnow] Сайт → http://${HOST}:${PORT} (${DIST})`);
});

function shutdown() {
  if (apiChild) apiChild.kill("SIGTERM");
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
