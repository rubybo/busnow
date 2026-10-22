import { privatePage } from "../../page-seo.mjs";
import { Auth } from "./Auth.tsx";

const seo = privatePage("register");

export function Register() {
  return (
    <Auth
      title={seo.title}
      description={seo.description}
      heading="Регистрация"
      hint="Почта и пароль, без лишних полей."
      errorMessage="Нужны почта и пароль от 8 символов"
      mode="register"
      submitLabel="Создать аккаунт"
      passwordAutoComplete="new-password"
      switchText="Уже есть аккаунт?"
      switchHref="/login"
      switchLabel="Вход"
    />
  );
}
