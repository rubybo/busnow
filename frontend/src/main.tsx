import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { keepFavoritesOffline } from "./favorites.ts";
import { startOffline } from "./offline.ts";
import { startPresence } from "./presence.ts";
import { initPushListeners, registerServiceWorker } from "./push.ts";
import "./styles.css";
import "./brand.css";

void registerServiceWorker();
initPushListeners();
startOffline();
keepFavoritesOffline();
startPresence();
window.setTimeout(() => {
  void import("./pages/Stop.tsx");
  void import("./pages/Route.tsx");
  void import("./pages/Login.tsx");
  void import("./pages/Register.tsx");
  void import("./pages/Profile.tsx");
}, 1000);
const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
