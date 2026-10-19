import { flushSync } from "react-dom";

/** Commits a React state update inside a view transition so the loading skeleton morphs into the loaded content. */
export function morph(update: () => void): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || typeof document.startViewTransition !== "function") {
    update();
    return;
  }
  try {
    document.startViewTransition({ update: () => flushSync(update), types: ["load"] });
  } catch {
    // Browsers without typed transitions reject the options object.
    document.startViewTransition(() => flushSync(update));
  }
}
