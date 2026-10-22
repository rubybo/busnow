import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { TransitionNavigator } from "./navigate.tsx";
import { useOffline } from "./offline.ts";
import { Home } from "./pages/Home.tsx";
import { Login } from "./pages/Login.tsx";
import { Profile } from "./pages/Profile.tsx";
import { Register } from "./pages/Register.tsx";
import { RoutePage } from "./pages/Route.tsx";
import { StopPage } from "./pages/Stop.tsx";

export function App() {
  return (
    <BrowserRouter useTransitions={false}>
      <TransitionNavigator />
      <OfflineNote />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stops/:id" element={<StopPage />} />
        <Route path="/routes/:slug" element={<RoutePage />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

function OfflineNote() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <p className="offline-note" role="status">
      Нет сети · расписание сохранено
    </p>
  );
}
