"""Demand factors for Novopolotsk buses.

Labels are a noisy simulator. Open data has no passenger counters and no GPS
delay archive, so the targets combine published clocks with the Open-Meteo
history for 55.532°N, 28.665°E:

- Naftan / Polymir shifts from job postings and the Polymir shift calendar:
  12-hour 8:00–20:00 and 7:00–19:00, 8-hour change at 16:00, day staff until 17:00.
- Class bells follow the 8:30 pair grid used by Polotsk colleges and PSU
  (dormitory hours also open at 8:30).
- School day 8:00, first shift home around 13:30.
- Bridge and Polotsk routes pick up extra delay in the peaks and in wet weather.
- A standing or packed cabin adds dwell at the median. The upper band is a
  normal 90th percentile, wider on the bridge in wet weather and when the bus is full.
- Weather memory: rain and snow summed over three hours, the gap versus
  yesterday at 08:00, and the first frost after a week above freezing.
- Where the bus is on the route, how long since the previous departure,
  and how many scheduled minutes it has already been on the road.
- January and June exam mornings, and the weekday before a public holiday.
"""

from __future__ import annotations

import math
from datetime import date, timedelta

FEATURE_NAMES = [
    "hour_sin",
    "hour_cos",
    "dow_sin",
    "dow_cos",
    "month_sin",
    "month_cos",
    "is_weekend",
    "is_holiday",
    "temp_c",
    "precip_mm",
    "snow_cm",
    "wind_ms",
    "is_wet",
    "precip_3h",
    "snow_3h",
    "temp_vs_yday_morn",
    "first_frost",
    "to_plant",
    "from_plant",
    "is_bridge",
    "is_minibus",
    "school_session",
    "uni_session",
    "dist_shift_start_h",
    "dist_shift_end_h",
    "dist_pair_h",
    "dist_school_h",
    "exam_session",
    "pre_holiday",
    "stop_frac",
    "headway_min",
    "ride_min",
    "at_origin",
    "at_terminus",
    "hub_routes",
]

# 7:00 and 8:00 day starts, 16:00 eight-hour brigade, 20:00 night shift.
SHIFT_STARTS = [7 * 60, 8 * 60, 16 * 60, 20 * 60]
# Night ends 8:00, eight-hour ends 16:00, day staff 17:00, 7–19 ends 19:00, 8–20 ends 20:00.
SHIFT_ENDS = [8 * 60, 16 * 60, 17 * 60, 19 * 60, 20 * 60]
# Pair edges from 8:30, two academic hours plus the break.
PAIR_MARKS = [
    8 * 60 + 30,
    10 * 60 + 5,
    10 * 60 + 25,
    12 * 60,
    12 * 60 + 30,
    14 * 60 + 5,
    14 * 60 + 20,
    15 * 60 + 55,
    16 * 60 + 5,
    17 * 60 + 40,
    17 * 60 + 50,
    19 * 60 + 25,
]
SCHOOL_MARKS = [7 * 60 + 40, 8 * 60, 13 * 60 + 20, 13 * 60 + 50, 14 * 60 + 30, 18 * 60 + 10]

WET_CODES = {51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99}

# Orthodox Radonitsa, the Tuesday nine days after Easter.
RADONITSA = {
    2018: (4, 17),
    2019: (5, 7),
    2020: (4, 28),
    2021: (5, 11),
    2022: (5, 3),
    2023: (4, 25),
    2024: (5, 14),
    2025: (4, 29),
    2026: (4, 21),
}
FIXED_HOLIDAYS = [(1, 1), (1, 2), (1, 7), (3, 8), (5, 1), (5, 9), (7, 3), (11, 7), (12, 25)]


def holiday_dates(first: int = 2018, last: int = 2026) -> list[str]:
    found: list[str] = []
    for year in range(first, last + 1):
        for month, day in FIXED_HOLIDAYS:
            found.append(date(year, month, day).isoformat())
        month, day = RADONITSA[year]
        found.append(date(year, month, day).isoformat())
    return sorted(set(found))


def hours_to_nearest(minute: int, marks: list[int]) -> float:
    best = 12.0
    for mark in marks:
        delta = abs(minute - mark)
        delta = min(delta, 1440 - delta)
        best = min(best, delta / 60)
    return best


def gauss(minute: float, center: float, sigma: float) -> float:
    z = (minute - center) / sigma
    return math.exp(-0.5 * z * z)


def lingering(precip: float, snow: float, precip_3h: float, snow_3h: float) -> tuple[float, float]:
    # The 3-hour sum includes the current hour. Only the earlier part is new.
    return max(0.0, precip_3h - precip), max(0.0, snow_3h - snow)


def memory_load(
    load: float,
    precip: float,
    snow: float,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
) -> float:
    past_precip, past_snow = lingering(precip, snow, precip_3h, snow_3h)
    if past_precip >= 0.4 or past_snow >= 0.1:
        load += 3.0 + min(past_precip, 6) * 0.8 + min(past_snow, 3) * 1.5
    if temp_vs <= -8:
        load += 4.0
    if first_frost >= 0.5:
        load += 12.0
    return load


def memory_lag(
    bridge: int,
    precip: float,
    snow: float,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
) -> float:
    past_precip, past_snow = lingering(precip, snow, precip_3h, snow_3h)
    extra = 0.0
    if past_precip >= 0.4 or past_snow >= 0.1:
        extra += (1.3 if bridge else 0.45) + min(past_precip, 6) * 0.16 + min(past_snow, 3) * 0.45
    if temp_vs <= -8:
        extra += 0.8 + (0.9 if bridge else 0.0)
    if first_frost >= 0.5:
        extra += 1.1 + (1.2 if bridge else 0.0)
    return extra


def memory_scale(
    bridge: int,
    precip: float,
    snow: float,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
) -> float:
    past_precip, past_snow = lingering(precip, snow, precip_3h, snow_3h)
    extra = 0.0
    if past_precip >= 0.4 or past_snow >= 0.1:
        extra += 0.35 + (0.45 if bridge else 0.0)
    if temp_vs <= -8:
        extra += 0.35
    if first_frost >= 0.5:
        extra += 0.4
    return extra


def is_wet(precip: float, snow: float, code: int) -> float:
    if precip >= 0.2 or snow >= 0.05 or int(code) in WET_CODES:
        return 1.0
    return 0.0


def school_session(year: int, month: int, day: int, dow: int, holiday: bool) -> float:
    if holiday or dow >= 5:
        return 0.0
    if month in (7, 8) or (month == 6 and day >= 1):
        return 0.0
    if (month == 12 and day >= 23) or (month == 1 and day <= 10):
        return 0.0
    if month == 3 and 23 <= day <= 31:
        return 0.0
    if (month == 10 and day >= 27) or (month == 11 and day <= 4):
        return 0.0
    return 1.0


def uni_session(year: int, month: int, day: int, dow: int, holiday: bool) -> float:
    if holiday or dow >= 5:
        return 0.0
    if month in (7, 8):
        return 0.0
    if month == 1 and day <= 14:
        return 0.0
    return 1.0


def exam_session(year: int, month: int, day: int, dow: int, holiday: bool) -> float:
    # January session after the New Year break, and the June session.
    del year
    if holiday or dow >= 5:
        return 0.0
    if month == 1 and day >= 15:
        return 1.0
    if month == 6 and day <= 25:
        return 1.0
    return 0.0


def day_before_holiday(year: int, month: int, day: int, holidays: set[str]) -> float:
    today = date(year, month, day)
    if today.weekday() >= 5 or today.isoformat() in holidays:
        return 0.0
    if (today + timedelta(days=1)).isoformat() in holidays:
        return 1.0
    return 0.0


def position_mix(stop_frac: float) -> tuple[float, float, float]:
    # City load peaks mid-route. A plant-bound bus fills toward the gate,
    # and a bus leaving the plant is fullest on the first stops.
    frac = min(1.0, max(0.0, stop_frac))
    mid = 4 * frac * (1.0 - frac)
    city = 0.4 + 0.6 * mid
    toward = 0.2 + 0.8 * frac
    leaving = 0.2 + 0.8 * (1.0 - frac)
    return city, toward, leaving


def hub_crowd(hub_routes: float) -> float:
    # Two routes is an ordinary stop. The bus station and the central street saturate.
    extra = max(0.0, hub_routes - 2.0)
    return 16.0 * (1.0 - math.exp(-extra / 10.0))


def road_roll(ride_min: float) -> float:
    # 0 at the first stop. 1 after half an hour on the timetable, 2 after an hour.
    return min(75.0, max(0.0, ride_min)) / 30.0


def crowd_factor(headway: float) -> float:
    # 20 minutes is the usual gap. A short gap leaves a thin queue, a long one a crowd.
    span = min(50.0, max(8.0, headway))
    if span <= 20:
        return 0.62 + (span - 8.0) / 12.0 * 0.38
    return 1.0 + (span - 20.0) / 30.0 * 0.55


def features(
    year: int,
    month: int,
    day: int,
    minute: int,
    temp: float,
    precip: float,
    snow: float,
    wind: float,
    code: int,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
    to_plant: int,
    from_plant: int,
    bridge: int,
    minibus: int,
    stop_frac: float,
    headway: float,
    ride_min: float,
    at_origin: float,
    at_terminus: float,
    hub_routes: float,
    holidays: set[str],
) -> list[float]:
    iso = date(year, month, day).isoformat()
    dow = date(year, month, day).weekday()
    holiday = iso in holidays
    hour_angle = 2 * math.pi * minute / 1440
    dow_angle = 2 * math.pi * dow / 7
    month_angle = 2 * math.pi * (month - 1) / 12
    weekend = 1.0 if dow >= 5 else 0.0
    return [
        math.sin(hour_angle),
        math.cos(hour_angle),
        math.sin(dow_angle),
        math.cos(dow_angle),
        math.sin(month_angle),
        math.cos(month_angle),
        weekend,
        1.0 if holiday else 0.0,
        float(temp),
        float(precip),
        float(snow),
        float(wind),
        is_wet(precip, snow, code),
        float(precip_3h),
        float(snow_3h),
        float(temp_vs),
        float(first_frost),
        float(to_plant),
        float(from_plant),
        float(bridge),
        float(minibus),
        school_session(year, month, day, dow, holiday),
        uni_session(year, month, day, dow, holiday),
        hours_to_nearest(minute, SHIFT_STARTS),
        hours_to_nearest(minute, SHIFT_ENDS),
        hours_to_nearest(minute, PAIR_MARKS),
        hours_to_nearest(minute, SCHOOL_MARKS),
        exam_session(year, month, day, dow, holiday),
        day_before_holiday(year, month, day, holidays),
        float(stop_frac),
        float(headway),
        float(ride_min),
        float(at_origin),
        float(at_terminus),
        float(hub_routes),
    ]


def occupancy_label(
    year: int,
    month: int,
    day: int,
    minute: int,
    temp: float,
    precip: float,
    snow: float,
    wind: float,
    code: int,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
    to_plant: int,
    from_plant: int,
    bridge: int,
    minibus: int,
    stop_frac: float,
    headway: float,
    ride_min: float,
    at_origin: float,
    at_terminus: float,
    hub_routes: float,
    holidays: set[str],
    noise: float,
) -> float:
    dow = date(year, month, day).weekday()
    holiday = date(year, month, day).isoformat() in holidays
    weekend = dow >= 5
    school = school_session(year, month, day, dow, holiday)
    uni = uni_session(year, month, day, dow, holiday)
    exam = exam_session(year, month, day, dow, holiday)
    pre = day_before_holiday(year, month, day, holidays)
    plant = 0.55 if weekend or holiday else 1.0
    wet = is_wet(precip, snow, code)
    city_k, toward_k, leaving_k = position_mix(stop_frac)
    crowd = crowd_factor(headway)

    base = 6.0
    peaks = 12.0 * gauss(minute, 8 * 60, 50)
    peaks += 8.0 * gauss(minute, 13 * 60 + 10, 45)
    peaks += 10.0 * gauss(minute, 17 * 60 + 30, 50)
    if weekend:
        base *= 0.45
        peaks = peaks * 0.45 + 14.0 * gauss(minute, 12 * 60, 80)
    elif holiday:
        base *= 0.6
        peaks *= 0.6

    plant_to = 0.0
    if to_plant:
        plant_to += 46.0 * plant * gauss(minute, 6 * 60 + 40, 26)
        plant_to += 52.0 * plant * gauss(minute, 7 * 60 + 25, 24)
        plant_to += 20.0 * plant * gauss(minute, 15 * 60 + 40, 22)
        plant_to += 18.0 * plant * gauss(minute, 19 * 60 + 20, 24)
    plant_from = 0.0
    if from_plant:
        if not weekend and not holiday:
            plant_from += 38.0 * gauss(minute, 16 * 60 + 15, 22)
            plant_from += 62.0 * gauss(minute, 17 * 60 + 20, 24)
        plant_from += 26.0 * gauss(minute, 19 * 60 + 15, 24)
        plant_from += 44.0 * gauss(minute, 20 * 60 + 12, 26)
        plant_from += 14.0 * gauss(minute, 8 * 60 + 10, 20)

    campus = 0.0
    if uni and not to_plant:
        pair = 0.4 if exam else 1.0
        campus += 18.0 * pair * gauss(minute, 8 * 60 + 15, 18)
        for center, amp in (
            (10 * 60 + 12, 14),
            (12 * 60 + 8, 12),
            (14 * 60 + 12, 20),
            (16 * 60 + 2, 16),
            (17 * 60 + 48, 14),
            (19 * 60 + 32, 8),
        ):
            campus += amp * pair * gauss(minute, center, 16)
        if exam:
            campus += 16.0 * gauss(minute, 8 * 60 + 40, 18)
            campus += 14.0 * gauss(minute, 12 * 60 + 50, 22)
    if school and not to_plant:
        campus += 22.0 * gauss(minute, 7 * 60 + 40, 16)
        campus += 18.0 * gauss(minute, 13 * 60 + 40, 20)
        campus += 12.0 * gauss(minute, 15 * 60, 18)
    if pre:
        campus += 11.0 * gauss(minute, 16 * 60 + 20, 35)

    load = base + crowd * (city_k * peaks + toward_k * plant_to + leaving_k * plant_from + city_k * campus)
    hub_day = 0.4 if weekend or holiday or minute < 6 * 60 or minute >= 22 * 60 else 1.0
    load += hub_crowd(hub_routes) * hub_day
    if at_origin >= 0.5 and at_terminus < 0.5 and not from_plant:
        load += 8.0 + 0.25 * hub_crowd(hub_routes)
    if at_terminus >= 0.5 and at_origin < 0.5 and not to_plant:
        load *= 0.5

    if wet:
        load *= 1.08 + min(precip, 6) * 0.025 + min(snow, 3) * 0.04
    load = memory_load(load, precip, snow, precip_3h, snow_3h, temp_vs, first_frost)
    if temp <= -18:
        load *= 1.07
    if temp >= 27 and not wet:
        load *= 0.9
    if wind >= 12 and temp < 0:
        load *= 1.04
    if minibus:
        load *= 1.22
    if bridge and not weekend:
        load *= 1.05
    if minute < 5 * 60 + 30 or minute >= 23 * 60:
        load *= 0.35
    return float(min(98.0, max(2.0, load + noise)))


# Normal 90th percentile, in standard deviations above the median.
Z90 = 1.2815515655446004


def dwell_minutes(occupancy: float) -> float:
    # Doors barely hold a seated bus. Standing passengers slow boarding,
    # and a packed cabin keeps the bus at the stop.
    if occupancy < 40:
        return 0.0
    if occupancy < 75:
        return (occupancy - 40) / 35 * 1.6
    return 1.6 + (min(occupancy, 100) - 75) / 25 * 2.4


def delay_center(
    year: int,
    month: int,
    day: int,
    minute: int,
    temp: float,
    precip: float,
    snow: float,
    wind: float,
    code: int,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
    to_plant: int,
    from_plant: int,
    bridge: int,
    minibus: int,
    stop_frac: float,
    headway: float,
    ride_min: float,
    at_origin: float,
    at_terminus: float,
    hub_routes: float,
    holidays: set[str],
) -> float:
    del to_plant, minibus, wind
    dow = date(year, month, day).weekday()
    holiday = date(year, month, day).isoformat() in holidays
    weekend = dow >= 5
    weekday = 0.0 if weekend or holiday else 1.0
    wet = is_wet(precip, snow, code)
    roll = road_roll(ride_min)
    del stop_frac

    # A bus can leave the origin late. The rest of the delay is earned on the road,
    # so a long timetable run picks up more than a two-stop hop.
    lag = 0.35
    if 6 * 60 <= minute <= 21 * 60:
        lag += 0.45
        lag += (0.5 + 1.5 * roll) * weekday * gauss(minute, 8 * 60, 35)
        lag += (0.55 + 1.7 * roll) * weekday * gauss(minute, 17 * 60 + 30, 40)
    if bridge:
        lag += 0.25 * roll
        lag += 2.0 * roll * weekday * gauss(minute, 8 * 60, 40)
        lag += 2.4 * roll * weekday * gauss(minute, 17 * 60 + 30, 40)
        if wet:
            lag += roll * (1.5 + min(snow, 3) * 0.55 + min(precip, 6) * 0.12)
        if temp < -12:
            lag += 0.7 * roll
    if from_plant:
        lag += 3.0 * weekday * gauss(minute, 16 * 60 + 15, 20)
        lag += 3.4 * weekday * gauss(minute, 17 * 60 + 20, 22)
        lag += 2.6 * gauss(minute, 19 * 60 + 15, 22)
        lag += 3.2 * gauss(minute, 20 * 60 + 10, 22)
        lag += 1.4 * gauss(minute, 8 * 60 + 10, 18)
    if wet and not bridge:
        lag += 0.25 + roll * (0.7 + min(snow, 2) * 0.4)
    if hub_routes >= 4 and 6 * 60 <= minute <= 21 * 60:
        lag += 0.25 + 0.9 * (1.0 - math.exp(-(min(hub_routes, 40.0) - 3.0) / 14.0))
    if at_origin >= 0.5 and at_terminus < 0.5:
        lag *= 0.6
    if weekend:
        lag *= 0.6
    elif holiday:
        lag *= 0.75
    if minute < 5 * 60 + 30 or minute >= 23 * 60:
        lag *= 0.35
    extra = memory_lag(bridge, precip, snow, precip_3h, snow_3h, temp_vs, first_frost)
    extra *= 0.35 + min(roll, 1.6)
    if headway >= 36:
        extra += 0.8
    elif headway <= 12:
        extra -= 0.45
    if minute < 5 * 60 + 30 or minute >= 23 * 60:
        extra *= 0.35
    return lag + extra


def delay_scale(
    year: int,
    month: int,
    day: int,
    minute: int,
    temp: float,
    precip: float,
    snow: float,
    wind: float,
    code: int,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
    to_plant: int,
    from_plant: int,
    bridge: int,
    minibus: int,
    stop_frac: float,
    headway: float,
    ride_min: float,
    at_origin: float,
    at_terminus: float,
    hub_routes: float,
    holidays: set[str],
    occupancy: float,
) -> float:
    del to_plant, from_plant, minibus, wind
    dow = date(year, month, day).weekday()
    holiday = date(year, month, day).isoformat() in holidays
    weekend = dow >= 5
    weekday = 0.0 if weekend or holiday else 1.0
    wet = is_wet(precip, snow, code)

    roll = road_roll(ride_min)
    scale = 0.4 + 0.2 * roll
    if bridge:
        scale += 0.45 * roll
        scale += 0.55 * roll * weekday * gauss(minute, 8 * 60, 40)
        scale += 0.75 * roll * weekday * gauss(minute, 17 * 60 + 30, 40)
        if wet:
            scale += roll * (1.1 + min(snow, 3) * 0.3 + min(precip, 6) * 0.08)
        if temp < -12:
            scale += 0.35 * roll
    elif wet:
        scale += 0.2 + 0.35 * roll + min(snow, 2) * 0.15
    if occupancy >= 75:
        scale += 1.5
    elif occupancy >= 40:
        scale += 0.35
    scale += memory_scale(bridge, precip, snow, precip_3h, snow_3h, temp_vs, first_frost) * (0.4 + min(roll, 1.4))
    del stop_frac, at_origin, at_terminus
    if hub_routes >= 8:
        scale += 0.25
    if headway >= 36:
        scale += 0.35
    if weekend or holiday:
        scale *= 0.65
    return scale


def delay_quantiles(
    year: int,
    month: int,
    day: int,
    minute: int,
    temp: float,
    precip: float,
    snow: float,
    wind: float,
    code: int,
    precip_3h: float,
    snow_3h: float,
    temp_vs: float,
    first_frost: float,
    to_plant: int,
    from_plant: int,
    bridge: int,
    minibus: int,
    stop_frac: float,
    headway: float,
    ride_min: float,
    at_origin: float,
    at_terminus: float,
    hub_routes: float,
    holidays: set[str],
    occupancy: float,
) -> tuple[float, float]:
    shared = (
        year,
        month,
        day,
        minute,
        temp,
        precip,
        snow,
        wind,
        code,
        precip_3h,
        snow_3h,
        temp_vs,
        first_frost,
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
    center = min(28.0, max(0.0, delay_center(*shared) + dwell_minutes(occupancy)))
    high = min(40.0, center + Z90 * delay_scale(*shared, occupancy))
    return float(center), float(max(center, high))
