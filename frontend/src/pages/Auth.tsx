import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { api } from "../api.ts";
import { go } from "../navigate.tsx";
import { signIn, signUp } from "../session.ts";
import { Back } from "./Back.tsx";
import { Logo } from "./Logo.tsx";
import { Screen } from "./Screen.tsx";

type AuthProps = {
  title: string;
  description: string;
  heading: string;
  hint: string;
  errorMessage: string;
  mode: "login" | "register";
  submitLabel: string;
  passwordAutoComplete: "current-password" | "new-password";
  switchText: string;
  switchHref: string;
  switchLabel: string;
};

type Captcha = { id: string; svg: string };

export function Auth({
  title,
  description,
  heading,
  hint,
  errorMessage,
  mode,
  submitLabel,
  passwordAutoComplete,
  switchText,
  switchHref,
  switchLabel,
}: AuthProps) {
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState<Captcha | null>(null);

  async function reloadCaptcha() {
    const next = await api<Captcha>("/api/auth/captcha");
    setCaptcha(next);
  }

  useEffect(() => {
    let gone = false;
    api<Captcha>("/api/auth/captcha")
      .then((next) => {
        if (!gone) setCaptcha(next);
      })
      .catch(() => {
        if (!gone) setError("Не удалось загрузить проверку");
      });
    return () => {
      gone = true;
    };
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    const answer = String(data.get("captcha") ?? "").trim();
    if (!next.includes("@") || password.length < 8) {
      setError(errorMessage);
      return;
    }
    if (!captcha || answer.length !== 5) {
      setError("Введите код с картинки");
      return;
    }
    setError("");
    try {
      if (mode === "register") await signUp(next, password, captcha.id, answer);
      else await signIn(next, password, captcha.id, answer);
      go(navigate, "/profile", "forward");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage);
      void reloadCaptcha().catch(() => undefined);
    }
  }

  return (
    <Screen className="auth" title={title} description={description} robots="noindex">
      <header className="top">
        <Back />
        <Logo href="/" />
      </header>
      <section className="intro">
        <h1 id="page-title" tabIndex={-1}>
          {heading}
        </h1>
        <p className="lede">{hint}</p>
      </section>
      <form onSubmit={onSubmit} noValidate>
        <label>
          <span>Почта</span>
          <input
            className="resting"
            type="email"
            name="email"
            inputMode="email"
            autoComplete={mode === "register" ? "email" : "username"}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            placeholder="you@mail.ru"
          />
        </label>
        <label>
          <span>Пароль</span>
          <input
            className="resting"
            type="password"
            name="password"
            autoComplete={passwordAutoComplete}
            required
            minLength={8}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Пароль"
          />
        </label>
        <div className="captcha">
          <span className="captcha-pic">
            {captcha ? (
              <img src={`data:image/svg+xml,${encodeURIComponent(captcha.svg)}`} alt="Проверочный код" width={180} height={64} />
            ) : (
              <span className="captcha-wait">Загружаем</span>
            )}
            <button type="button" className="captcha-refresh" onClick={() => void reloadCaptcha().catch(() => setError("Не удалось загрузить проверку"))}>
              Другой
            </button>
          </span>
          <input
            className="resting"
            name="captcha"
            aria-label="Код с картинки"
            inputMode="numeric"
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            maxLength={5}
            required
            placeholder="5 цифр"
          />
        </div>
        {error ? (
          <p className="error" role="alert">
            {error}
          </p>
        ) : null}
        <button className="raised" type="submit">
          {submitLabel}
        </button>
      </form>
      <p className="switch-auth">
        {switchText} <a href={switchHref}>{switchLabel}</a>
      </p>
    </Screen>
  );
}
