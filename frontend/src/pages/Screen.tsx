import { useLayoutEffect, type ReactNode } from "react";

type ScreenProps = {
  title: string;
  description: string;
  className?: string;
  children: ReactNode;
};

export function Screen({ title, description, className, children }: ScreenProps) {
  useLayoutEffect(() => {
    document.title = title;
    document.querySelector('meta[name="description"]')?.setAttribute("content", description);
    document.getElementById("page-title")?.focus();
  }, [title, description]);

  return <div className={className ? `screen ${className}` : "screen"}>{children}</div>;
}
