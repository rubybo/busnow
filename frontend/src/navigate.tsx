import { useEffect } from "react";
import { flushSync } from "react-dom";
import { useNavigate } from "react-router";
import { appPath } from "./app-path.ts";
import { transition, type Direction } from "./nav.ts";

export function go(navigate: ReturnType<typeof useNavigate>, to: string, direction: Direction): void {
  if (!appPath(to)) return;
  transition(() => {
    flushSync(() => {
      navigate(to);
    });
  }, direction);
}

export function TransitionNavigator(): null {
  const navigate = useNavigate();

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL(anchor.href, location.href);
      } catch {
        event.preventDefault();
        return;
      }
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        event.preventDefault();
        return;
      }
      const next = appPath(url.pathname, url.search, url.hash);
      if (!next || url.origin !== location.origin) return;
      if (url.pathname === location.pathname && url.search === location.search && url.hash) return;
      event.preventDefault();
      event.stopPropagation();
      const direction: Direction = anchor.dataset.direction === "back" ? "backward" : "forward";
      go(navigate, next, direction);
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [navigate]);

  return null;
}
