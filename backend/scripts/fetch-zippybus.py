"""Fetch Novopolotsk routes, stops, and per-stop schedules from zippybus.com."""

import html as html_lib
import json
import re
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")

BASE = "https://zippybus.com/by/novopolotsk"
OUT = Path(__file__).resolve().parents[1] / "data" / "zippy-seed.json"

DAY_MAP = {
    "Sunday": "sun",
    "Monday": "mon",
    "Tuesday": "tue",
    "Wednesday": "wed",
    "Thursday": "thu",
    "Friday": "fri",
    "Saturday": "sat",
}


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (BusNow/1.0)"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        return resp.read().decode("utf-8")


def clean(text: str) -> str:
    text = html_lib.unescape(re.sub(r"<[^>]+>", " ", text))
    return re.sub(r"\s+", " ", text).strip()


def parse_stop_catalog() -> dict[str, str]:
    raw = fetch(f"{BASE}/stop")
    out: dict[str, str] = {}
    for slug, inner in re.findall(rf'href="{BASE}/stop/([^"]+)"[^>]*>(.*?)</a>', raw, re.S):
        out[slug] = clean(inner)
    return out


def parse_routes_index() -> list[dict]:
    raw = fetch(BASE)
    routes: list[dict] = []
    seen = set()
    for path, code in re.findall(rf'href="{BASE}/((?:bus|tram|routetaxi)/[^"]+)"[^>]*>([^<]+)</a>', raw):
        if path in seen:
            continue
        seen.add(path)
        kind_raw, slug = path.split("/", 1)
        kind = "minibus" if kind_raw == "routetaxi" else "bus"
        code_clean = clean(code)
        if kind_raw == "tram":
            code_clean = f"Тр {code_clean}"
            slug = f"tram-{slug}"
        routes.append({"path": path, "kind": kind, "slug": slug, "code": code_clean})
    return routes


def parse_route_page(route: dict) -> dict:
    raw = fetch(f"{BASE}/{route['path']}")
    directions: list[dict] = []
    for col in re.split(r"<h4>", raw)[1:]:
        h4_end = col.find("</h4>")
        if h4_end == -1:
            continue
        dir_name = clean(col[:h4_end]).replace("➔", "→")
        stops: list[dict] = []
        seen_stops = set()
        for rel, label in re.findall(
            rf'<a[^>]+href="{BASE}/{re.escape(route["path"])}/([^"]+)"[^>]*>(.*?)</a>',
            col,
            re.S,
        ):
            parts = rel.split("/")
            if len(parts) != 2:
                continue
            dir_slug, stop_slug = parts
            if stop_slug in seen_stops:
                continue
            seen_stops.add(stop_slug)
            stops.append(
                {
                    "dirSlug": dir_slug,
                    "stopSlug": stop_slug,
                    "label": clean(label),
                }
            )
        if stops:
            directions.append({"name": dir_name, "stops": stops})
    title = directions[0]["name"].replace(" → ", " — ") if directions else f"Маршрут {route['code']}"
    return {**route, "title": title, "directions": directions}


def parse_stop_schedule(path: str, dir_slug: str, stop_slug: str) -> list[dict]:
    url = f"{BASE}/{path}/{dir_slug}/{stop_slug}"
    raw = fetch(url)
    pills = re.findall(
        r'<li[^>]+data-directionid="(\d+)"[^>]+data-days="([^"]+)"[^>]*>\s*<a[^>]*>([^<]+)</a>',
        raw,
    )
    schedules: list[dict] = []
    for did, days_csv, label in pills:
        block = re.search(rf'<div data-directionid="{did}"[^>]*>(.*?)</div>', raw, re.S)
        if not block:
            continue
        times = re.findall(r">(\d{2}:\d{2})<", block.group(1))
        if not times:
            continue
        days = [DAY_MAP[d.strip()] for d in days_csv.split(",") if d.strip() in DAY_MAP]
        schedules.append({"pattern": clean(label), "days": days, "times": times})
    return schedules


def main() -> int:
    print("Fetching stop catalog...")
    stop_catalog = parse_stop_catalog()
    print(f"  {len(stop_catalog)} stops in catalog")

    print("Fetching routes index...")
    routes_idx = parse_routes_index()
    print(f"  {len(routes_idx)} routes")

    with ThreadPoolExecutor(max_workers=12) as ex:
        routes = list(ex.map(parse_route_page, routes_idx))

    tasks = []
    for r_i, route in enumerate(routes):
        for d_i, direction in enumerate(route["directions"]):
            for s_i, stop in enumerate(direction["stops"]):
                tasks.append((r_i, d_i, s_i, route["path"], stop["dirSlug"], stop["stopSlug"]))

    print(f"Fetching {len(tasks)} stop schedules...")
    done = 0
    with ThreadPoolExecutor(max_workers=24) as ex:
        fut_map = {
            ex.submit(parse_stop_schedule, path, dir_slug, stop_slug): (r_i, d_i, s_i)
            for (r_i, d_i, s_i, path, dir_slug, stop_slug) in tasks
        }
        for fut in as_completed(fut_map):
            r_i, d_i, s_i = fut_map[fut]
            try:
                routes[r_i]["directions"][d_i]["stops"][s_i]["schedules"] = fut.result()
            except Exception as err:
                routes[r_i]["directions"][d_i]["stops"][s_i]["schedules"] = []
                print(f"  warn {routes[r_i]['path']}: {err}")
            done += 1
            if done % 250 == 0 or done == len(tasks):
                print(f"  {done}/{len(tasks)}")

    stops_out: dict[str, str] = {}
    for route in routes:
        for direction in route["directions"]:
            for stop in direction["stops"]:
                slug = stop["stopSlug"]
                stops_out[slug] = stop_catalog.get(slug) or stop["label"]

    payload = {
        "version": "zippybus-2026-10-19",
        "source": BASE,
        "stops": [{"slug": slug, "name": name} for slug, name in sorted(stops_out.items(), key=lambda x: x[1])],
        "routes": routes,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(routes)} routes, {len(stops_out)} stops)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
