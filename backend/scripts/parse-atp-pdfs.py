"""Parse ATP schedule PDFs from Downloads into backend/data/atp-seed.json."""

import json
import os
import re
import sys
from pathlib import Path

import pymupdf

DOWNLOADS = Path(os.environ.get("ATP_PDF_DIR", Path.home() / "Downloads"))
OUT = Path(__file__).resolve().parents[1] / "data" / "atp-seed.json"


def route_codes_from_name(name: str) -> list[str]:
    if "21А" in name or "21A" in name.upper():
        return ["21А"]
    if "20, 20" in name or "20, 20А" in name or "20_ 20" in name:
        return ["20", "20А"]
    m = re.search(r"№\s*([0-9]+[АA]?)", name)
    if m:
        return [m.group(1).replace("A", "А")]
    m = re.search(r"Маршрут\s*№?\s*([0-9]+[АA]?)", name)
    if m:
        return [m.group(1).replace("A", "А")]
    return []


def parse_time(cell: str | None) -> str | None:
    if not cell:
        return None
    text = str(cell).replace("\n", " ").strip()
    if not text or text in {"-", "---", "—"}:
        return None
    m = re.search(r"(\d{1,2})\s*[.\-:\s/]+\s*(\d{2})\b", text)
    if not m:
        return None
    h, mi = int(m.group(1)), int(m.group(2))
    if h > 23 or mi > 59:
        return None
    return f"{h:02d}:{mi:02d}"


def clean_header(cell: str | None) -> str:
    if not cell:
        return ""
    return re.sub(r"\s+", " ", str(cell).replace("\n", " ")).strip()


def short_place(header: str) -> str:
    h = clean_header(header)
    h = re.sub(r"^(Отправление|Отправления|Прибытие|от)\s+(с|от)\s+", "", h, flags=re.I)
    h = re.sub(r"^д\.с\.\s*", "", h, flags=re.I)
    return h.strip(" .")[:80]


def slugify_stop(header: str | None) -> str:
    if not header:
        return ""
    h = header.lower()
    mapping = [
        (r"подкастельц", "podkasteltsy"),
        (r"гайдар", "gaydara"),
        (r"автовокзал|а/в г", "avtovokzal"),
        (r"швейн", "shveynaya"),
        (r"ж/д вокзал", "jd_vokzal_polotsk"),
        (r"3-я проход|3-я пр", "proh3"),
        (r"полимир", "polimir"),
        (r"ст\.\s*«?новополоцк", "st_novopolotsk"),
        (r"тсб|7-я проход|7 -\s*я проход", "tsb"),
        (r"бвк", "bvk"),
        (r"весовая", "vesovaya_bvk"),
        (r"ропнян", "ropnyanskaya"),
        (r"березк", "berezka"),
        (r"нафтан", "naftan"),
        (r"междуречье-1", "mezhurechye1"),
        (r"ул\.\s*калинина|калинина", "kalinina"),
        (r"9-й микр", "micro9"),
        (r"денисов", "denisova"),
        (r"лугов", "lugovaya"),
        (r"залюхов", "zalyukhovskaya"),
        (r"1-я палат", "palatka1"),
        (r"поликлиник", "polyclinic1"),
        (r"слободск", "slobodskaya"),
        (r"зодиак", "zodiak"),
        (r"стекловолокн", "steklovolokno"),
        (r"боровух|уор|кон\.?\s*пункт", "terminal_bor_uor"),
    ]
    for pattern, slug in mapping:
        if re.search(pattern, h):
            return slug
    return ""


def column_patterns(row0: list) -> list[str]:
    current = "weekdays"
    patterns: list[str] = []
    for cell in row0:
        text = clean_header(cell).lower()
        if "выход" in text:
            current = "weekend"
        elif "рабоч" in text:
            current = "weekdays"
        elif "суббот" in text:
            current = "weekdays"
        patterns.append(current)
    return patterns


def parse_table(rows: list[list]) -> list[dict]:
    if len(rows) < 3:
        return []
    header_idx = 0
    for i, row in enumerate(rows[:3]):
        if any("тправ" in clean_header(c).lower() for c in row):
            header_idx = i
            break
    header = rows[header_idx]
    patterns = column_patterns(rows[0]) if header_idx > 0 else ["weekdays"] * len(header)
    while len(patterns) < len(header):
        patterns.append(patterns[-1] if patterns else "weekdays")

    out: list[dict] = []
    for col, head_cell in enumerate(header):
        slug = slugify_stop(head_cell)
        if not slug:
            continue
        place = short_place(head_cell)
        times: list[str] = []
        for row in rows[header_idx + 1 :]:
            if col >= len(row):
                continue
            t = parse_time(row[col])
            if t:
                times.append(t)
        if not times:
            continue
        out.append(
            {
                "name": place,
                "stop": slug,
                "pattern": patterns[col],
                "times": times,
            }
        )
    return out


def pair_direction_names(columns: list[dict]) -> list[dict]:
    """Merge adjacent forward/back columns into named directions when possible."""
    merged: list[dict] = []
    i = 0
    while i < len(columns):
        a = columns[i]
        b = columns[i + 1] if i + 1 < len(columns) else None
        if b and a["pattern"] == b["pattern"] and a["stop"] != b["stop"]:
            merged.append(
                {
                    "name": f"{a['name']} → {b['name']}",
                    "pattern": a["pattern"],
                    "columns": [
                        {"stop": a["stop"], "times": a["times"]},
                        {"stop": b["stop"], "times": b["times"]},
                    ],
                }
            )
            i += 2
            continue
        merged.append(
            {
                "name": a["name"],
                "pattern": a["pattern"],
                "columns": [{"stop": a["stop"], "times": a["times"]}],
            }
        )
        i += 1
    return merged


def parse_text_fallback(path: Path, code: str) -> list[dict]:
    doc = pymupdf.open(path)
    text = "\n".join(page.get_text() for page in doc)
    body = text.split("АВТОТРАНСПОРТНОЕ")[0]

    if code == "22":
        times = []
        for h, mi in re.findall(r"\b(\d{1,2})-(\d{2})\b", body):
            times.append(f"{int(h):02d}:{mi}")
        if not times:
            return []
        return [
            {
                "code": code,
                "file": path.name,
                "directions": [
                    {
                        "name": "Подкастельцы → Белсантехмонтаж",
                        "pattern": "weekdays",
                        "columns": [{"stop": "podkasteltsy", "times": times}],
                    }
                ],
            }
        ]

    if code in {"13", "14"}:
        found = re.findall(r"\b(\d{1,2})-(\d{2})\b", body)
        if not found:
            return []
        dep = f"{int(found[0][0]):02d}:{found[0][1]}"
        stop = "ropnyanskaya"
        label = "Ропнянская → Автовокзал" if code == "13" else "Ропнянская → Подкастельцы"
        return [
            {
                "code": code,
                "file": path.name,
                "directions": [
                    {
                        "name": label,
                        "pattern": "weekdays",
                        "columns": [{"stop": stop, "times": [dep]}],
                    },
                    {
                        "name": label,
                        "pattern": "weekend",
                        "columns": [{"stop": stop, "times": [dep]}],
                    },
                ],
            }
        ]

    if code == "1":
        cells: list[str | None] = []
        for line in body.splitlines():
            line = line.strip()
            if line == "-":
                cells.append(None)
                continue
            m = re.match(r"^(\d{1,2})-(\d{2})", line)
            if m:
                cells.append(f"{int(m.group(1)):02d}:{m.group(2)}")
        if len(cells) < 3:
            return []
        rows: list[list[dict]] = []
        stops = ["berezka", "gaydara", "naftan"]
        for i in range(0, len(cells), 3):
            chunk = cells[i : i + 3]
            if len(chunk) < 3:
                break
            calls = []
            for j, dep in enumerate(chunk):
                if not dep:
                    continue
                calls.append({"stop": stops[j], "departs": dep})
            if calls:
                rows.append(calls)
        if not rows:
            return []
        return [
            {
                "code": code,
                "file": path.name,
                "directions": [
                    {
                        "name": "Березка → ОАО «Нафтан»",
                        "pattern": "weekdays",
                        "rows": rows,
                    }
                ],
            }
        ]

    return []


def parse_pdf(path: Path, codes: list[str]) -> list[dict]:
    doc = pymupdf.open(path)
    paired: list[dict] = []
    for page in doc:
        for table in page.find_tables().tables:
            cols = parse_table(table.extract())
            if cols:
                paired.extend(pair_direction_names(cols))

    if not paired:
        if len(codes) == 1:
            return parse_text_fallback(path, codes[0])
        return []

    routes: list[dict] = []
    if len(codes) == 1:
        routes.append({"code": codes[0], "file": path.name, "directions": paired})
        return routes

    # 20 / 20А PDF: split by route hints in direction names
    for code in codes:
        subset = [d for d in paired if f"№{code}" in d["name"] or code in d["name"]]
        if not subset:
            subset = paired
        routes.append({"code": code, "file": path.name, "directions": subset})
    return routes


def main() -> int:
    pdfs = sorted(DOWNLOADS.glob("Маршрут*.pdf"))
    if not pdfs:
        print(f"No PDFs in {DOWNLOADS}", file=sys.stderr)
        return 1
    payload: list[dict] = []
    for pdf in pdfs:
        codes = route_codes_from_name(pdf.name)
        if not codes:
            print(f"skip (no code) {pdf.name[:55]}")
            continue
        for route in parse_pdf(pdf, codes):
            if route["directions"]:
                payload.append(route)
                n = sum(len(d.get("columns") or d.get("rows") or []) for d in route["directions"])
                print(f"{route['code']:4}  {len(route['directions'])} dirs / {n} cols  {pdf.name[:42]}")
            else:
                print(f"skip (empty) {pdf.name[:55]}")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"version": "pdf-2026-10-19", "routes": payload}, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Wrote {OUT} ({len(payload)} routes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
