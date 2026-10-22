import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
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

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const next = String(data.get("email") ?? "").trim();
    const password = String(data.get("password") ?? "");
    if (!next.includes("@") || password.length < 8) {
      setError(errorMessage);
      return;
    }
    setError("");
    try {
      if (mode === "register") await signUp(next, password);
      else await signIn(next, password);
      go(navigate, "/profile", "forward");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : errorMessage);
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
