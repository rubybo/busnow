export type Direction = "forward" | "backward";

function supportsTypedTransition(): boolean {
  return (
    typeof document.startViewTransition === "function" &&
    typeof CSS !== "undefined" &&
    CSS.supports("selector(:active-view-transition-type(forward))")
  );
}

export function transition(update: () => void, direction: Direction): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduce || !supportsTypedTransition()) {
    update();
    return;
  }
  document.startViewTransition({ update, types: [direction] });
}
