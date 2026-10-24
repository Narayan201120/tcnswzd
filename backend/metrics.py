from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
import math
from statistics import mean
from typing import Iterable
from zoneinfo import ZoneInfo

from backend.domain import ActualOutturn, ForecastVintage, ScoredPoint

LONDON = ZoneInfo("Europe/London")
UTC = ZoneInfo("UTC")
HALF_HOUR = timedelta(minutes=30)
ONE_HOUR = timedelta(hours=1)


@dataclass(frozen=True, slots=True)
class HourlyAlignment:
    actual_by_start: dict[datetime, float]
    expected_target_hours: int
    missing_half_hour_targets: int
    missing_half_hour_slots: int
    corrected_actual_starts: int


@dataclass(frozen=True, slots=True)
class ScoredWindow:
    points: tuple[ScoredPoint, ...]
    expected_target_hours: int
    missing_half_hour_targets: int
    missing_forecast_targets: int
    corrected_actual_starts: int


def percentile(values: Iterable[float], probability: float) -> float | None:
    ordered = sorted(values)
    if not ordered:
        return None
    if not 0 <= probability <= 1:
        raise ValueError("percentile probability must be between 0 and 1")
    position = (len(ordered) - 1) * probability
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    fraction = position - lower
    return ordered[lower] + (ordered[upper] - ordered[lower]) * fraction


def parse_cutoff(cutoff: str) -> time:
    parts = cutoff.split(":")
    if len(parts) != 2 or any(len(part) != 2 or not part.isascii() or not part.isdigit() for part in parts):
        raise ValueError("cutoff must use HH:MM in Europe/London")
    try:
        hour, minute = (int(part) for part in parts)
    except ValueError as error:
        raise ValueError("cutoff must use HH:MM in Europe/London") from error
    if not 0 <= hour <= 23 or not 0 <= minute <= 59:
        raise ValueError("cutoff must use HH:MM in Europe/London")
    return time(hour=hour, minute=minute)


def cutoff_utc(delivery_date: date, cutoff: str) -> datetime:
    local_clock = parse_cutoff(cutoff)
    naive = datetime.combine(delivery_date - timedelta(days=1), local_clock)
    local = naive.replace(tzinfo=LONDON, fold=0)
    round_trip = local.astimezone(UTC).astimezone(LONDON).replace(tzinfo=None)
    if round_trip != naive:
        raise ValueError("cutoff falls in a nonexistent Europe/London time")
    return local.astimezone(UTC)


def delivery_hour_starts(start: date, end: date) -> list[datetime]:
    if end < start:
        raise ValueError("end date must be on or after start date")
    local_start = datetime.combine(start, time.min, tzinfo=LONDON).astimezone(UTC)
    local_end = datetime.combine(end + timedelta(days=1), time.min, tzinfo=LONDON).astimezone(UTC)
    hours: list[datetime] = []
    current = local_start
    while current < local_end:
        hours.append(current)
        current += ONE_HOUR
    return hours


def align_hourly_actuals(
    actuals: Iterable[ActualOutturn], target_hours: Iterable[datetime]
) -> HourlyAlignment:
    latest_by_start: dict[datetime, ActualOutturn] = {}
    version_count: dict[datetime, int] = defaultdict(int)
    for row in actuals:
        version_count[row.start_time] += 1
        current = latest_by_start.get(row.start_time)
        if current is None or row.publish_time > current.publish_time:
            latest_by_start[row.start_time] = row

    starts = list(target_hours)
    actual_by_hour: dict[datetime, float] = {}
    missing_targets = 0
    missing_slots = 0
    for start in starts:
        first = latest_by_start.get(start)
        second = latest_by_start.get(start + HALF_HOUR)
        missing_slots += int(first is None) + int(second is None)
        if first is None or second is None:
            missing_targets += 1
            continue
        actual_by_hour[start] = (first.generation_mw + second.generation_mw) / 2

    return HourlyAlignment(
        actual_by_start=actual_by_hour,
        expected_target_hours=len(starts),
        missing_half_hour_targets=missing_targets,
        missing_half_hour_slots=missing_slots,
        corrected_actual_starts=sum(count > 1 for count in version_count.values()),
    )


def select_latest_forecasts(
    forecasts: Iterable[ForecastVintage], target_hours: Iterable[datetime], cutoff: str
) -> dict[datetime, ForecastVintage]:
    target_list = list(target_hours)
    target_set = set(target_list)
    cutoffs = {target: cutoff_utc(target.astimezone(LONDON).date(), cutoff) for target in target_list}
    selected: dict[datetime, ForecastVintage] = {}
    for row in forecasts:
        if row.start_time not in target_set or row.publish_time > cutoffs[row.start_time]:
            continue
        current = selected.get(row.start_time)
        if current is None or row.publish_time > current.publish_time:
            selected[row.start_time] = row
        elif row.publish_time == current.publish_time and row.generation_mw != current.generation_mw:
            raise ValueError("conflicting forecast rows share startTime and publishTime")
    return selected


def score_delivery_window(
    forecasts: Iterable[ForecastVintage],
    actuals: Iterable[ActualOutturn],
    start: date,
    end: date,
    cutoff: str,
) -> ScoredWindow:
    targets = delivery_hour_starts(start, end)
    actual_rows = list(actuals)
    forecast_rows = list(forecasts)
    alignment = align_hourly_actuals(actual_rows, targets)
    selected = select_latest_forecasts(forecast_rows, targets, cutoff)
    points: list[ScoredPoint] = []
    missing_forecast = 0
    for target in targets:
        actual = alignment.actual_by_start.get(target)
        forecast = selected.get(target)
        if actual is None:
            continue
        if forecast is None:
            missing_forecast += 1
            continue
        points.append(
            ScoredPoint(
                start_time=target,
                forecast_mw=forecast.generation_mw,
                actual_mw=actual,
                publish_time=forecast.publish_time,
                lead_hours=(target - forecast.publish_time).total_seconds() / 3600,
            )
        )
    return ScoredWindow(
        points=tuple(points),
        expected_target_hours=len(targets),
        missing_half_hour_targets=alignment.missing_half_hour_targets,
        missing_forecast_targets=missing_forecast,
        corrected_actual_starts=alignment.corrected_actual_starts,
    )


def summarize(points: Iterable[ScoredPoint]) -> dict[str, object]:
    rows = list(points)
    count = len(rows)
    if not rows:
        return {
            "sample_count": 0,
            "mean_actual_mw": None,
            "mae_mw": None,
            "rmse_mw": None,
            "bias_mw": None,
            "nmae_pct": None,
            "relative_bias_pct": None,
            "mape_pct": None,
            "mape_sample_count": 0,
            "mape_excluded_zero_actual_count": 0,
            "signed_error_percentiles_mw": {"p5": None, "p10": None, "p50": None, "p90": None, "p95": None},
            "absolute_error_percentiles_mw": {"p50": None, "p90": None, "p95": None},
            "positive_error_buffer_mw": {"p90": None, "p95": None},
            "positive_error_buffer_pct_forecast": {"p90": None, "p95": None},
            "positive_error_buffer_pct_sample_count": 0,
        }

    errors = [point.error_mw for point in rows]
    absolute_errors = [abs(error) for error in errors]
    actual_mean = mean(point.actual_mw for point in rows)
    nonzero_actual_rows = [point for point in rows if point.actual_mw != 0]
    mape = (
        mean(abs(point.error_mw / point.actual_mw) * 100 for point in nonzero_actual_rows)
        if nonzero_actual_rows
        else None
    )
    positive_errors = [max(error, 0.0) for error in errors]
    positive_percent_rows = [
        max(point.error_mw, 0.0) / point.forecast_mw * 100
        for point in rows
        if point.forecast_mw != 0
    ]
    squared_mean = mean(error * error for error in errors)
    return {
        "sample_count": count,
        "mean_actual_mw": actual_mean,
        "mae_mw": mean(absolute_errors),
        "rmse_mw": math.sqrt(squared_mean),
        "bias_mw": mean(errors),
        "nmae_pct": mean(absolute_errors) / actual_mean * 100 if actual_mean != 0 else None,
        "relative_bias_pct": mean(errors) / actual_mean * 100 if actual_mean != 0 else None,
        "mape_pct": mape,
        "mape_sample_count": len(nonzero_actual_rows),
        "mape_excluded_zero_actual_count": count - len(nonzero_actual_rows),
        "signed_error_percentiles_mw": {
            f"p{int(p * 100)}": percentile(errors, p) for p in (0.05, 0.10, 0.50, 0.90, 0.95)
        },
        "absolute_error_percentiles_mw": {
            f"p{int(p * 100)}": percentile(absolute_errors, p) for p in (0.50, 0.90, 0.95)
        },
        "positive_error_buffer_mw": {
            f"p{int(p * 100)}": percentile(positive_errors, p) for p in (0.90, 0.95)
        },
        "positive_error_buffer_pct_forecast": {
            f"p{int(p * 100)}": percentile(positive_percent_rows, p) for p in (0.90, 0.95)
        },
        "positive_error_buffer_pct_sample_count": len(positive_percent_rows),
    }


def by_delivery_clock_hour(points: Iterable[ScoredPoint]) -> list[dict[str, object]]:
    grouped: dict[int, list[ScoredPoint]] = {hour: [] for hour in range(24)}
    for point in points:
        local_hour = point.start_time.astimezone(LONDON).hour
        grouped[local_hour].append(point)
    return [
        {
            "hour_local": hour,
            "sample_count": len(grouped[hour]),
            "mae_mw": summarize(grouped[hour])["mae_mw"],
            "bias_mw": summarize(grouped[hour])["bias_mw"],
        }
        for hour in range(24)
    ]


def all_vintage_lead_profile(
    forecasts: Iterable[ForecastVintage],
    alignment: HourlyAlignment,
    target_hours: Iterable[datetime],
) -> dict[str, object]:
    target_set = set(target_hours)
    groups: dict[int, list[ScoredPoint]] = {hour: [] for hour in range(48)}
    out_of_range = 0
    missing_actual = 0
    eligible = 0
    for row in forecasts:
        if row.start_time not in target_set:
            continue
        actual = alignment.actual_by_start.get(row.start_time)
        if actual is None:
            missing_actual += 1
            continue
        lead = (row.start_time - row.publish_time).total_seconds() / 3600
        if lead < 0 or lead >= 48:
            out_of_range += 1
            continue
        bucket = math.floor(lead)
        groups[bucket].append(
            ScoredPoint(
                start_time=row.start_time,
                forecast_mw=row.generation_mw,
                actual_mw=actual,
                publish_time=row.publish_time,
                lead_hours=lead,
            )
        )
        eligible += 1
    buckets: list[dict[str, object]] = []
    for hour in range(48):
        stats = summarize(groups[hour])
        buckets.append(
            {
                "lead_start_hours": hour,
                "lead_end_hours": hour + 1,
                "sample_count": stats["sample_count"],
                "mae_mw": stats["mae_mw"],
                "bias_mw": stats["bias_mw"],
            }
        )
    return {
        "eligible_vintage_count": eligible,
        "excluded_out_of_range_count": out_of_range,
        "excluded_missing_actual_count": missing_actual,
        "buckets": buckets,
    }


def error_distribution(points: Iterable[ScoredPoint]) -> dict[str, object]:
    rows = list(points)
    signed = sorted(point.error_mw for point in rows)
    absolute = sorted(abs(value) for value in signed)
    return {"sample_count": len(rows), "signed_error_mw": signed, "absolute_error_mw": absolute}
