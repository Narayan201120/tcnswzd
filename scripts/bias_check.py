from __future__ import annotations

from datetime import datetime, timedelta, timezone
import json
from statistics import mean
from zoneinfo import ZoneInfo

from backend.domain import ActualOutturn
from backend.ingest import fetch_stream
from backend.metrics import score_delivery_window, summarize
from backend.store import get_snapshot

UTC = timezone.utc
LONDON = ZoneInfo("Europe/London")
HALF_HOUR = timedelta(minutes=30)


def metric_row(forecasts: list[float], actuals: list[float]) -> dict[str, float | int]:
    errors = [forecast - actual for forecast, actual in zip(forecasts, actuals, strict=True)]
    return {
        "n": len(errors),
        "mae_mw": mean(abs(error) for error in errors),
        "bias_mw": mean(errors),
    }


def main() -> None:
    snapshot = get_snapshot()
    actual_raw = fetch_stream(
        "datasets/FUELHH/stream",
        {
            "publishDateTimeFrom": "2026-01-01T00:00:00Z",
            "publishDateTimeTo": "2026-02-03T03:00:00Z",
            "fuelType": "WIND",
        },
    )
    latest_actual: dict[datetime, ActualOutturn] = {}
    for row in actual_raw:
        if row.get("fuelType") != "WIND":
            continue
        actual = ActualOutturn.from_record(row)
        current = latest_actual.get(actual.start_time)
        if current is None or actual.publish_time > current.publish_time:
            latest_actual[actual.start_time] = actual

    result = score_delivery_window(
        snapshot.forecasts,
        snapshot.actuals,
        datetime(2026, 1, 2).date(),
        datetime(2026, 2, 1).date(),
        "09:00",
    )
    points = list(result.points)
    base_summary = summarize(points)
    if len(points) != 744:
        raise RuntimeError(f"expected 744 selected forecast points, found {len(points)}")

    alignment_rows = []
    for shift_hours in (-2, -1, 0, 1, 2):
        first_forecasts: list[float] = []
        first_actuals: list[float] = []
        second_forecasts: list[float] = []
        second_actuals: list[float] = []
        mean_forecasts: list[float] = []
        mean_actuals: list[float] = []
        shift = timedelta(hours=shift_hours)
        for point in points:
            first_time = point.start_time + shift
            second_time = first_time + HALF_HOUR
            first = latest_actual.get(first_time)
            second = latest_actual.get(second_time)
            if first is None or second is None:
                continue
            first_forecasts.append(point.forecast_mw)
            first_actuals.append(first.generation_mw)
            second_forecasts.append(point.forecast_mw)
            second_actuals.append(second.generation_mw)
            mean_forecasts.append(point.forecast_mw)
            mean_actuals.append((first.generation_mw + second.generation_mw) / 2)
        alignment_rows.append(
            {
                "shift_hours": shift_hours,
                "first_half_hour": metric_row(first_forecasts, first_actuals),
                "second_half_hour": metric_row(second_forecasts, second_actuals),
                "hourly_mean": metric_row(mean_forecasts, mean_actuals),
            }
        )

    ordered = sorted(points, key=lambda point: (point.actual_mw, point.start_time))
    tercile_size = len(ordered) // 3
    terciles = []
    for name, rows in zip(
        ("low", "mid", "high"),
        (ordered[:tercile_size], ordered[tercile_size : 2 * tercile_size], ordered[2 * tercile_size :]),
        strict=True,
    ):
        stats = summarize(rows)
        terciles.append(
            {
                "level": name,
                "n": len(rows),
                "actual_min_mw": min(row.actual_mw for row in rows),
                "actual_max_mw": max(row.actual_mw for row in rows),
                "mean_actual_mw": stats["mean_actual_mw"],
                "mae_mw": stats["mae_mw"],
                "bias_mw": stats["bias_mw"],
                "relative_bias_pct": stats["relative_bias_pct"],
            }
        )

    time_blocks = []
    for block_start in range(0, 24, 4):
        rows = [
            point
            for point in points
            if block_start <= point.start_time.astimezone(LONDON).hour < block_start + 4
        ]
        stats = summarize(rows)
        time_blocks.append(
            {
                "local_hours": f"{block_start:02d}-{block_start + 3:02d}",
                "n": len(rows),
                "mean_actual_mw": stats["mean_actual_mw"],
                "mae_mw": stats["mae_mw"],
                "bias_mw": stats["bias_mw"],
                "relative_bias_pct": stats["relative_bias_pct"],
            }
        )

    first_target = datetime(2026, 1, 2, tzinfo=UTC)
    first_forecast = next(point for point in points if point.start_time == first_target)
    first_actual = latest_actual[first_target]
    second_actual = latest_actual[first_target + HALF_HOUR]
    report = {
        "source": "Codespace snapshot plus FUELHH boundary actuals fetched from the existing Elexon stream",
        "target_count": len(points),
        "boundary_actual_rows_fetched": len(actual_raw),
        "boundary_actual_starts_available": len(latest_actual),
        "primary_alignment": {
            "mean_actual_mw": base_summary["mean_actual_mw"],
            "mae_mw": base_summary["mae_mw"],
            "nmae_pct": base_summary["nmae_pct"],
            "bias_mw": base_summary["bias_mw"],
            "relative_bias_pct": base_summary["relative_bias_pct"],
        },
        "first_target_hand_check": {
            "start_time_utc": first_target.isoformat().replace("+00:00", "Z"),
            "forecast_mw": first_forecast.forecast_mw,
            "publish_time_utc": first_forecast.publish_time.isoformat().replace("+00:00", "Z"),
            "first_actual_mw": first_actual.generation_mw,
            "second_actual_mw": second_actual.generation_mw,
            "hourly_mean_actual_mw": (first_actual.generation_mw + second_actual.generation_mw) / 2,
            "error_mw": first_forecast.forecast_mw - (first_actual.generation_mw + second_actual.generation_mw) / 2,
        },
        "alignment_sensitivity": alignment_rows,
        "actual_level_terciles": terciles,
        "time_of_day_4_hour_blocks": time_blocks,
    }
    print(json.dumps(report, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
