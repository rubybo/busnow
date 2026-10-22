import { privatePage } from "../../page-seo.mjs";
import { Auth } from "./Auth.tsx";

const seo = privatePage("login");

export function Login() {
  return (
    <Auth
      title={seo.title}
      description={seo.description}
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
