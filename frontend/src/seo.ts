const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") ?? "https://busnow.online";

export const SEO = {
  siteUrl: SITE_URL,
  siteName: "BusNow",
  locale: "ru_RU",
  defaultTitle: "BusNow — расписание автобуса и маршруток Новополоцка",
  defaultDescription:
    "Актуальное расписание автобусов, маршруток и трамвая Новополоцка: остановки, маршруты, ближайшие отправления и напоминания за 10 минут до рейса.",
  ogImage: `${SITE_URL}/og-cover.svg`,
};

export type PageMeta = {
  title: string;
  description: string;
  path?: string;
  robots?: "index" | "noindex";
};

function metaByName(name: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.name = name;
    document.head.appendChild(el);
  }
  el.content = content;
}

function metaByProperty(property: string, content: string): void {
  let el = document.querySelector<HTMLMetaElement>(`meta[property="${property}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute("property", property);
    document.head.appendChild(el);
  }
  el.content = content;
}

function upsertLink(rel: string, href: string): void {
  let el = document.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`);
  if (!el) {
    el = document.createElement("link");
    el.rel = rel;
    document.head.appendChild(el);
  }
  el.href = href;
}

export function setPageMeta({ title, description, path = "/", robots = "index" }: PageMeta): void {
  const url = path.startsWith("http") ? path : `${SEO.siteUrl}${path.startsWith("/") ? path : `/${path}`}`;

  document.title = title;
  metaByName("description", description);
  metaByName(
    "robots",
    robots === "noindex" ? "noindex, nofollow" : "index, follow, max-image-preview:large",
  );
  upsertLink("canonical", url);

  metaByProperty("og:type", "website");
  metaByProperty("og:site_name", SEO.siteName);
  metaByProperty("og:locale", SEO.locale);
  metaByProperty("og:title", title);
  metaByProperty("og:description", description);
  metaByProperty("og:url", url);
  metaByProperty("og:image", SEO.ogImage);

  metaByName("twitter:card", "summary");
  metaByName("twitter:title", title);
  metaByName("twitter:description", description);
  metaByName("twitter:image", SEO.ogImage);
}

export function setJsonLd(id: string, data: Record<string, unknown>): void {
  const scriptId = `jsonld-${id}`;
  let el = document.getElementById(scriptId) as HTMLScriptElement | null;
  if (!el) {
    el = document.createElement("script");
    el.id = scriptId;
    el.type = "application/ld+json";
    document.head.appendChild(el);
  }
  el.textContent = JSON.stringify(data);
}
