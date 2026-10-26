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
  let decoded;
  try {
    decoded = decodeURIComponent((urlPath || "/").split("?")[0]);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const relative = decoded === "/" ? "index.html" : decoded.replace(/^\/+/, "");
  const root = path.resolve(DIST);
  const file = path.resolve(root, relative);
  if (file !== root && !file.startsWith(root + path.sep)) return null;
  return file;
}

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
};

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "style-src-attr 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

function headerValue(value) {
  if (Array.isArray(value)) return value[0] || "";
  return typeof value === "string" ? value : "";
}

// https://www.cloudflare.com/ips-v4 and ips-v6, fetched 2026-10-26.
const CLOUDFLARE_V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"];
const CLOUDFLARE_V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

function ipv4Parts(ip) {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  const bytes = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const value = Number(part);
    if (value > 255) return null;
    bytes.push(value);
  }
  return (((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0);
}

function ipv6Words(ip) {
  const lower = ip.toLowerCase().split("%")[0];
  const halves = lower.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1 && left.length !== 8) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  const words = [...left, ...Array(missing).fill("0"), ...right];
  if (words.length !== 8) return null;
  const out = [];
  for (const word of words) {
    if (!/^[0-9a-f]{1,4}$/.test(word)) return null;
    out.push(parseInt(word, 16));
  }
  return out;
}

function inCidr(ip, cidr) {
  const [net, bitsRaw] = cidr.split("/");
  const bits = Number(bitsRaw);
  if (net.includes(":")) {
    const addr = ipv6Words(ip);
    const base = ipv6Words(net);
    if (!addr || !base) return false;
    let left = bits;
    for (let i = 0; i < 8 && left > 0; i += 1) {
      const take = Math.min(16, left);
      const mask = take === 16 ? 0xffff : ((0xffff << (16 - take)) & 0xffff);
      if ((addr[i] & mask) !== (base[i] & mask)) return false;
      left -= take;
    }
    return true;
  }
  const addr = ipv4Parts(ip);
  const base = ipv4Parts(net);
  if (addr == null || base == null) return false;
  const mask = bits === 0 ? 0 : ((0xffffffff << (32 - bits)) >>> 0);
  return (addr & mask) === (base & mask);
}

function fromCloudflare(ip) {
  const list = ip.includes(":") ? CLOUDFLARE_V6 : CLOUDFLARE_V4;
  return list.some((cidr) => inCidr(ip, cidr));
}

function cleanIp(value) {
  const ip = value.trim().replace(/^::ffff:/, "");
  if (/^[0-9A-Fa-f:.]{3,64}$/.test(ip)) return ip;
  return "";
}

function clientAddress(req) {
  const peer = cleanIp(req.socket?.remoteAddress || "");
  const loopback = peer === "" || peer === "127.0.0.1" || peer === "::1";
  let seen = peer;
  if (loopback) {
    const parts = headerValue(req.headers["x-forwarded-for"])
      .split(",")
      .map((item) => cleanIp(item))
      .filter(Boolean);
    seen = parts.length ? parts[parts.length - 1] : cleanIp(headerValue(req.headers["x-real-ip"])) || "local";
  }
  if (!fromCloudflare(seen)) return seen;
  const visitor = cleanIp(headerValue(req.headers["cf-connecting-ip"]));
  return visitor || seen;
}

function sendFile(res, file, status = 200) {
  const ext = path.extname(file).toLowerCase();
  const type = MIME[ext] || "application/octet-stream";
  const stream = fs.createReadStream(file);
  const headers = {
    "Content-Type": type,
    "Cache-Control": ext === ".html" ? "no-cache" : "public, max-age=31536000, immutable",
    ...SECURITY,
  };
  if (ext === ".html") headers["Content-Security-Policy"] = CSP;
  res.writeHead(status, headers);
  stream.on("error", () => {
    if (!res.headersSent) res.writeHead(500).end("Ошибка чтения файла");
  });
  stream.pipe(res);
}

function proxyToApi(req, res) {
  const headers = { ...req.headers, host: `127.0.0.1:${API_PORT}` };
  delete headers["x-busnow-client"];
  headers["x-busnow-client"] = clientAddress(req);
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: API_PORT,
      method: req.method,
      path: req.url,
      headers,
    },
    (proxyRes) => {
      const headers = { ...proxyRes.headers };
      headers["strict-transport-security"] = SECURITY["Strict-Transport-Security"];
      res.writeHead(proxyRes.statusCode || 502, headers);
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
