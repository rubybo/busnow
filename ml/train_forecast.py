"""Download Novopolotsk weather, build the trip table, train one shared trunk.

Run from the repo root: py ml/train_forecast.py
"""

from __future__ import annotations

import csv
import gzip
import json
import os
import re
import sqlite3
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import date, timedelta
from pathlib import Path

# 1050 Ti has 4 GB. CUDA 12.6 cuBLAS otherwise reserves a multi-gigabyte
# workspace and the first Linear layer fails with out-of-memory.
os.environ["CUBLAS_WORKSPACE_CONFIG"] = ":4096:8"
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:128")

import numpy as np
import torch
from torch import nn

from factors import (
    FEATURE_NAMES,
    delay_quantiles,
    features,
    holiday_dates,
    occupancy_label,
)

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "ml" / "data"
MODEL_PATH = ROOT / "backend" / "data" / "forecast-model.json"
LAT = 55.532
LON = 28.665
RANGES = [
    ("2018-01-01", "2018-12-31"),
    ("2019-01-01", "2019-12-31"),
    ("2020-01-01", "2020-12-31"),
    ("2021-01-01", "2021-12-31"),
    ("2022-01-01", "2022-12-31"),
    ("2023-01-01", "2023-12-31"),
    ("2024-01-01", "2024-12-31"),
    ("2025-01-01", "2025-12-31"),
    ("2026-01-01", "2026-10-16"),
]
# Four departures inside each weather hour. The peaks are narrower than 60 minutes.
OFFSETS = (0, 15, 30, 45)
# Each departure is observed at one point along the route. Cycled so every
# archetype sees the start, the middle, and the end.
STOPS = (0.0, 0.35, 0.7, 1.0)
# to_plant, from_plant, bridge, minibus
ARCHETYPES = [
    (1, 0, 0, 0),
    (0, 1, 0, 0),
    (0, 0, 0, 0),
    (1, 0, 0, 1),
    (0, 1, 0, 1),
    (0, 0, 0, 1),
    (0, 0, 1, 0),
    (1, 0, 1, 0),
    (0, 1, 1, 0),
    (0, 0, 1, 1),
    (1, 0, 1, 1),
    (0, 1, 1, 1),
]


def fetch_range(start: str, end: str) -> dict:
    cache = DATA / "weather" / f"{start}_{end}.json"
    if cache.exists():
        print(f"weather cache {cache.name}")
        return json.loads(cache.read_text(encoding="utf-8"))
    query = urllib.parse.urlencode(
        {
            "latitude": LAT,
            "longitude": LON,
            "start_date": start,
            "end_date": end,
            "hourly": "temperature_2m,precipitation,snowfall,wind_speed_10m,weather_code",
            "wind_speed_unit": "ms",
            "timezone": "Europe/Minsk",
        }
    )
    url = f"https://archive-api.open-meteo.com/v1/archive?{query}"
    cache.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(4):
        print(f"GET {start} .. {end}")
        request = urllib.request.Request(url, headers={"User-Agent": "busnow-forecast/1.0"})
        try:
            with urllib.request.urlopen(request, timeout=300) as response:
                raw = response.read()
            payload = json.loads(raw)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, OSError) as exc:
            last_error = exc
            print(f"  weather retry {attempt + 1}: {exc}")
            time.sleep(4 * (attempt + 1))
            continue
        if "hourly" not in payload:
            last_error = RuntimeError(str(payload)[:180])
            print(f"  weather retry {attempt + 1}: {last_error}")
            time.sleep(4 * (attempt + 1))
            continue
        cache.write_text(json.dumps(payload), encoding="utf-8")
        print(f"  {payload.get('latitude')}N {payload.get('longitude')}E {payload.get('timezone')}")
        return payload
    raise RuntimeError(f"weather {start}..{end} failed") from last_error


def fill_nan(values: list) -> np.ndarray:
    arr = np.array([np.nan if value is None else float(value) for value in values], dtype=np.float64)
    mask = np.isnan(arr)
    if mask.all():
        return np.zeros_like(arr)
    if mask.any():
        idx = np.arange(len(arr))
        arr[mask] = np.interp(idx[mask], idx[~mask], arr[~mask])
    return arr


def load_hours() -> list[dict]:
    DATA.mkdir(parents=True, exist_ok=True)
    hours: list[dict] = []
    for start, end in RANGES:
        payload = fetch_range(start, end)
        block = payload["hourly"]
        temp = fill_nan(block["temperature_2m"])
        precip = fill_nan(block["precipitation"])
        snow = fill_nan(block["snowfall"])
        wind = fill_nan(block["wind_speed_10m"])
        code = fill_nan(block["weather_code"])
        for index, stamp in enumerate(block["time"]):
            # "2024-01-03T07:00" in Europe/Minsk. Belarus does not use DST.
            year = int(stamp[0:4])
            month = int(stamp[5:7])
            day = int(stamp[8:10])
            hour = int(stamp[11:13])
            hours.append(
                {
                    "yyyymmdd": year * 10000 + month * 100 + day,
                    "minute": hour * 60,
                    "temp": float(temp[index]),
                    "precip": float(max(0.0, precip[index])),
                    "snow": float(max(0.0, snow[index])),
                    "wind": float(max(0.0, wind[index])),
                    "code": int(round(code[index])),
                }
            )
    return hours


def climate_of(hours: list[dict]) -> list[dict]:
    buckets = {month: [] for month in range(1, 13)}
    for hour in hours:
        buckets[(hour["yyyymmdd"] // 100) % 100].append(hour)
    rows = []
    for month in range(1, 13):
        chunk = buckets[month] or hours
        wet = 0
        for hour in chunk:
            if hour["precip"] >= 0.2 or hour["snow"] >= 0.05 or hour["code"] in {
                51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99
            }:
                wet += 1
        rows.append(
            {
                "temp": round(float(np.mean([hour["temp"] for hour in chunk])), 3),
                "precip": round(float(np.mean([hour["precip"] for hour in chunk])), 3),
                "snow": round(float(np.mean([hour["snow"] for hour in chunk])), 3),
                "wind": round(float(np.mean([hour["wind"] for hour in chunk])), 3),
                "wet": round(wet / len(chunk), 3),
            }
        )
    return rows


PLANT_RE = re.compile(
    r"нафтан|полимир|промзон|измерител|стекловолокн|проходн|тсб|(?:^|[^а-я])кпд(?:[^а-я]|$)"
)
BRIDGE_TEXT = re.compile(r"полоцк|ропн|швейн|ж/д|жд вокзал")
BRIDGE_CODE = re.compile(r"^(5|10|10а|24|30)$")


def _norm(value: str) -> str:
    return value.lower().replace("ё", "е")


def _plant(value: str) -> bool:
    return PLANT_RE.search(value) is not None


def ride_flags(code: str, direction: str, stop: str, kind: str) -> tuple[int, int, int, int]:
    """Same route shape as the site uses when it scores a departure."""
    direction_n = _norm(direction)
    stop_n = _norm(stop)
    parts = [part.strip() for part in direction_n.split("→")]
    origin = parts[0] if parts else ""
    dest = parts[-1] if parts else direction_n
    has_arrow = len(parts) > 1
    to_plant = _plant(dest) if has_arrow else _plant(direction_n) and not _plant(stop_n)
    from_plant = (_plant(origin) or (_plant(stop_n) and not _plant(dest))) if has_arrow else _plant(stop_n)
    if to_plant and from_plant:
        if _plant(stop_n) and not _plant(dest):
            to_plant = False
        else:
            from_plant = False
    code_n = _norm(code).replace(" ", "")
    bridge = bool(BRIDGE_TEXT.search(f"{direction_n} {stop_n}")) or bool(BRIDGE_CODE.match(code_n)) or code_n in {"10тк", "31тк"}
    minibus = kind == "minibus" or "тк" in code_n
    return int(to_plant), int(from_plant), int(bridge), int(minibus)


def _hhmm(value: str) -> int:
    return int(value[0:2]) * 60 + int(value[3:5])


def load_ride_bank() -> dict[tuple[int, int, int, int], list[tuple[float, float, float, float, float]]]:
    """Ride minutes plus whether the stop starts or ends the trip, and how many routes meet there."""
    db_path = ROOT / "backend" / "data" / "busnow.sqlite"
    bank: dict[tuple[int, int, int, int], list[tuple[float, float, float, float, float]]] = {}
    if not db_path.exists():
        print("timetable database is missing, ride minutes stay synthetic")
        return bank
    connection = sqlite3.connect(db_path)
    hubs = {
        int(stop_id): float(count)
        for stop_id, count in connection.execute(
            """
            SELECT st.stop_id, COUNT(DISTINCT d.route_id)
            FROM stop_times st
            JOIN trips t ON t.id = st.trip_id
            JOIN directions d ON d.id = t.direction_id
            GROUP BY st.stop_id
            """
        )
    }
    rows = connection.execute(
        """
        SELECT t.id, r.code, r.kind, d.name, s.id, s.name, st.sequence, st.departs
        FROM stop_times st
        JOIN trips t ON t.id = st.trip_id
        JOIN directions d ON d.id = t.direction_id
        JOIN routes r ON r.id = d.route_id
        JOIN stops s ON s.id = st.stop_id
        ORDER BY t.id, st.sequence
        """
    ).fetchall()
    connection.close()
    trips: dict[int, list[tuple]] = {}
    for trip_id, code, kind, direction, stop_id, stop, sequence, departs in rows:
        trips.setdefault(int(trip_id), []).append(
            (code, kind, direction, int(stop_id), stop, int(sequence), departs)
        )
    kept = 0
    for items in trips.values():
        items.sort(key=lambda item: item[5])
        origin = _hhmm(items[0][6])
        first_seq = items[0][5]
        last_seq = items[-1][5]
        for code, kind, direction, stop_id, stop, sequence, departs in items:
            ride = _hhmm(departs) - origin
            if ride < 0 or ride > 90:
                continue
            key = ride_flags(str(code), str(direction), str(stop), str(kind))
            frac = sequence / last_seq if last_seq else 0.5
            at_origin = 1.0 if sequence == first_seq else 0.0
            at_terminus = 1.0 if sequence == last_seq and sequence != first_seq else 0.0
            bank.setdefault(key, []).append((float(frac), float(ride), at_origin, at_terminus, hubs.get(stop_id, 1.0)))
            kept += 1
    print(f"timetable rides {kept} across {len(bank)} shapes")
    return bank


def pick_ride(
    bank: dict[tuple[int, int, int, int], list[tuple[float, float, float, float, float]]],
    key: tuple[int, int, int, int],
    yyyymmdd: int,
    minute: int,
    arch: int,
    offset_index: int,
) -> tuple[float, float, float, float, float]:
    rows = bank.get(key) or []
    if not rows:
        stop_frac = STOPS[(yyyymmdd + offset_index + arch) % len(STOPS)]
        typical = 36.0 if key[2] else 16.0
        origin = 1.0 if stop_frac < 0.05 else 0.0
        terminus = 1.0 if stop_frac > 0.95 else 0.0
        return stop_frac, typical * stop_frac, origin, terminus, 15.0 if key[2] else 4.0
    slot = (yyyymmdd * 17 + minute + arch * 5 + offset_index * 3) % len(rows)
    return rows[slot]


def sample_headway(yyyymmdd: int, minute: int, arch: int, offset_index: int) -> float:
    year, month, day = yyyymmdd // 10000, (yyyymmdd // 100) % 100, yyyymmdd % 100
    weekend = date(year, month, day).weekday() >= 5
    if weekend:
        choices = (18, 25, 30, 40, 55)
    elif minute < 6 * 60 or minute >= 22 * 60:
        choices = (30, 40, 50, 70, 90)
    elif (7 * 60 <= minute <= 9 * 60 + 30) or (16 * 60 <= minute <= 19 * 60):
        choices = (8, 10, 12, 15, 18, 24)
    else:
        choices = (12, 18, 22, 28, 36, 45)
    slot = (yyyymmdd * 17 + minute + arch * 5 + offset_index * 3) % len(choices)
    return float(choices[slot])


def remembered(hours: list[dict], yyyymmdd: int, minute: int) -> tuple[float, float, float, float]:
    slot = (minute // 60) * 60
    for hour in hours:
        if hour["yyyymmdd"] == yyyymmdd and hour["minute"] == slot:
            return float(hour["precip3"]), float(hour["snow3"]), float(hour["temp_vs"]), float(hour["frost"])
    return 0.0, 0.0, 0.0, 0.0


def stamp_date(stamp: int) -> date:
    return date(stamp // 10000, (stamp // 100) % 100, stamp % 100)


def day_stamp(value: date) -> int:
    return value.year * 10000 + value.month * 100 + value.day


def attach_memory(hours: list[dict]) -> None:
    """Rain and snow over 3 hours, gap versus yesterday 08:00, first frost.

    First frost is the 06:00–10:00 window on a day that freezes after 14 days above 0°C.
    Overnight hours stay unmarked, so the flag is not mistaken for an empty night bus.
    """
    morning: dict[int, float] = {}
    day_min: dict[int, float] = {}
    for hour in hours:
        if hour["minute"] == 8 * 60:
            morning[hour["yyyymmdd"]] = hour["temp"]
        day_min[hour["yyyymmdd"]] = min(hour["temp"], day_min.get(hour["yyyymmdd"], 99.0))
    frost_days: set[int] = set()
    for stamp, low in day_min.items():
        if low > 0:
            continue
        current = stamp_date(stamp)
        prior: list[float] = []
        complete = True
        for back in range(1, 15):
            previous = day_stamp(current - timedelta(days=back))
            if previous not in day_min:
                complete = False
                break
            prior.append(day_min[previous])
        if complete and min(prior) > 0:
            frost_days.add(stamp)
    for index, hour in enumerate(hours):
        start = max(0, index - 2)
        hour["precip3"] = float(sum(hours[cursor]["precip"] for cursor in range(start, index + 1)))
        hour["snow3"] = float(sum(hours[cursor]["snow"] for cursor in range(start, index + 1)))
        current = stamp_date(hour["yyyymmdd"])
        yesterday = morning.get(day_stamp(current - timedelta(days=1)))
        hour["temp_vs"] = 0.0 if yesterday is None else float(hour["temp"] - yesterday)
        commute = 6 * 60 <= hour["minute"] <= 10 * 60
        hour["frost"] = 1.0 if commute and hour["yyyymmdd"] in frost_days else 0.0


def build_dataset(
    hours: list[dict],
    holidays: set[str],
    bank: dict[tuple[int, int, int, int], list[tuple[float, float, float, float, float]]],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    count = len(hours) * len(OFFSETS) * len(ARCHETYPES)
    stamps = np.empty(count, dtype=np.int32)
    x = np.empty((count, len(FEATURE_NAMES)), dtype=np.float32)
    y = np.empty((count, 3), dtype=np.float32)
    path = DATA / "trips.csv.gz"
    print(f"writing {path} ({count} rows)")
    row = 0
    with gzip.open(path, "wt", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(
            [
                "yyyymmdd",
                "minute",
                "temp",
                "precip",
                "snow",
                "wind",
                "code",
                "precip3",
                "snow3",
                "temp_vs",
                "frost",
                "to_plant",
                "from_plant",
                "bridge",
                "minibus",
                "stop_frac",
                "headway",
                "ride_min",
                "at_origin",
                "at_terminus",
                "hub_routes",
                "occupancy",
                "delay_p50",
                "delay_p90",
            ]
        )
        for hour in hours:
            yyyymmdd = hour["yyyymmdd"]
            year, month, day = yyyymmdd // 10000, (yyyymmdd // 100) % 100, yyyymmdd % 100
            for offset_index, offset in enumerate(OFFSETS):
                minute = hour["minute"] + offset
                for index, (to_plant, from_plant, bridge, minibus) in enumerate(ARCHETYPES):
                    stop_frac, ride_min, at_origin, at_terminus, hub_routes = pick_ride(
                        bank, (to_plant, from_plant, bridge, minibus), yyyymmdd, minute, index, offset_index
                    )
                    headway = sample_headway(yyyymmdd, minute, index, offset_index)
                    seed = (yyyymmdd * 100 + minute) * 64 + index * 4 + offset_index
                    rng = np.random.default_rng(seed & 0xFFFFFFFF)
                    shared = (
                        year,
                        month,
                        day,
                        minute,
                        hour["temp"],
                        hour["precip"],
                        hour["snow"],
                        hour["wind"],
                        hour["code"],
                        hour["precip3"],
                        hour["snow3"],
                        hour["temp_vs"],
                        hour["frost"],
                        to_plant,
                        from_plant,
                        bridge,
                        minibus,
                        stop_frac,
                        headway,
                        ride_min,
                        at_origin,
                        at_terminus,
                        hub_routes,
                        holidays,
                    )
                    occ_clean = occupancy_label(*shared, noise=0.0)
                    occ = occupancy_label(*shared, noise=float(rng.normal(0, 3.5)))
                    p50, p90 = delay_quantiles(*shared, occupancy=occ_clean)
                    stamps[row] = yyyymmdd
                    x[row] = features(*shared)
                    y[row, 0] = occ
                    y[row, 1] = p50
                    y[row, 2] = p90
                    writer.writerow(
                        [
                            yyyymmdd,
                            minute,
                            round(hour["temp"], 2),
                            round(hour["precip"], 2),
                            round(hour["snow"], 2),
                            round(hour["wind"], 2),
                            hour["code"],
                            round(hour["precip3"], 2),
                            round(hour["snow3"], 2),
                            round(hour["temp_vs"], 2),
                            int(hour["frost"]),
                            to_plant,
                            from_plant,
                            bridge,
                            minibus,
                            stop_frac,
                            headway,
                            round(ride_min, 2),
                            int(at_origin),
                            int(at_terminus),
                            int(hub_routes),
                            round(occ, 2),
                            round(p50, 2),
                            round(p90, 2),
                        ]
                    )
                    row += 1
                    if row % 500_000 == 0:
                        print(f"  rows {row}")
    return stamps, x, y


class ForecastNet(nn.Module):
    """Shared trunk, then an occupancy head and a two-number delay head.

    Delay outputs are the usual delay and a non-negative gap above it,
    so the bad case cannot fall below the usual one.
    """

    def __init__(self, n_in: int, widths: tuple[int, ...]):
        super().__init__()
        layers: list[nn.Linear] = []
        previous = n_in
        for width in widths:
            layers.append(nn.Linear(previous, width))
            previous = width
        self.trunk = nn.ModuleList(layers)
        self.occ = nn.Linear(previous, 1)
        self.lag = nn.Linear(previous, 2)

    def forward(self, x: torch.Tensor) -> tuple[torch.Tensor, torch.Tensor, torch.Tensor]:
        hidden = x
        for layer in self.trunk:
            hidden = torch.relu(layer(hidden))
        occupancy = torch.sigmoid(self.occ(hidden)).squeeze(-1) * 100
        raw = self.lag(hidden)
        usual = torch.nn.functional.softplus(raw[:, 0])
        gap = torch.nn.functional.softplus(raw[:, 1])
        return occupancy, usual, usual + gap


def pick_device() -> torch.device:
    if not torch.cuda.is_available():
        print("CUDA is unavailable, training on CPU")
        return torch.device("cpu")
    props = torch.cuda.get_device_properties(0)
    major, minor = torch.cuda.get_device_capability(0)
    # Pascal (1050 Ti, sm_61) has no tensor cores. fp16 is slower than fp32 there.
    torch.backends.cuda.matmul.allow_tf32 = False
    torch.backends.cudnn.allow_tf32 = False
    print(
        f"GPU {props.name} sm_{major}{minor} "
        f"{props.total_memory / (1024 ** 2):.0f} MiB, torch {torch.__version__}"
    )
    return torch.device("cuda")


def pinball(pred: torch.Tensor, target: torch.Tensor, quantile: float) -> torch.Tensor:
    error = target - pred
    return torch.maximum(quantile * error, (quantile - 1) * error).mean()


def fit(
    x_train: np.ndarray,
    y_train: np.ndarray,
    x_val: np.ndarray,
    y_val: np.ndarray,
    device: torch.device,
    widths: tuple[int, ...],
    label: str,
) -> ForecastNet:
    torch.manual_seed(7)
    if device.type == "cuda":
        torch.cuda.manual_seed_all(7)
    net = ForecastNet(x_train.shape[1], widths).to(device)
    n_param = sum(parameter.numel() for parameter in net.parameters())
    print(f"{label} parameters {n_param} widths {widths}")
    opt = torch.optim.AdamW(net.parameters(), lr=1e-3, weight_decay=1e-4)
    # The full table is about 600 MB. On a 4 GB card it fragments the heap and
    # the wide trunk then fails its first shuffle, so each batch is copied over.
    xt = torch.from_numpy(np.ascontiguousarray(x_train))
    yt = torch.from_numpy(np.ascontiguousarray(y_train))
    xv = torch.from_numpy(np.ascontiguousarray(x_val))
    yv = torch.from_numpy(np.ascontiguousarray(y_val))
    count = xt.shape[0]
    batch = 8192 if device.type == "cuda" else 4096
    best_state = None
    best_score = 1e9
    stall = 0
    for epoch in range(1, 51):
        net.train()
        order = torch.randperm(count)
        for start in range(0, count, batch):
            index = order[start : start + batch]
            xb = xt[index].to(device)
            yb = yt[index].to(device)
            opt.zero_grad()
            occ, usual, high = net(xb)
            # Occupancy is on a 0–100 scale. Weight the minute heads so a full
            # cabin and the delay fork still move the shared trunk.
            loss = (
                nn.functional.smooth_l1_loss(occ, yb[:, 0])
                + 8 * pinball(usual, yb[:, 1], 0.5)
                + 8 * pinball(high, yb[:, 2], 0.9)
            )
            loss.backward()
            torch.nn.utils.clip_grad_norm_(net.parameters(), 1)
            opt.step()
        net.eval()
        occ_abs = usual_abs = high_abs = 0.0
        seen = 0
        with torch.no_grad():
            # The whole validation year does not fit through the wide trunk on 4 GB.
            for start in range(0, xv.shape[0], batch):
                window = slice(start, start + batch)
                xb = xv[window].to(device)
                yb = yv[window].to(device)
                occ, usual, high = net(xb)
                occ_abs += float((occ - yb[:, 0]).abs().sum())
                usual_abs += float((usual - yb[:, 1]).abs().sum())
                high_abs += float((high - yb[:, 2]).abs().sum())
                seen += int(occ.shape[0])
        occ_mae = occ_abs / seen
        usual_mae = usual_abs / seen
        high_mae = high_abs / seen
        score = occ_mae + 8 * usual_mae + 8 * high_mae
        print(f"  {label} epoch {epoch:02d} val MAE occ {occ_mae:.3f} p50 {usual_mae:.3f} p90 {high_mae:.3f}")
        if score < best_score - 1e-4:
            best_score = score
            best_state = {key: value.detach().cpu().clone() for key, value in net.state_dict().items()}
            stall = 0
        else:
            stall += 1
            if stall >= 7:
                break
    if best_state is not None:
        net.load_state_dict(best_state)
    net.eval()
    return net


def dump_linear(layer: nn.Linear) -> dict:
    return {
        "w": layer.weight.detach().cpu().numpy().tolist(),
        "b": layer.bias.detach().cpu().numpy().tolist(),
    }


def errors(net: ForecastNet, x: np.ndarray, y: np.ndarray, device: torch.device) -> tuple[float, float, float]:
    # One forward of the whole test year blows the 4 GB card on the first activation.
    occ_abs = usual_abs = high_abs = 0.0
    seen = 0
    with torch.no_grad():
        for start in range(0, len(x), 8192):
            xb = torch.from_numpy(x[start : start + 8192]).float().to(device)
            yb = torch.from_numpy(y[start : start + 8192]).float().to(device)
            occ, usual, high = net(xb)
            occ_abs += float((occ - yb[:, 0]).abs().sum())
            usual_abs += float((usual - yb[:, 1]).abs().sum())
            high_abs += float((high - yb[:, 2]).abs().sum())
            seen += int(xb.shape[0])
    return occ_abs / seen, usual_abs / seen, high_abs / seen


def main() -> None:
    holidays = set(holiday_dates())
    hours = load_hours()
    attach_memory(hours)
    print(f"weather hours {len(hours)}")
    bank = load_ride_bank()
    stamps, x, y = build_dataset(hours, holidays, bank)
    count = len(stamps)
    print(f"trips {count}")

    rng = np.random.default_rng(7)
    dates = np.unique(stamps)
    rng.shuffle(dates)
    n_dates = len(dates)
    train_dates = set(dates[: int(n_dates * 0.8)].tolist())
    val_dates = set(dates[int(n_dates * 0.8) : int(n_dates * 0.9)].tolist())
    test_dates = set(dates[int(n_dates * 0.9) :].tolist())
    train_mask = np.isin(stamps, list(train_dates))
    val_mask = np.isin(stamps, list(val_dates))
    test_mask = np.isin(stamps, list(test_dates))

    mean = x[train_mask].mean(axis=0)
    std = x[train_mask].std(axis=0)
    std[std < 1e-6] = 1
    xz = (x - mean) / std

    device = pick_device()
    # Stop role is a sharp step on every row. The 64-wide trunk fits that step and
    # drops the rare morning-frost and pre-holiday bumps, so the wider trunk is the one that ships.
    net = fit(xz[train_mask], y[train_mask], xz[val_mask], y[val_mask], device, (384, 192, 96), "wide")
    occ_mae, delay_mae, delay_p90_mae = errors(net, xz[test_mask], y[test_mask], device)
    train_mean = y[train_mask].mean(axis=0)
    occ_base = float(np.mean(np.abs(y[test_mask, 0] - train_mean[0])))
    delay_base = float(np.mean(np.abs(y[test_mask, 1] - train_mean[1])))
    delay_p90_base = float(np.mean(np.abs(y[test_mask, 2] - train_mean[2])))
    print(f"test occupancy MAE {occ_mae:.3f} (mean baseline {occ_base:.3f})")
    print(f"test delay p50 MAE {delay_mae:.3f} (mean baseline {delay_base:.3f})")
    print(f"test delay p90 MAE {delay_p90_mae:.3f} (mean baseline {delay_p90_base:.3f})")

    checks = []
    samples = [
        {"date": "2026-10-19", "minute": 7 * 60 + 20, "temp": -4.0, "precip": 0.4, "snow": 0.2, "wind": 4.0, "code": 71, "toPlant": 1, "fromPlant": 0, "bridge": 0, "minibus": 0, "stopFrac": 0.8, "headwayMin": 12, "rideMin": 18, "atOrigin": 0, "atTerminus": 0, "hubRoutes": 8},
        {"date": "2026-10-18", "minute": 12 * 60, "temp": 8.0, "precip": 0.0, "snow": 0.0, "wind": 2.0, "code": 1, "toPlant": 0, "fromPlant": 0, "bridge": 0, "minibus": 0, "stopFrac": 0.5, "headwayMin": 30, "rideMin": 12, "atOrigin": 0, "atTerminus": 0, "hubRoutes": 4},
        {"date": "2026-10-16", "minute": 17 * 60 + 30, "temp": 3.0, "precip": 2.0, "snow": 0.0, "wind": 6.0, "code": 63, "toPlant": 0, "fromPlant": 0, "bridge": 1, "minibus": 0, "stopFrac": 0.7, "headwayMin": 20, "rideMin": 48, "atOrigin": 0, "atTerminus": 0, "hubRoutes": 15},
        {"date": "2026-10-16", "minute": 17 * 60 + 30, "temp": 6.0, "precip": 0.0, "snow": 0.0, "wind": 3.0, "code": 2, "toPlant": 0, "fromPlant": 1, "bridge": 0, "minibus": 0, "stopFrac": 0.2, "headwayMin": 15, "rideMin": 8, "atOrigin": 1, "atTerminus": 0, "hubRoutes": 10},
    ]
    with torch.no_grad():
        for sample in samples:
            year = int(sample["date"][0:4])
            month = int(sample["date"][5:7])
            day = int(sample["date"][8:10])
            precip3, snow3, temp_vs, frost = remembered(hours, year * 10000 + month * 100 + day, int(sample["minute"]))
            sample["precip3h"] = precip3
            sample["snow3h"] = snow3
            sample["tempVsYdayMorn"] = temp_vs
            sample["firstFrost"] = frost
            vector = np.array(
                features(
                    year,
                    month,
                    day,
                    int(sample["minute"]),
                    float(sample["temp"]),
                    float(sample["precip"]),
                    float(sample["snow"]),
                    float(sample["wind"]),
                    int(sample["code"]),
                    precip3,
                    snow3,
                    temp_vs,
                    frost,
                    int(sample["toPlant"]),
                    int(sample["fromPlant"]),
                    int(sample["bridge"]),
                    int(sample["minibus"]),
                    float(sample["stopFrac"]),
                    float(sample["headwayMin"]),
                    float(sample["rideMin"]),
                    float(sample["atOrigin"]),
                    float(sample["atTerminus"]),
                    float(sample["hubRoutes"]),
                    holidays,
                ),
                dtype=np.float64,
            )
            normed = torch.from_numpy(((vector - mean) / std).astype(np.float32)).unsqueeze(0).to(device)
            occ_t, usual_t, high_t = net(normed)
            occ = float(occ_t.reshape(-1)[0])
            usual = float(usual_t.reshape(-1)[0])
            high = float(high_t.reshape(-1)[0])
            print(
                f"  sample {sample['date']} {sample['minute']} occ {occ:.1f} "
                f"p50 {usual:.2f} p90 {high:.2f} plant {sample['toPlant']}/{sample['fromPlant']} bridge {sample['bridge']}"
            )
            checks.append(
                {
                    "input": sample,
                    "features": vector.tolist(),
                    "occupancy": occ,
                    "delay": usual,
                    "delayP90": high,
                }
            )

    n_param = sum(parameter.numel() for parameter in net.parameters())
    model = {
        "version": 5,
        "features": FEATURE_NAMES,
        "mean": mean.tolist(),
        "std": std.tolist(),
        "trunk": [dump_linear(layer) for layer in net.trunk],
        "occupancy": [dump_linear(net.occ)],
        "delay": [dump_linear(net.lag)],
        "holidays": sorted(holidays),
        "climate": climate_of(hours),
        "checks": checks,
        "metrics": {
            "rows": int(count),
            "parameters": int(n_param),
            "weatherHours": len(hours),
            "device": str(device),
            "torch": torch.__version__,
            "occupancyMae": round(occ_mae, 4),
            "delayMae": round(delay_mae, 4),
            "delayP90Mae": round(delay_p90_mae, 4),
            "occupancyBaselineMae": round(occ_base, 4),
            "delayBaselineMae": round(delay_base, 4),
            "delayP90BaselineMae": round(delay_p90_base, 4),
        },
        "sources": [
            "Open-Meteo archive, 55.532N 28.665E, hourly 2018-01-01..2026-10-16",
            "Four departures inside each weather hour, twelve route shapes",
            "Stop position, headway, scheduled minutes from the origin, and whether the stop starts or ends the trip",
            "How many routes meet at the stop, from the timetable",
            "Naftan and Polymir shifts 7:00-19:00, 8:00-20:00, 16:00 and day staff to 17:00",
            "Pair bells from 8:30, Polotsk colleges and PSU, January and June exams",
            "Belarus public holidays and Radonitsa 2018-2026, plus the weekday before a holiday",
            "3-hour rain and snow, temperature gap versus yesterday 08:00, first frost after 14 days above 0C",
            "Shared trunk 384-192-96. The 64-wide trunk dropped first frost and the evening before a holiday. Delay head is the median and a normal 90th percentile",
        ],
    }
    MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    MODEL_PATH.write_text(json.dumps(model), encoding="utf-8")
    print(f"wrote {MODEL_PATH}")


if __name__ == "__main__":
    main()
