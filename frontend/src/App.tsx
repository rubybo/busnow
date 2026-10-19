import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { TransitionNavigator } from "./navigate.tsx";
import { Home } from "./pages/Home.tsx";
import { Login } from "./pages/Login.tsx";
import { Register } from "./pages/Register.tsx";
import { StopPage } from "./pages/Stop.tsx";

export function App() {
  return (
    <BrowserRouter useTransitions={false}>
      <TransitionNavigator />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/stops/:id" element={<StopPage />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
