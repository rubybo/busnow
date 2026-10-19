import { useLayoutEffect, type ReactNode } from "react";
import { useLocation } from "react-router";
import { setPageMeta } from "../seo.ts";

type ScreenProps = {
  title: string;
  description: string;
  className?: string;
  robots?: "index" | "noindex";
  children: ReactNode;
};

export function Screen({ title, description, className, robots = "index", children }: ScreenProps) {
  const { pathname } = useLocation();

  useLayoutEffect(() => {
    setPageMeta({ title, description, path: pathname, robots });
    document.getElementById("page-title")?.focus();
  }, [title, description, pathname, robots]);

  return <div className={className ? `screen ${className}` : "screen"}>{children}</div>;
}
