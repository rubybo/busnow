import { useEffect, useRef } from "react";
import type { HourPick } from "../clock.ts";

export function Hours({
  hours,
  value,
  onChange,
}: {
  hours: number[];
  value: HourPick;
  onChange: (value: HourPick) => void;
}) {
  const strip = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const box = strip.current;
    const active = box?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (!box || !active) return;
    const left = active.offsetLeft - (box.clientWidth - active.offsetWidth) / 2;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    box.scrollTo({ left: Math.max(left, 0), behavior: reduce ? "auto" : "smooth" });
  }, [value, hours.length]);

  return (
    <div className="hours" role="group" aria-labelledby="hour-label" ref={strip}>
      <button type="button" aria-pressed={value === "now"} onClick={() => onChange("now")}>
        Сейчас
      </button>
      {hours.map((hour) => (
        <button key={hour} type="button" aria-pressed={value === hour} onClick={() => onChange(hour)}>
          {String(hour).padStart(2, "0")}:00
        </button>
      ))}
    </div>
  );
}
