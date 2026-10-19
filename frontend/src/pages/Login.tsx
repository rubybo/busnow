import { Auth } from "./Auth.tsx";

export function Login() {
  return (
    <Auth
      title="Вход — BusNow"
      description="Вход, чтобы запомнить остановку и напоминание."
      heading="Вход"
      hint="Чтобы запомнить остановку и напоминание."
      errorMessage="Нужны почта и пароль от 8 символов"
      mode="login"
      submitLabel="Войти"
      passwordAutoComplete="current-password"
      switchText="Нет аккаунта?"
      switchHref="/register"
      switchLabel="Регистрация"
    />
  );
}
