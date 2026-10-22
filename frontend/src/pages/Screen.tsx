import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { setPageMeta } from "../seo.ts";

type ScreenProps = {
  title?: string;
  description?: string;
  path?: string;
  className?: string;
  robots?: "index" | "noindex";
  jsonLd?: Record<string, unknown> | null;
  children: ReactNode;
};

export function Screen({ title = "", description = "", path, className, robots = "index", jsonLd = null, children }: ScreenProps) {
  const { pathname } = useLocation();
  const json = jsonLd ? JSON.stringify(jsonLd) : "";

  useLayoutEffect(() => {
    if (!title) return;
    setPageMeta({
      title,
      description,
      path: path ?? pathname,
      robots,
      jsonLd: json ? (JSON.parse(json) as Record<string, unknown>) : null,
    });
  }, [title, description, path, pathname, robots, json]);

  useLayoutEffect(() => {
    document.getElementById("page-title")?.focus();
  }, [pathname]);

  return <div className={className ? `screen ${className}` : "screen"}>{children}</div>;
}
