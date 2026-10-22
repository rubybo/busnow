export const SITE = "https://busnow.online";

export const HOME_TITLE = "Расписание автобусов Новополоцка — BusNow";
export const HOME_DESCRIPTION =
  "Расписание автобусов, маршруток и трамвая Новополоцка по остановкам: ближайшие рейсы, маршруты и время отправления.";

export function clip(text, max = 170) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).replace(/[.,;: ]+$/, "")}…`;
}

export function kindLabel(code, kind) {
  if (String(code).startsWith("Тр")) return "Трамвай";
  if (kind === "minibus") return "Маршрутка";
  return "Автобус";
}

export function routeCode(code) {
  return String(code).replace(/^Тр\s*/, "");
}

function abs(path) {
  return `${SITE}${path}`;
}

function crumbs(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: abs(item.path),
    })),
  };
}

export function homePage(query = "") {
  const q = query.trim();
  if (q) {
    return {
      title: clip(`Поиск «${q}» — расписание Новополоцка`, 70),
      description: clip(`Результаты поиска «${q}» по остановкам и маршрутам Новополоцка.`),
      path: `/?q=${encodeURIComponent(q)}`,
      robots: "noindex",
      jsonLd: null,
    };
  }
  return {
    title: HOME_TITLE,
    description: HOME_DESCRIPTION,
    path: "/",
    robots: "index",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          "@id": `${SITE}/#website`,
          url: `${SITE}/`,
          name: "BusNow",
          description: HOME_DESCRIPTION,
          inLanguage: "ru",
          publisher: { "@id": `${SITE}/#org` },
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE}/?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        },
        {
          "@type": "Organization",
          "@id": `${SITE}/#org`,
          name: "BusNow",
          url: `${SITE}/`,
          description: "Расписание общественного транспорта Новополоцка",
        },
      ],
    },
  };
}

export function stopPage(stop, routeCodes = []) {
  const codes = [...new Set(routeCodes.map((code) => routeCode(code)))];
  const shown = codes.slice(0, 8).join(", ");
  const tail = codes.length > 8 ? " и другие" : "";
  const lines = shown ? ` Рейсы: ${shown}${tail}.` : "";
  const path = `/stops/${stop.id}`;
  const name = stop.name;
  return {
    title: `${name} — расписание автобусов на остановке, Новополоцк`,
    description: clip(`Расписание автобусов и маршруток на остановке «${name}» в Новополоцке.${lines}`),
    path,
    robots: "index",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "BusStop",
          "@id": `${abs(path)}#stop`,
          name,
          url: abs(path),
          address: {
            "@type": "PostalAddress",
            addressLocality: "Новополоцк",
            addressCountry: "BY",
          },
        },
        crumbs([
          { name: "Расписание", path: "/" },
          { name, path },
        ]),
      ],
    },
  };
}

export function routePage(route, stops = []) {
  const code = routeCode(route.code);
  const kind = kindLabel(route.code, route.kind);
  const path = `/routes/${encodeURIComponent(route.slug)}`;
  const title = `${kind} ${code}: ${route.title} — расписание, Новополоцк`;
  const description = clip(
    `Расписание ${kind === "Маршрутка" ? "маршрутки" : kind === "Трамвай" ? "трамвая" : "автобуса"} ${code} «${route.title}» в Новополоцке: остановки, направления и время отправления.`,
  );
  const list = stops.slice(0, 40).map((stop, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name: stop.name,
    url: abs(`/stops/${stop.id}`),
  }));
  return {
    title,
    description,
    path,
    robots: "index",
    jsonLd: {
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebPage",
          "@id": `${abs(path)}#page`,
          url: abs(path),
          name: title,
          description,
          inLanguage: "ru",
          isPartOf: { "@id": `${SITE}/#website` },
        },
        crumbs([
          { name: "Расписание", path: "/" },
          { name: `${kind} ${code}`, path },
        ]),
        list.length
          ? {
              "@type": "ItemList",
              name: `Остановки ${kind === "Маршрутка" ? "маршрутки" : kind === "Трамвай" ? "трамвая" : "автобуса"} ${code}`,
              numberOfItems: stops.length,
              itemListElement: list,
            }
          : null,
      ].filter(Boolean),
    },
  };
}

export function privatePage(kind) {
  const pages = {
    login: {
      title: "Вход — BusNow",
      description: "Вход в BusNow, чтобы сохранить остановку на главной и включить напоминание об отправлении.",
      path: "/login",
    },
    register: {
      title: "Регистрация — BusNow",
      description: "Регистрация в BusNow: почта и пароль, чтобы хранить остановки и напоминания.",
      path: "/register",
    },
    profile: {
      title: "Профиль — BusNow",
      description: "Сохранённые остановки и напоминания об отправлении в BusNow.",
      path: "/profile",
    },
    missingStop: {
      title: "Остановка не найдена — BusNow",
      description: "Такой остановки в расписании Новополоцка нет.",
      path: "/",
    },
    missingRoute: {
      title: "Маршрут не найден — BusNow",
      description: "Такого маршрута в расписании Новополоцка нет.",
      path: "/",
    },
  };
  const page = pages[kind];
  return { ...page, robots: "noindex", jsonLd: null };
}
