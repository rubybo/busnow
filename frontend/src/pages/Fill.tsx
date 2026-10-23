import type { Forecast } from "../api.ts";

const SHORT: Record<Forecast["level"], string> = {
  free: "Можно сесть",
  standing: "Только стоя",
  packed: "Лучше следующий",
};

const LIT: Record<Forecast["level"], number> = { free: 1, standing: 2, packed: 3 };

export function FillNote({ forecast, aside, prominent = false }: { forecast: Forecast; aside?: string; prominent?: boolean }) {
  const label = SHORT[forecast.level];
  const named = aside ? `${label}, ${forecast.occupancy}%. ${aside}` : `${label}, ${forecast.occupancy}%`;
  if (prominent) {
    const lit = LIT[forecast.level];
    return (
      <span className={`forecast forecast-${forecast.level}`} aria-label={`Прогноз: ${named}`}>
        <svg className="forecast-ring" viewBox="0 0 16 16" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <circle
              key={index}
              className={index < lit ? "forecast-ring-fill" : "forecast-ring-track"}
              cx="8"
              cy="8"
              r="6"
              pathLength="1"
              transform={`rotate(${index * 120} 8 8)`}
              style={index < lit ? { animationDelay: `${80 + index * 90}ms` } : undefined}
            />
          ))}
        </svg>
        <span className="forecast-name">{label}</span>
      </span>
    );
  }
  return (
    <span className="fill-line" aria-label={named}>
      <span className={`fill fill-${forecast.level}`}>
        <span className="fill-dot" aria-hidden="true" />
        {label}
        <span className="fill-pct">{forecast.occupancy}%</span>
      </span>
      {aside ? <span className="fill-aside">{aside}</span> : null}
    </span>
  );
}
