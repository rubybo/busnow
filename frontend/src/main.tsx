import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import { initPushListeners, registerServiceWorker } from "./push.ts";
import "./styles.css";
import "./brand.css";

void registerServiceWorker();
initPushListeners();
const root = document.querySelector("#app");
if (!(root instanceof HTMLElement)) {
  throw new Error("Missing #app");
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
