import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { go } from "../navigate.tsx";
import { toggleFavorite, useFavorites } from "../favorites.ts";
import { plural, toward } from "../names.ts";
import { clearStop, removeReminder, signOut, useBusNow } from "../session.ts";
import { Back } from "./Back.tsx";
import { Logo } from "./Logo.tsx";
import { BoardSkeleton } from "./Loading.tsx";
import { IconBell, IconLogout, IconMoon, IconPlus, IconStarFilled, IconSunrise, IconX } from "../icons.tsx";
import { pushSupported, sendTestNotification } from "../push.ts";
import { Screen } from "./Screen.tsx";

function Header() {
  return (
    <header className="top">
      <Back />
      <Logo href="/" />
    </header>
  );
}

export function Profile() {
  const state = useBusNow();
  const favorites = useFavorites();
  const navigate = useNavigate();
  const [pushNote, setPushNote] = useState<string | null>(null);

  if (!state.ready) {
    return (
      <Screen className="narrow profile-page" title="Профиль — BusNow" description="Остановки и напоминания." robots="noindex">
        <Header />
        <BoardSkeleton rows={4} />
      </Screen>
    );
  }

  if (!state.email) return <Navigate to="/login" replace />;

  async function leave() {
    await signOut();
    go(navigate, "/", "backward");
  }

  const slots = [
    { period: "morning" as const, label: "Утром", hint: "до 14:00", icon: <IconSunrise size={22} />, id: state.morning, name: state.morningName },
    { period: "evening" as const, label: "Вечером", hint: "после 14:00", icon: <IconMoon size={22} />, id: state.evening, name: state.eveningName },
  ];
  const savedCount = slots.filter((slot) => slot.id != null).length;
  const reminders = [...state.reminders].sort((a, b) => a.departs.localeCompare(b.departs));
  const stats = [
    { value: savedCount, label: plural(savedCount, "остановка", "остановки", "остановок") },
    { value: reminders.length, label: plural(reminders.length, "напоминание", "напоминания", "напоминаний") },
    { value: favorites.length, label: "в избранном" },
  ];

  return (
    <Screen className="narrow profile-page" title="Профиль — BusNow" description="Остановки и напоминания." robots="noindex">
      <Header />

      <section className="profile-hero">
        <div className="profile-id">
          <span className="profile-avatar" aria-hidden="true">
            {state.email.slice(0, 1).toUpperCase()}
          </span>
          <div className="profile-id-text">
            <p className="next-label">Профиль</p>
            <h1 id="page-title" tabIndex={-1} className="profile-email">
              {state.email}
            </h1>
          </div>
        </div>
        <dl className="profile-stats">
          {stats.map((stat) => (
            <div key={stat.label}>
              <dt className="time">{stat.value}</dt>
              <dd>{stat.label}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="profile-block">
        <h2 className="group-label">Остановки на главной</h2>
        <div className="profile-slots">
          {slots.map((slot) =>
            slot.id != null && slot.name ? (
              <div key={slot.period} className="slot-card card resting">
                <span className="slot-icon">{slot.icon}</span>
                <span className="slot-when">
                  {slot.label} <span className="muted">· {slot.hint}</span>
                </span>
                <a className="slot-name" href={`/stops/${slot.id}`}>
                  {slot.name}
                </a>
                <button type="button" className="ghost-btn" onClick={() => void clearStop(slot.period)}>
                  Убрать
                </button>
              </div>
            ) : (
              <a key={slot.period} className="slot-card slot-empty" href="/">
                <span className="slot-icon">{slot.icon}</span>
                <span className="slot-when">
                  {slot.label} <span className="muted">· {slot.hint}</span>
                </span>
                <span className="slot-name muted">Выбрать остановку</span>
                <span className="slot-plus">
                  <IconPlus size={16} />
                </span>
              </a>
            ),
          )}
        </div>
      </section>

      <section className="profile-block">
        <h2 className="group-label">Напоминания</h2>
        {pushSupported() && Notification.permission === "denied" ? (
          <p className="muted profile-push-hint">Уведомления заблокированы в браузере — разрешите их, чтобы напоминания приходили вовремя.</p>
        ) : null}
        {pushSupported() ? (
          <button
            type="button"
            className="chip-btn profile-push-test"
            onClick={() => {
              setPushNote(null);
              void sendTestNotification()
                .then(() =>
                  setPushNote(
                    "Должно прийти два уведомления: сразу «в браузере работают», затем «Проверка: уведомления работают» с сервера. Если первое есть, а второго нет — сверните окно и нажмите снова.",
                  ),
                )
                .catch((error: unknown) =>
                  setPushNote(error instanceof Error ? error.message : "Не получилось отправить"),
                );
            }}
          >
            <IconBell size={16} /> Проверить уведомления
          </button>
        ) : null}
        {pushNote ? <p className="muted profile-push-hint">{pushNote}</p> : null}
        {reminders.length === 0 ? (
          <div className="profile-empty">
            <span className="slot-icon">
              <IconBell size={22} />
            </span>
            <p>
              <strong>Напомним за 10 минут до рейса</strong>
              <span className="muted">Откройте маршрут, выберите остановку и нажмите «Напомнить» на карточке рейса.</span>
            </p>
          </div>
        ) : (
          <div className="card resting">
            {reminders.map((item) => (
              <div key={item.id} className="profile-row">
                <span className="reminder-time time">{item.departs}</span>
                <a className="profile-main" href={`/stops/${item.stopId}`}>
                  <strong>
                    <span className="badge bus">{item.routeCode}</span> {toward(item.direction)}
                  </strong>
                  <span className="muted">{item.stopName}</span>
                </a>
                <button
                  type="button"
                  className="icon-btn"
                  aria-label={`Удалить напоминание ${item.routeCode} в ${item.departs}`}
                  onClick={() => void removeReminder(item.id)}
                >
                  <IconX size={18} />
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="profile-block">
        <h2 className="group-label">Избранные остановки</h2>
        {favorites.length === 0 ? (
          <p className="muted empty">Отмечайте остановки звёздочкой — они появятся здесь и на главной.</p>
        ) : (
          <div className="fav-list">
            {favorites.map((stop) => (
              <span key={stop.id} className="fav-chip">
                <a href={`/stops/${stop.id}`}>
                  <IconStarFilled size={16} /> {stop.name}
                </a>
                <button type="button" aria-label={`Убрать ${stop.name} из избранного`} onClick={() => toggleFavorite(stop)}>
                  <IconX size={18} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <button type="button" className="leave-btn" onClick={() => void leave()}>
        <IconLogout size={18} />
        Выйти из аккаунта
      </button>
    </Screen>
  );
}
