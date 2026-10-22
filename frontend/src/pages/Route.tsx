import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useSearchParams } from "react-router";
import { api, type Departure, type RouteDetail, type StopRef } from "../api.ts";
import { departuresPath } from "../offline.ts";
import { privatePage, routePage } from "../../page-seo.mjs";
import { agoLabel, clockMinutes, dayTag, patternMatchesToday, useMinskMinutes, waitLabel } from "../clock.ts";
import { morph } from "../morph.ts";
import { KIND_LABEL, kindOf, toward } from "../names.ts";
import { IconBell, IconBellRing } from "../icons.tsx";
import { isReminded, toggleReminder, useBusNow } from "../session.ts";
import { Back } from "./Back.tsx";
import { BoardSkeleton } from "./Loading.tsx";
import { Logo } from "./Logo.tsx";
import { Screen } from "./Screen.tsx";

const RING = 2 * Math.PI * 30;

function Countdown({ left }: { left: number }) {
  const ratio = Math.max(0, Math.min(1, left / 60));
  return (
    <div className={left <= 15 ? "ring soon" : "ring"} aria-hidden="true">
      <svg viewBox="0 0 72 72">
        <circle className="ring-track" cx="36" cy="36" r="30" />
        <circle
          className="ring-fill"
          cx="36"
          cy="36"
          r="30"
          strokeDasharray={RING}
          strokeDashoffset={RING * (1 - ratio)}
        />
      </svg>
      <p className="ring-value">
        {Math.max(0, left)}
        <small>мин</small>
      </p>
    </div>
  );
}

type Pattern = RouteDetail["directions"][number]["patterns"][number];

function todayPattern(patterns: Pattern[]): Pattern | undefined {
  return patterns.find((pattern) => patternMatchesToday(pattern.name)) ?? patterns[0];
}

function byHour(times: string[]): Array<{ hour: number; times: string[] }> {
  const groups = new Map<number, string[]>();
  for (const time of times) {
    const hour = Math.floor(clockMinutes(time) / 60);
    groups.set(hour, [...(groups.get(hour) ?? []), time]);
  }
  return [...groups.entries()].sort((a, b) => a[0] - b[0]).map(([hour, list]) => ({ hour, times: list }));
}

export function RoutePage() {
  const { slug } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useBusNow();
  const [remindError, setRemindError] = useState<string | null>(null);
  const nowMinutes = useMinskMinutes();
  const [detail, setDetail] = useState<RouteDetail | null>(null);
  const [missing, setMissing] = useState(false);
  const [patternName, setPatternName] = useState<string | null>(null);
  const [today, setToday] = useState<Departure[]>([]);
  const [showPast, setShowPast] = useState(false);

  const dirIndex = Number(searchParams.get("dir") ?? "0") || 0;
  const stopParam = searchParams.get("stop");

  useEffect(() => {
    if (!slug) return;
    let gone = false;
    setDetail(null);
    setMissing(false);
    api<RouteDetail>(`/api/routes/${encodeURIComponent(slug)}`)
      .then((data) => !gone && morph(() => setDetail(data)))
      .catch(() => !gone && setMissing(true));
    return () => {
      gone = true;
    };
  }, [slug]);

  const route = detail?.route;
  const direction = detail?.directions[dirIndex] ?? detail?.directions[0];
  const stops = direction?.stops ?? [];
  const stop = stopParam ? stops.find((item) => item.slug === stopParam) : undefined;

  useEffect(() => {
    if (!stop || !state.email) return;
    let gone = false;
    api<{ stop: StopRef; departures: Departure[] }>(departuresPath(stop.id))
      .then((data) => !gone && setToday(data.departures))
      .catch(() => undefined);
    return () => {
      gone = true;
    };
  }, [stop?.id, state.email]);

  const patterns = (direction?.patterns ?? []).filter((item) =>
    stop ? item.stops.some((entry) => entry.id === stop.id && entry.times.length > 0) : true,
  );
  const pattern = patterns.find((item) => item.name === patternName) ?? todayPattern(patterns);
  const times = stop && pattern ? [...new Set(pattern.stops.find((entry) => entry.id === stop.id)?.times ?? [])].sort() : [];
  const isToday = pattern ? patternMatchesToday(pattern.name) : false;
  const todayTimes = (() => {
    const own = patterns.find((item) => patternMatchesToday(item.name));
    return stop && own ? own.stops.find((entry) => entry.id === stop.id)?.times ?? [] : [];
  })();
  const next = todayTimes.filter((time) => clockMinutes(time) >= nowMinutes).sort()[0] ?? null;
  const prev = todayTimes.filter((time) => clockMinutes(time) < nowMinutes).sort().at(-1) ?? null;
  const nextTrip =
    next && route && direction
      ? today.find((row) => row.routeSlug === route.slug && row.direction === direction.name && row.departs === next)
      : undefined;

  const groups = byHour(times);
  const currentHour = Math.floor(nowMinutes / 60);
  const visibleGroups = isToday && !showPast ? groups.filter((group) => group.hour >= currentHour) : groups;
  const hiddenHours = groups.length - visibleGroups.length;

  function go(params: Record<string, string>) {
    morph(() => {
      setPatternName(null);
      setShowPast(false);
      setSearchParams(params);
    });
  }

  function flip() {
    if (!detail || detail.directions.length < 2) return;
    const other = dirIndex === 0 ? 1 : 0;
    const same = stop && detail.directions[other].stops.find((item) => item.name === stop.name);
    go(same ? { dir: String(other), stop: same.slug } : { dir: String(other) });
  }

  const kind = route ? kindOf(route.code, route.kind) : "bus";
  const code = route?.code.replace(/^Тр\s*/, "") ?? "";
  const seo = useMemo(
    () =>
      missing
        ? privatePage("missingRoute")
        : route && detail
          ? routePage(route, detail.directions[0]?.stops ?? [])
          : null,
    [missing, route, detail],
  );

  return (
    <Screen
      className="narrow"
      title={seo?.title}
      description={seo?.description}
      path={route ? seo?.path : undefined}
      robots={seo?.robots}
      jsonLd={seo?.jsonLd}
    >
      <header className="top">
        <Back />
        <Logo href="/" />
      </header>

      {missing ? (
        <h1 id="page-title" tabIndex={-1}>
          Маршрут не найден
        </h1>
      ) : !route || !detail || !direction ? (
        <>
          <h1 id="page-title" tabIndex={-1}>
            <span className="loading-title" aria-hidden="true" />
            <span className="clip">Загрузка</span>
          </h1>
          <BoardSkeleton rows={6} />
        </>
      ) : !stop ? (
        <>
          <section className="intro">
            <p className="kicker">{KIND_LABEL[kind]}</p>
            <h1 id="page-title" tabIndex={-1} className="route-heading">
              <span className={`badge big ${route.kind === "bus" ? "bus" : "minibus"}`}>{code}</span>
              <span>{route.title}</span>
            </h1>
          </section>

          {detail.directions.length > 1 ? (
            <div className="seg" role="group" aria-label="Направление">
              {detail.directions.map((item, index) => (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={index === dirIndex}
                  onClick={() => go(index ? { dir: String(index) } : {})}
                >
                  {index === 0 ? "→" : "←"} {toward(item.name)}
                </button>
              ))}
            </div>
          ) : null}

          <p className="muted hint">Выберите остановку</p>
          <ol className="card resting stops-line morph-target">
            {stops.map((item, index) => (
              <li key={`${item.id}-${index}`}>
                <button type="button" onClick={() => go({ dir: String(dirIndex), stop: item.slug })}>
                  {item.name}
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <>
          <section className="intro">
            <p className="kicker route-line">
              <span className={`badge ${route.kind === "bus" ? "bus" : "minibus"}`}>{code}</span>
              <span>{dirIndex === 0 ? "→" : "←"} {toward(direction.name)}</span>
            </p>
            <h1 id="page-title" tabIndex={-1}>
              {stop.name}
            </h1>
          </section>

          {next ? (
            <div className="next">
              <p className="next-label">Следующий</p>
              <div className="next-main">
                <p className="next-time time">{next}</p>
                <Countdown left={clockMinutes(next) - nowMinutes} />
              </div>
              {prev ? (
                <p className="next-then">
                  Предыдущий {prev}, {agoLabel(nowMinutes - clockMinutes(prev))}
                </p>
              ) : null}
              {nextTrip ? (
                <button
                  type="button"
                  className="next-remind"
                  aria-pressed={isReminded(state, stop.id, route.code, direction.name, next)}
                  onClick={() => {
                    setRemindError(null);
                    void toggleReminder(stop.id, nextTrip.id, route.code, direction.name, next).catch((error: unknown) => {
                      setRemindError(error instanceof Error ? error.message : "Не получилось");
                    });
                  }}
                >
                  {isReminded(state, stop.id, route.code, direction.name, next) ? (
                    <>
                      <IconBellRing size={16} /> Напомним за 10 мин
                    </>
                  ) : (
                    <>
                      <IconBell size={16} /> Напомнить за 10 мин
                    </>
                  )}
                </button>
              ) : null}
              {remindError ? <p className="next-remind-error">{remindError}</p> : null}
            </div>
          ) : (
            <p className="done-today">Сегодня рейсов больше нет</p>
          )}

          {patterns.length > 1 ? (
            <div className="seg" role="group" aria-label="Дни">
              {patterns.map((item) => (
                <button
                  key={item.name}
                  type="button"
                  aria-pressed={item === pattern}
                  onClick={() => morph(() => setPatternName(item.name))}
                >
                  {dayTag(item.name).text}
                </button>
              ))}
            </div>
          ) : pattern ? (
            <p className="muted hint">{dayTag(pattern.name).text}</p>
          ) : null}

          {hiddenHours > 0 ? (
            <button type="button" className="text-link past-toggle" onClick={() => setShowPast(true)}>
              Показать прошедшие часы ({hiddenHours})
            </button>
          ) : null}

          <div className="card resting timetable morph-target">
            {visibleGroups.map((group) => (
              <div key={group.hour} className="hour-row">
                <p className="hour-label time">{String(group.hour).padStart(2, "0")}</p>
                <p className="hour-times">
                  {group.times.map((time) => {
                    const past = isToday && clockMinutes(time) < nowMinutes;
                    const cls = ["minute", past && "past", isToday && time === next && "is-next"].filter(Boolean).join(" ");
                    return (
                      <span key={time} className={cls}>
                        {time.slice(3)}
                      </span>
                    );
                  })}
                </p>
              </div>
            ))}
          </div>

          <nav className="foot-links">
            {detail.directions.length > 1 ? (
              <button type="button" className="text-link" onClick={flip}>
                ⇄ Обратное направление
              </button>
            ) : null}
            <button type="button" className="text-link" onClick={() => go(dirIndex ? { dir: String(dirIndex) } : {})}>
              Все остановки маршрута
            </button>
            <Link className="text-link" to={`/stops/${stop.id}`}>
              Все маршруты на остановке
            </Link>
          </nav>
        </>
      )}
    </Screen>
  );
}
