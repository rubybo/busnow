const SITE_URL = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/$/, "") ?? "https://busnow.online";

export const SEO = {
  siteUrl: SITE_URL,
  siteName: "BusNow",
  locale: "ru_RU",
  defaultTitle: "Расписание автобусов Новополоцка — BusNow",
  defaultDescription:
    "Расписание автобусов, маршруток и трамвая Новополоцка по остановкам: ближайшие рейсы, маршруты и время отправления.",
  ogImage: `${SITE_URL}/og-cover.svg`,
};

export type PageMeta = {
  title: string;
  description: string;
  path?: string;
  robots?: "index" | "noindex";
  jsonLd?: Record<string, unknown> | null;
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

function canonicalUrl(path: string): string {
  if (path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")) return `${SEO.siteUrl}${path}`;
  try {
    const url = new URL(path);
    const site = new URL(SEO.siteUrl);
    if (url.origin === site.origin && url.pathname.startsWith("/") && !url.pathname.startsWith("//")) return url.href;
  } catch {
    // The path is not a page on this site.
  }
  return `${SEO.siteUrl}/`;
}

export function setPageMeta({ title, description, path = "/", robots = "index", jsonLd }: PageMeta): void {
  const url = canonicalUrl(path);

  document.title = title;
  metaByName("description", description);
  metaByName("robots", robots === "noindex" ? "noindex, follow" : "index, follow, max-image-preview:large");
  metaByName("geo.placename", "Новополоцк");
  metaByName("geo.region", "BY");
  upsertLink("canonical", url);

  metaByProperty("og:type", "website");
  metaByProperty("og:site_name", SEO.siteName);
  metaByProperty("og:locale", SEO.locale);
  metaByProperty("og:title", title);
  metaByProperty("og:description", description);
  metaByProperty("og:url", url);
  metaByProperty("og:image", SEO.ogImage);
  metaByProperty("og:image:alt", "BusNow — расписание транспорта Новополоцка");

  metaByName("twitter:card", "summary");
  metaByName("twitter:title", title);
  metaByName("twitter:description", description);
  metaByName("twitter:image", SEO.ogImage);

  document.querySelectorAll("script[data-busnow-jsonld], script[id^='jsonld-']").forEach((node) => node.remove());
  if (jsonLd) {
    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.dataset.busnowJsonld = "page";
    script.textContent = JSON.stringify(jsonLd).replace(/</g, "\\u003c");
    document.head.appendChild(script);
  }
}

