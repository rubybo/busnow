import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { api, type Departure, type RouteListItem, type StopRef } from "../api.ts";
import { departuresPath } from "../offline.ts";
import { clockMinutes, useMinskMinutes, waitLabel } from "../clock.ts";
import { isFavorite, useFavorites } from "../favorites.ts";
import { morph } from "../morph.ts";
import { plural, toward } from "../names.ts";
import { activeStopId, useBusNow } from "../session.ts";
import { Logo } from "./Logo.tsx";
import { RouteGrid } from "./RouteList.tsx";
import { RoutesSkeleton } from "./Loading.tsx";
import { IconPin, IconSearch, IconStarFilled } from "../icons.tsx";
import { homePage } from "../../page-seo.mjs";
import { Screen } from "./Screen.tsx";

function normalize(value: string): string {
  return value.toLocaleLowerCase("ru").replace(/ё/g, "е").trim();
}

function MyStop({ stopId, starred }: { stopId: number; starred: boolean }) {
  const nowMinutes = useMinskMinutes();
  const [stop, setStop] = useState<StopRef | null>(null);
  const [rows, setRows] = useState<Departure[]>([]);

  useEffect(() => {
    let gone = false;
    api<{ stop: StopRef; departures: Departure[] }>(departuresPath(stopId))
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
        <span className="my-stop-label">
          <IconPin size={18} />
          <span>{stop.name}</span>
        </span>
        {starred ? <IconStarFilled size={16} /> : null}
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
  const [searchParams, setSearchParams] = useSearchParams();
  const query = searchParams.get("q") ?? "";
  const [stops, setStops] = useState<StopRef[] | null>(null);
  const [routes, setRoutes] = useState<RouteListItem[] | null>(null);
  const [showAll, setShowAll] = useState(false);
  const favorites = useFavorites();
  const savedStop = state.email ? activeStopId(state) : null;
  const seo = useMemo(() => homePage(query), [query]);

  function setQuery(value: string) {
    setSearchParams(value.trim() ? { q: value } : {}, { replace: true });
  }

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
      title={seo.title}
      description={seo.description}
      path={seo.path}
      robots={seo.robots}
      jsonLd={seo.jsonLd}
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

      {savedStop != null || (favorites.length > 0 && !q) ? (
        <div className="my-stops">
          {savedStop == null ? <h2 className="group-label">Мои остановки</h2> : null}
          {savedStop != null ? <MyStop stopId={savedStop} starred={isFavorite(favorites, savedStop)} /> : null}
          {!q
            ? favorites
                .filter((stop) => stop.id !== savedStop)
                .map((stop) => (
                  <Link key={stop.id} to={`/stops/${stop.id}`} className="my-fav card resting">
                    <span>{stop.name}</span>
                    <IconStarFilled size={16} />
                  </Link>
                ))
            : null}
        </div>
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
