import { useEffect, useState } from "react";
import { useParams } from "react-router";
import { api, type Departure as ApiDeparture, type StopRef } from "../api.ts";
import type { Departure } from "../data.ts";
import { assignStop, isReminded, toggleReminder, useBusNow } from "../session.ts";
import { Board } from "./Board.tsx";
import { Logo } from "./Logo.tsx";
import { Screen } from "./Screen.tsx";

export function StopPage() {
  const params = useParams();
  const state = useBusNow();
  const [place, setPlace] = useState<StopRef | null>(null);
  const [missing, setMissing] = useState(false);
  const [rows, setRows] = useState<Departure[]>([]);

  useEffect(() => {
    const id = Number(params.id);
    if (!id) return;
    let gone = false;
    api<{ stop: StopRef; departures: ApiDeparture[] }>(`/api/stops/${id}/departures`)
      .then((data) => {
        if (gone) return;
        setPlace(data.stop);
        setRows(
          data.departures.map((row) => ({
            id: String(row.id),
            stopId: data.stop.id,
            time: row.departs,
            route: row.routeCode,
            kind: row.kind,
            direction: row.direction,
            days: row.pattern,
            period: row.departs < "14:00" ? "morning" : "evening",
          })),
        );
      })
      .catch(() => {
        if (!gone) setMissing(true);
      });
    return () => {
      gone = true;
    };
  }, [params.id]);

  return (
    <Screen
      title={`${place?.name ?? "Остановка"} — BusNow`}
      description="Время отправления и напоминание за 10 минут."
    >
      <header className="top">
        <a data-direction="back" href="/">
          Назад
        </a>
        <Logo href="/" />
      </header>

      {missing ? (
        <section className="intro">
          <h1 id="page-title" tabIndex={-1}>
            Остановка не найдена
          </h1>
        </section>
      ) : place ? (
        <div className="stage">
          <div className="stage-main">
          <section className="intro">
            <h1 id="page-title" tabIndex={-1}>
              {place.name}
            </h1>
            <p className="quiet">Отправления за день</p>
          </section>

          <div className="slots">
            <button
              type="button"
              className={state.morning === place.id ? "slot on raised" : "slot off resting"}
              onClick={() => {
                if (!state.email) return;
                void assignStop("morning", place.id);
              }}
            >
              Это утро
            </button>
            <button
              type="button"
              className={state.evening === place.id ? "slot on raised" : "slot off resting"}
              onClick={() => {
                if (!state.email) return;
                void assignStop("evening", place.id);
              }}
            >
              Это вечер
            </button>
          </div>
          </div>
          <div className="stage-side">
          <Board
            rows={rows}
            variant="day"
            aside={(row, past) => {
              if (past) return null;
              if (!state.email) {
                return (
                  <a className="remind" href="/login">
                    Напомнить
                  </a>
                );
              }
              const on = isReminded(state, place.id, row.route, row.direction, row.time);
              return (
                <button
                  type="button"
                  className="remind"
                  onClick={() => toggleReminder(place.id, Number(row.id), row.route, row.direction, row.time)}
                >
                  {on ? "Напомним" : "Напомнить"}
                </button>
              );
            }}
          />
          <p className="note">Расписание может измениться.</p>
          </div>
        </div>
      ) : (
        <section className="intro">
          <h1 id="page-title" tabIndex={-1}>
            Загрузка
          </h1>
        </section>
      )}

      <footer>
        <p>Новополоцк</p>
      </footer>
    </Screen>
  );
}
