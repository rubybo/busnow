import { Link } from "react-router";
import type { RouteListItem } from "../api.ts";
import { KIND_LABEL, kindOf } from "../names.ts";

export function RouteGrid({ routes }: { routes: RouteListItem[] }) {
  const groups = (["bus", "tram", "minibus"] as const)
    .map((kind) => ({ kind, items: routes.filter((route) => kindOf(route.code, route.kind) === kind) }))
    .filter((group) => group.items.length > 0);

  return (
    <div className="morph-routes">
      {groups.map((group) => (
        <section key={group.kind} className="pill-group">
          <h2 className="group-label">{KIND_LABEL[group.kind]}</h2>
          <div className="pill-grid">
            {group.items.map((route) => (
              <Link
                key={route.id}
                to={`/routes/${route.slug}`}
                className={`pill ${route.kind === "bus" ? "bus" : "minibus"}`}
                title={route.title}
              >
                {route.code.replace(/^Тр\s*/, "")}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
