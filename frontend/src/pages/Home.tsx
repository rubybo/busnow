import { useEffect, useState } from "react";
import { Link } from "react-router";
import { api, type Departure, type RouteListItem, type StopRef } from "../api.ts";
import { clockMinutes, useMinskMinutes, waitLabel } from "../clock.ts";
import { useFavorites } from "../favorites.ts";
import { morph } from "../morph.ts";
import { plural, toward } from "../names.ts";
import { activeStopId, useBusNow } from "../session.ts";
import { Logo } from "./Logo.tsx";
import { RouteGrid } from "./RouteList.tsx";
import { RoutesSkeleton } from "./Loading.tsx";
import { IconPin, IconSearch, IconStarFilled } from "../icons.tsx";
import { setJsonLd, SEO } from "../seo.ts";
import { Screen } from "./Screen.tsx";

function normalize(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
}

function MyStop({ stopId }: { stopId: number }) {
  const nowMinutes = useMinskMinutes();
  const [stop, setStop] = useState<StopRef | null>(null);
  const [rows, setRows] = useState<Departure[]>([]);

  useEffect(() => {
    let gone = false;
    api<{ stop: StopRef; departures: Departure[] }>(`/api/stops/${stopId}/departures`)
      .then((data) => {
        if (gone) return;
        morph(() => {
          setStop(data.stop);
          setRows(data.departures);
        });
      })
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [stopId]);

  if (!stop) return null;
  const upcoming = rows.filter((row) => clockMinutes(row.departs) >= nowMinutes).slice(0, 3);

  return (
    <Link to={`/stops/${stop.id}`} className="my-stop card resting">
      <span className="my-stop-name">
        <IconPin size={18} /> {stop.name}
      </span>
      {upcoming.length === 0 ? (
        <span className="muted">Сегодня рейсов больше нет</span>
      ) : (
        upcoming.map((row) => (
          <span key={row.id} className="my-stop-row">
            <span className="time">{row.departs}</span>
            <span className={`badge ${row.kind === "bus" ? "bus" : "minibus"}`}>{row.routeCode}</span>
            <span className="my-stop-to">{toward(row.direction)}</span>
            <span className="muted">{waitLabel(clockMinutes(row.departs) - nowMinutes)}</span>
          </span>
        ))
      )}
    </Link>
  );
}

export function Home() {
  const state = useBusNow();
  const [query, setQuery] = useState("");
  const [stops, setStops] = useState<StopRef[] | null>(null);
  const [routes, setRoutes] = useState<RouteListItem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const favorites = useFavorites();
  const savedStop = state.email ? activeStopId(state) : null;

  useEffect(() => {
    setJsonLd("website", {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: SEO.siteName,
      url: SEO.siteUrl,
      description: SEO.defaultDescription,
      inLanguage: "ru-BY",
      potentialAction: {
        "@type": "SearchAction",
        target: `${SEO.siteUrl}/?q={search_term_string}`,
        "query-input": "required name=search_term_string",
      },
    });
  }, []);

  useEffect(() => {
    let gone = false;
    api<{ stops: StopRef[] }>("/api/stops?q=")
      .then((data) => !gone && setStops(data.stops))
      .catch(() => !gone && setStops([]));
    api<{ routes: RouteListItem[] }>("/api/routes")
      .then((data) => !gone && morph(() => setRoutes(data.routes)))
      .catch(() => !gone && setRoutes([]));
    return () => {
      gone = true;
    };
  }, []);

  const q = normalize(query);
  const foundRoutes = (routes ?? []).filter((route) => !q || normalize(route.code).startsWith(q));
  const foundStops = (stops ?? []).filter((stop) => !q || normalize(stop.name).includes(q));
  const nothing = q && routes && stops && foundRoutes.length === 0 && foundStops.length === 0;

  return (
    <Screen
      className="narrow"
      title="BusNow — расписание транспорта Новополоцка"
      description="Расписание автобусов, маршруток и трамвая Новополоцка по каждой остановке."
    >
      <header className="top">
        <Logo />
        {state.email ? (
          <a className="text-btn" href="/profile">
            Профиль
          </a>
        ) : (
          <a className="text-btn" href="/login">
            Войти
          </a>
        )}
      </header>

      <h1 id="page-title" tabIndex={-1} className="home-title">
        Транспорт Новополоцка
      </h1>

      {savedStop != null ? <MyStop stopId={savedStop} /> : null}

      {favorites.length > 0 && !q ? (
        <section className="pill-group">
          <h2 className="group-label">Мои остановки</h2>
          <div className="fav-list">
            {favorites.map((stop) => (
              <Link key={stop.id} to={`/stops/${stop.id}`} className="fav-chip">
                <IconStarFilled size={16} />
                {stop.name}
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      <label className="field search resting">
        <IconSearch size={20} className="search-icon" />
        <span className="clip">Остановка или номер маршрута</span>
        <input
          type="search"
          placeholder="Остановка или номер маршрута"
          autoComplete="off"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      {nothing ? <p className="muted empty">Ничего не нашлось</p> : null}

      {routes === null ? <RoutesSkeleton /> : foundRoutes.length > 0 ? <RouteGrid routes={foundRoutes} /> : null}

      {foundStops.length > 0 ? (
        <section className="pill-group">
          <h2 className="group-label">Остановки{q ? ` · ${foundStops.length}` : ""}</h2>
          {q || showAll ? (
            <div className="stop-index">
              {foundStops.map((stop) => (
                <Link key={stop.id} to={`/stops/${stop.id}`} className="stop-index-item">
                  {stop.name}
                </Link>
              ))}
            </div>
          ) : (
            <button type="button" className="text-link" onClick={() => setShowAll(true)}>
              Показать {foundStops.length} {plural(foundStops.length, "остановку", "остановки", "остановок")}
            </button>
          )}
        </section>
      ) : null}

      <footer>
        <p>Расписание может измениться</p>
      </footer>
    </Screen>
  );
}
