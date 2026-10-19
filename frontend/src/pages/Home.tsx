import { useEffect, useState } from "react";
import { api, type Departure as ApiDeparture, type StopRef } from "../api.ts";
import type { Departure } from "../data.ts";
import { activeStopId, chooseStop, setPeriod, signOut, useBusNow } from "../session.ts";
import { Board } from "./Board.tsx";
import { Logo } from "./Logo.tsx";
import { Next, RouteArt } from "./Next.tsx";
import { Screen } from "./Screen.tsx";

function asRows(stopId: number, rows: ApiDeparture[], period: "morning" | "evening"): Departure[] {
  return rows
    .filter((row) => (period === "morning" ? row.departs < "14:00" : row.departs >= "14:00"))
    .map((row) => ({
      id: String(row.id),
      stopId,
      time: row.departs,
      route: row.routeCode,
      kind: row.kind,
      direction: row.direction,
      days: row.pattern,
      period,
    }));
}

function isPast(time: string): boolean {
  const [hour, minute] = time.split(":").map(Number);
  const now = new Date();
  return hour * 60 + minute <= now.getHours() * 60 + now.getMinutes();
}

export function Home() {
  const state = useBusNow();
  const [query, setQuery] = useState("");
  const [catalog, setCatalog] = useState<StopRef[]>([]);
  const [place, setPlace] = useState<StopRef | null>(null);
  const [rows, setRows] = useState<Departure[]>([]);
  const stopId = activeStopId(state);

  useEffect(() => {
    const handle = window.setTimeout(() => {
      api<{ stops: StopRef[] }>(`/api/stops?q=${encodeURIComponent(query)}`)
        .then((data) => setCatalog(data.stops))
        .catch(() => setCatalog([]));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    if (stopId == null) {
      setPlace(null);
      setRows([]);
      return;
    }
    let gone = false;
    api<{ stop: StopRef; departures: ApiDeparture[] }>(`/api/stops/${stopId}/departures`)
      .then((data) => {
        if (gone) return;
        setPlace(data.stop);
        setRows(asRows(data.stop.id, data.departures, state.period));
      })
      .catch(() => {
        if (!gone) {
          setPlace(null);
          setRows([]);
        }
      });
    return () => {
      gone = true;
    };
  }, [stopId, state.period]);

  const upcoming = rows.filter((row) => !isPast(row.time));
  const next = upcoming[0];
  const matches = catalog;

  function pick(id: number) {
    chooseStop(id);
    setQuery("");
  }

  return (
    <Screen
      title="BusNow — расписание Новополоцка"
      description="Утренняя и вечерняя остановка, опубликованное расписание автобусов и маршруток."
    >
      <header className="top">
        <Logo />
        <span className="city">Новополоцк</span>
      </header>

      <div className="stage">
        <div className="stage-main">
          {place ? (
            <section className="intro">
              <h1 id="page-title" tabIndex={-1}>
                <a href={`/stops/${place.id}`}>{place.name}</a>
              </h1>
              <p className="quiet">{state.period === "morning" ? "Утро · сегодня" : "Вечер · сегодня"}</p>
            </section>
          ) : (
            <section className="intro hero">
              <RouteArt />
              <h1 id="page-title" tabIndex={-1}>
                Остановка не выбрана
              </h1>
              <p className="quiet">Найдите остановку, и здесь появится табло</p>
            </section>
          )}

          <div className="switch raised" role="group" aria-label="Время суток">
            <button
              type="button"
              className={state.period === "morning" ? "on" : "off"}
              aria-pressed={state.period === "morning"}
              onClick={() => setPeriod("morning")}
            >
              Утро
            </button>
            <button
              type="button"
              className={state.period === "evening" ? "on" : "off"}
              aria-pressed={state.period === "evening"}
              onClick={() => setPeriod("evening")}
            >
              Вечер
            </button>
          </div>

          {place ? (
            next ? <Next rows={upcoming} /> : <p className="done-today">На сегодня рейсы закончились</p>
          ) : (
            <>
              <label className="field resting">
                <span className="clip">Название остановки</span>
                <input
                  type="search"
                  name="q"
                  placeholder="Название остановки"
                  autoComplete="off"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
              {matches.length === 0 ? (
                <p className="note">Такой остановки нет.</p>
              ) : (
                <div className="card resting">
                  {matches.map((match) => (
                    <button key={match.id} type="button" className="choice" onClick={() => pick(match.id)}>
                      {match.name}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="stage-side">
          {place ? (
            <>
              <Board rows={rows} variant="home" />
              <p className="note">Расписание может измениться.</p>
            </>
          ) : (
            <>
              <h2 className="section-title">Маршруты</h2>
              <ul className="routes">
                <li><span className="badge bus">4</span>автобус</li>
                <li><span className="badge bus">4А</span>автобус</li>
                <li><span className="badge minibus">10Тк</span>маршрутка</li>
                <li><span className="badge minibus">2Тк</span>маршрутка</li>
              </ul>
              <h2 className="section-title">Как это работает</h2>
              <ol className="steps">
                <li>
                  <span className="step-n">1</span>
                  <p>
                    <strong>Утренняя остановка</strong>
                    <span>До 14:00 главная показывает её табло</span>
                  </p>
                </li>
                <li>
                  <span className="step-n">2</span>
                  <p>
                    <strong>Вечерняя остановка</strong>
                    <span>После 14:00 — дорога домой</span>
                  </p>
                </li>
                <li>
                  <span className="step-n">3</span>
                  <p>
                    <strong>Напоминание</strong>
                    <span>Напишем за 10 минут до рейса</span>
                  </p>
                </li>
              </ol>
            </>
          )}
        </div>
      </div>

      <footer>
        <p>busnow.online</p>
        {state.email ? (
          <button type="button" className="quiet-link" onClick={signOut}>
            Выйти
          </button>
        ) : (
          <a href="/login">Войти</a>
        )}
      </footer>
    </Screen>
  );
}
