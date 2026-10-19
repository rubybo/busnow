function Wordmark() {
  return (
    <>
      Bus<span className="logo-now">now</span>
      <span className="logo-dot" />
    </>
  );
}

export function Logo({ href }: { href?: string }) {
  if (href) {
    return (
      <a className="logo" href={href} aria-label="BusNow, на главную" data-direction="back">
        <Wordmark />
      </a>
    );
  }
  return (
    <p className="logo" aria-label="BusNow">
      <Wordmark />
    </p>
  );
}
