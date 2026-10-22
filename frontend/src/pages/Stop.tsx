import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { api, type Departure, type Kind, type StopRef } from "../api.ts";
import { departuresPath } from "../offline.ts";
import { privatePage, stopPage } from "../../page-seo.mjs";
import { clockMinutes, useMinskMinutes, waitLabel } from "../clock.ts";
import { isFavorite, toggleFavorite, useFavorites } from "../favorites.ts";
import { morph } from "../morph.ts";
import { toward } from "../names.ts";
import { IconMoon, IconStar, IconStarFilled, IconSunrise } from "../icons.tsx";
import { assignStop, clearStop, useBusNow } from "../session.ts";
import { Back } from "./Back.tsx";
import { BoardSkeleton } from "./Loading.tsx";
import { Logo } from "./Logo.tsx";
import { Screen } from "./Screen.tsx";

type Line = {
  key: string;
  routeCode: string;
  routeSlug: string;
  kind: Kind;
  direction: string;
  directionPos: number;
  next: string[];
};

function linesOf(departures: Departure[], nowMinutes: number): Line[] {
  const map = new Map<string, Line>();
  for (const row of departures) {
    const key = `${row.routeSlug}:${row.directionPos}`;
    let line = map.get(key);
    if (!line) {
      line = {
        key,
        routeCode: row.routeCode,
        routeSlug: row.routeSlug,
        kind: row.kind,
        direction: row.direction,
        directionPos: row.directionPos,
        next: [],
      };
      map.set(key, line);
    }
    if (clockMinutes(row.departs) >= nowMinutes && !line.next.includes(row.departs)) line.next.push(row.departs);
  }
  for (const line of map.values()) line.next.sort();
  return [...map.values()];
}

export function StopPage() {
  const params = useParams();
  const state = useBusNow();
  const nowMinutes = useMinskMinutes();
  const [place, setPlace] = useState<StopRef | null>(null);
  const [missing, setMissing] = useState(false);
  const [departures, setDepartures] = useState<Departure[]>([]);
  const [only, setOnly] = useState<string | null>(null);
  const favorites = useFavorites();

  useEffect(() => {
    const id = Number(params.id);
    if (!id) return;
    let gone = false;
    setPlace(null);
    setMissing(false);
    setDepartures([]);
    api<{ stop: StopRef; departures: Departure[] }>(departuresPath(id))
      .then((data) => {
        if (gone) return;
        morph(() => {
          setPlace(data.stop);
          setDepartures(data.departures);
        });
      })
      .catch(() => {
        if (!gone) setMissing(true);
      });
    return () => {
      gone = true;
    };
  }, [params.id]);

  const routeCodes = useMemo(() => [...new Set(departures.map((row) => row.routeCode))], [departures]);
  const seo = useMemo(() => (missing ? privatePage("missingStop") : place ? stopPage(place, routeCodes) : null), [missing, place, routeCodes]);
  const allLines = linesOf(departures, nowMinutes);
  const codes = [...new Set(allLines.map((line) => line.routeCode))].sort((a, b) =>
    a.localeCompare(b, "ru", { numeric: true }),
  );
  const lines = only ? allLines.filter((line) => line.routeCode === only) : allLines;
  const running = lines
    .filter((line) => line.next.length > 0)
    .sort((a, b) => a.next[0].localeCompare(b.next[0]) || a.routeCode.localeCompare(b.routeCode, "ru", { numeric: true }));
  const finished = lines
    .filter((line) => line.next.length === 0)
    .sort((a, b) => a.routeCode.localeCompare(b.routeCode, "ru", { numeric: true }));

  function lineLink(line: Line) {
    return `/routes/${line.routeSlug}?dir=${line.directionPos}&stop=${encodeURIComponent(place?.slug ?? "")}`;
  }

  return (
    <Screen
      className="narrow"
      title={seo?.title}
      description={seo?.description}
      path={place ? seo?.path : undefined}
      robots={seo?.robots}
      jsonLd={seo?.jsonLd}
    >
      <header className="top">
        <Back />
        <Logo href="/" />
      </header>

      {missing ? (
        <h1 id="page-title" tabIndex={-1}>
          Остановка не найдена
        </h1>
      ) : !place ? (
        <>
          <h1 id="page-title" tabIndex={-1}>
            <span className="loading-title" aria-hidden="true" />
            <span className="clip">Загрузка</span>
          </h1>
          <BoardSkeleton rows={6} />
        </>
      ) : (
        <>
          <section className="intro">
            <p className="kicker">Остановка</p>
            <div className="stop-title">
              <h1 id="page-title" tabIndex={-1}>
                {place.name}
              </h1>
              <button
                type="button"
                className="stop-fav"
                aria-pressed={isFavorite(favorites, place.id)}
                aria-label={isFavorite(favorites, place.id) ? "В избранном" : "В избранное"}
                onClick={() => toggleFavorite(place)}
              >
                {isFavorite(favorites, place.id) ? <IconStarFilled size={22} /> : <IconStar size={22} />}
              </button>
            </div>
            {state.email ? (
              <div className="home-when" role="group" aria-label="На главной показывать">
                <span>На главной</span>
                <div className="home-when-picks">
                  <button
                    type="button"
                    aria-pressed={state.morning === place.id}
                    className="chip-btn"
                    onClick={() => void (state.morning === place.id ? clearStop("morning") : assignStop("morning", place.id))}
                  >
                    <IconSunrise size={16} /> утром
                  </button>
                  <button
                    type="button"
                    aria-pressed={state.evening === place.id}
                    className="chip-btn"
                    onClick={() => void (state.evening === place.id ? clearStop("evening") : assignStop("evening", place.id))}
                  >
                    <IconMoon size={16} /> вечером
                  </button>
                </div>
              </div>
            ) : null}
          </section>

          {codes.length > 6 ? (
            <div className="code-filter" role="group" aria-label="Фильтр по маршруту">
              <button type="button" aria-pressed={only === null} onClick={() => morph(() => setOnly(null))}>
                Все
              </button>
              {codes.map((code) => (
                <button
                  key={code}
                  type="button"
                  aria-pressed={only === code}
                  onClick={() => morph(() => setOnly(only === code ? null : code))}
                >
                  {code}
                </button>
              ))}
            </div>
          ) : null}

          {running.length === 0 ? (
            <p className="muted empty">Сегодня рейсов больше нет</p>
          ) : (
            <div className="card resting list morph-target">
              {running.map((line) => {
                const first = line.next[0];
                const wait = clockMinutes(first) - nowMinutes;
                return (
                  <Link key={line.key} to={lineLink(line)} className="line-row">
                    <span className={`badge ${line.kind === "bus" ? "bus" : "minibus"}`}>{line.routeCode}</span>
                    <span className="line-to">{toward(line.direction)}</span>
                    <span className="line-when">
                      <span className={wait <= 15 ? "time soon" : "time"}>{first}</span>
                      <span className="muted">{wait <= 60 ? waitLabel(wait) : line.next[1] ? `затем ${line.next[1]}` : ""}</span>
                    </span>
                  </Link>
                );
              })}
            </div>
          )}

          {finished.length > 0 ? (
            <details className="finished">
              <summary>Сегодня больше не ходят · {finished.length}</summary>
              <div className="card resting list">
                {finished.map((line) => (
                  <Link key={line.key} to={lineLink(line)} className="line-row past">
                    <span className={`badge ${line.kind === "bus" ? "bus" : "minibus"}`}>{line.routeCode}</span>
                    <span className="line-to">{toward(line.direction)}</span>
                  </Link>
                ))}
              </div>
            </details>
          ) : null}
        </>
      )}
    </Screen>
  );
}
