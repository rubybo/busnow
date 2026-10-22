import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { homePage, privatePage, routePage, stopPage } from "../frontend/page-seo.mjs";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dist = path.join(root, "frontend", "dist");
const shellPath = path.join(dist, "index.html");
const dbPath = path.join(root, "backend", "data", "busnow.sqlite");

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function render(shell, page, links) {
  const robots = page.robots === "noindex" ? "noindex, follow" : "index, follow, max-image-preview:large";
  const url = `https://busnow.online${page.path}`;
  const json = page.jsonLd ? JSON.stringify(page.jsonLd).replace(/</g, "\\u003c") : "";
  const items = links
    .map((link) => `<li><a href="${esc(link.href)}">${esc(link.name)}</a></li>`)
    .join("");
  const noscript = `<noscript><main><h1>${esc(page.title)}</h1><p>${esc(page.description)}</p>${items ? `<ul>${items}</ul>` : ""}</main></noscript>`;
  let html = shell;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  html = html.replace(
    /<meta name="description" content="[^"]*"\s*\/?>/,
    `<meta name="description" content="${esc(page.description)}" />`,
  );
  html = html.replace(/<meta name="robots" content="[^"]*"\s*\/?>/, `<meta name="robots" content="${robots}" />`);
  html = html.replace(/<meta property="og:title" content="[^"]*"\s*\/?>/, `<meta property="og:title" content="${esc(page.title)}" />`);
  html = html.replace(
    /<meta property="og:description" content="[^"]*"\s*\/?>/,
    `<meta property="og:description" content="${esc(page.description)}" />`,
  );
  html = html.replace(/<meta property="og:url" content="[^"]*"\s*\/?>/, `<meta property="og:url" content="${esc(url)}" />`);
  html = html.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/, `<link rel="canonical" href="${esc(url)}" />`);
  html = html.replace(/<meta name="twitter:title" content="[^"]*"\s*\/?>/, `<meta name="twitter:title" content="${esc(page.title)}" />`);
  html = html.replace(
    /<meta name="twitter:description" content="[^"]*"\s*\/?>/,
    `<meta name="twitter:description" content="${esc(page.description)}" />`,
  );
  if (json) {
    html = html.replace("</head>", `    <script type="application/ld+json" data-busnow-jsonld="page">${json}</script>\n  </head>`);
  }
  html = html.replace("<div id=\"app\"></div>", `${noscript}\n    <div id="app"></div>`);
  return html;
}

function writePage(file, html) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, html);
}

if (!existsSync(shellPath)) {
  console.error("[seo] Нет frontend/dist/index.html — сначала npm run build --prefix frontend");
  process.exit(1);
}
if (!existsSync(dbPath)) {
  console.error("[seo] Нет базы backend/data/busnow.sqlite");
  process.exit(1);
}

const shell = readFileSync(shellPath, "utf8");
const db = new DatabaseSync(dbPath, { readOnly: true });

const routes = db
  .prepare("SELECT id, code, slug, kind, title FROM routes ORDER BY code")
  .all();
const stops = db.prepare("SELECT id, name, slug FROM stops ORDER BY name").all();
const routeStops = db.prepare(
  `SELECT s.id AS id, s.name AS name, MIN(st.sequence) AS seq
   FROM directions d
   JOIN trips t ON t.direction_id = d.id
   JOIN stop_times st ON st.trip_id = t.id
   JOIN stops s ON s.id = st.stop_id
   WHERE d.route_id = ? AND d.position = 0
   GROUP BY s.id
   ORDER BY seq`,
);
const stopRoutes = db.prepare(
  `SELECT DISTINCT r.code AS code
   FROM stop_times st
   JOIN trips t ON t.id = st.trip_id
   JOIN directions d ON d.id = t.direction_id
   JOIN routes r ON r.id = d.route_id
   WHERE st.stop_id = ?
   ORDER BY r.code`,
);

const homeLinks = [
  ...routes.map((route) => ({ href: `/routes/${encodeURIComponent(route.slug)}`, name: `${route.code} ${route.title}` })),
  ...stops.map((stop) => ({ href: `/stops/${stop.id}`, name: stop.name })),
];
writePage(shellPath, render(shell, homePage(), homeLinks));

for (const route of routes) {
  const line = routeStops.all(route.id);
  const page = routePage(route, line);
  const links = line.map((stop) => ({ href: `/stops/${stop.id}`, name: stop.name }));
  writePage(path.join(dist, "routes", `${route.slug}.html`), render(shell, page, links));
}

for (const stop of stops) {
  const codes = stopRoutes.all(stop.id).map((row) => row.code);
  const page = stopPage(stop, codes);
  const links = routes
    .filter((route) => codes.includes(route.code))
    .map((route) => ({ href: `/routes/${encodeURIComponent(route.slug)}`, name: `${route.code} ${route.title}` }));
  writePage(path.join(dist, "stops", `${stop.id}.html`), render(shell, page, links));
}

for (const kind of ["login", "register", "profile"]) {
  writePage(path.join(dist, `${kind}.html`), render(shell, privatePage(kind), []));
}

console.log(`[seo] ${routes.length} маршрутов, ${stops.length} остановок → ${dist}`);
