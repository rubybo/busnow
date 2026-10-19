import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const site = process.env.SITE_URL?.replace(/\/$/, "") ?? "https://busnow.online";
const seed = JSON.parse(readFileSync(path.join(root, "backend/data/zippy-seed.json"), "utf8"));
const dbPath = path.join(root, "backend/data/busnow.sqlite");

const urls = [
  { loc: `${site}/`, priority: "1.0", changefreq: "daily" },
];

for (const route of seed.routes ?? []) {
  if (route.slug) {
    urls.push({ loc: `${site}/routes/${encodeURIComponent(route.slug)}`, priority: "0.8", changefreq: "weekly" });
  }
}

if (existsSync(dbPath)) {
  const db = new DatabaseSync(dbPath);
  const stops = db.prepare("SELECT id FROM stops ORDER BY id").all();
  for (const stop of stops) {
    urls.push({ loc: `${site}/stops/${stop.id}`, priority: "0.7", changefreq: "weekly" });
  }
}

const body = urls
  .map(
    (item) => `  <url>
    <loc>${item.loc}</loc>
    <changefreq>${item.changefreq}</changefreq>
    <priority>${item.priority}</priority>
  </url>`,
  )
  .join("\n");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

const out = path.join(root, "frontend/public/sitemap.xml");
writeFileSync(out, xml);
console.log(`[sitemap] ${urls.length} URLs → ${out}`);
