export type Direction = "forward" | "backward";

export function transition(update: () => void, direction: Direction): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce) {
    update();
    return;
  }
  const root = document.documentElement;
  const token = `${direction}:${Date.now()}`;
  root.dataset.nav = direction;
  root.dataset.navToken = token;
  update();
  const screen = document.querySelector(".screen");
  const clear = () => {
    if (root.dataset.navToken === token) {
      delete root.dataset.nav;
      delete root.dataset.navToken;
    }
  };
  if (!(screen instanceof HTMLElement)) {
    clear();
    return;
  }
  screen.addEventListener("animationend", clear, { once: true });
  window.setTimeout(clear, 700);
}
