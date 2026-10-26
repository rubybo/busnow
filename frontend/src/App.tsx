import { lazy, Suspense } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { TransitionNavigator } from "./navigate.tsx";
import { useOffline } from "./offline.ts";
import { Home } from "./pages/Home.tsx";

const StopPage = lazy(() => import("./pages/Stop.tsx").then((mod) => ({ default: mod.StopPage })));
const RoutePage = lazy(() => import("./pages/Route.tsx").then((mod) => ({ default: mod.RoutePage })));
const Profile = lazy(() => import("./pages/Profile.tsx").then((mod) => ({ default: mod.Profile })));
const Login = lazy(() => import("./pages/Login.tsx").then((mod) => ({ default: mod.Login })));
const Register = lazy(() => import("./pages/Register.tsx").then((mod) => ({ default: mod.Register })));

export function App() {
  return (
    <BrowserRouter useTransitions={false}>
      <TransitionNavigator />
      <OfflineNote />
      <Suspense fallback={<main className="screen narrow" />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/stops/:id" element={<StopPage />} />
          <Route path="/routes/:slug" element={<RoutePage />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function OfflineNote() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <p className="offline-note" role="status">
      Нет сети
    </p>
  );
}
