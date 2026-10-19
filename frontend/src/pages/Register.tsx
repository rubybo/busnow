import { Auth } from "./Auth.tsx";

export function Register() {
  return (
    <Auth
      title="Регистрация — BusNow"
      description="Регистрация в BusNow."
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
