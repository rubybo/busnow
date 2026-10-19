export function RouteArt() {
  return (
    <svg className="route-art" viewBox="0 0 342 120" aria-hidden="true">
      <path
        d="M24 92 C 90 92, 92 28, 160 28 S 250 92, 318 40"
        fill="none"
        stroke="var(--line)"
        strokeWidth="6"
        strokeLinecap="round"
      />
      <path d="M24 92 C 90 92, 92 28, 160 28" fill="none" stroke="var(--ink)" strokeWidth="6" strokeLinecap="round" />
      <circle cx="24" cy="92" r="9" fill="var(--surface)" stroke="var(--ink)" strokeWidth="4" />
      <circle cx="318" cy="40" r="9" fill="var(--surface)" stroke="var(--line)" strokeWidth="4" />
      <circle cx="160" cy="28" r="14" fill="var(--ink)" />
      <circle cx="160" cy="28" r="5" fill="var(--surface)" />
    </svg>
  );
}
