"""Time boxed bias diagnostic for the January 2026 snapshot.

Evidence for the bias discussion only. It changes no product rule and adds no
endpoint. Run in the Codespace from the repo root:

    PYTHONPATH=. .venv/bin/python scripts/bias_diagnostic.py
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import math
from statistics import fmean

from backend.metrics import score_delivery_window
from backend.store import get_snapshot

UTC = timezone.utc
HALF_HOUR = timedelta(minutes=30)
CUTOFF = "09:00"
PUBLISH_WINDOW_START = datetime(2026, 1, 1, tzinfo=UTC)
PUBLISH_WINDOW_END = datetime(2026, 2, 1, tzinfo=UTC)


def row_stats(forecasts: list[float], actuals: list[float]) -> dict[str, float | int]:
    errors = [forecast - actual for forecast, actual in zip(forecasts, actuals, strict=True)]
    n = len(errors)
    mae = fmean(abs(error) for error in errors)
    bias = fmean(errors)
    rmse = math.sqrt(fmean(error * error for error in errors))
    mean_actual = fmean(actuals)
    return {
        "n": n,
        "mean_forecast_mw": round(fmean(forecasts), 2),
        "mean_actual_mw": round(mean_actual, 2),
        "mae_mw": round(mae, 2),
        "rmse_mw": round(rmse, 2),
        "bias_mw": round(bias, 2),
        "relative_bias_pct": round(100.0 * bias / mean_actual, 2) if mean_actual else 0.0,
    }


def markdown_table(header: list[str], rows: list[list[str]]) -> str:
    lines = [
        "| " + " | ".join(header) + " |",
        "| " + " | ".join("---" for _ in header) + " |",
    ]
    lines.extend("| " + " | ".join(row) + " |" for row in rows)
    return "\n".join(lines)


def main() -> None:
    snapshot = get_snapshot()

    latest_actual: dict[datetime, tuple[datetime, float]] = {}
    for record in snapshot.actuals:
        current = latest_actual.get(record.start_time)
        if current is None or record.publish_time > current[0]:
            latest_actual[record.start_time] = (record.publish_time, record.generation_mw)
    actual_by_start = {start: value for start, (_, value) in latest_actual.items()}

    def hourly_actual(target: datetime) -> float | None:
        first = actual_by_start.get(target)
        second = actual_by_start.get(target + HALF_HOUR)
        if first is None or second is None:
            return None
        return (first + second) / 2.0

    scored = score_delivery_window(
        snapshot.forecasts,
        snapshot.actuals,
        date(2026, 1, 2),
        date(2026, 2, 1),
        CUTOFF,
    )
    points = list(scored.points)
    if len(points) != 744:
        raise RuntimeError(f"expected 744 selected points, found {len(points)}")

    # Lead time profile over all January published vintages.
    january_vintages = [
        vintage
        for vintage in snapshot.forecasts
        if PUBLISH_WINDOW_START <= vintage.publish_time < PUBLISH_WINDOW_END
    ]
    seen_pairs: set[tuple[datetime, datetime]] = set()
    duplicate_count = 0
    out_of_range_count = 0
    missing_actual_count = 0
    buckets: list[list[tuple[float, float]]] = [[] for _ in range(12)]
    for vintage in january_vintages:
        pair = (vintage.start_time, vintage.publish_time)
        if pair in seen_pairs:
            duplicate_count += 1
            continue
        seen_pairs.add(pair)
        lead_hours = (vintage.start_time - vintage.publish_time).total_seconds() / 3600.0
        if not 0.0 <= lead_hours < 48.0:
            out_of_range_count += 1
            continue
        actual = hourly_actual(vintage.start_time)
        if actual is None:
            missing_actual_count += 1
            continue
        buckets[int(lead_hours // 4)].append((vintage.generation_mw, actual))

    lead_rows = []
    bucket_biases: list[tuple[float, float]] = []
    for index, pairs in enumerate(buckets):
        forecasts = [forecast for forecast, _ in pairs]
        actuals = [actual for _, actual in pairs]
        stats = row_stats(forecasts, actuals)
        bucket_biases.append((index * 4 + 2.0, float(stats["bias_mw"])))
        lead_rows.append(
            [
                f"{index * 4} to {index * 4 + 4}",
                str(stats["n"]),
                f"{stats['mean_forecast_mw']:,.2f}",
                f"{stats['mean_actual_mw']:,.2f}",
                f"+{stats['bias_mw']:,.2f}" if stats["bias_mw"] >= 0 else f"{stats['bias_mw']:,.2f}",
                f"{stats['relative_bias_pct']:.2f}",
                f"{stats['mae_mw']:,.2f}",
                f"{stats['rmse_mw']:,.2f}",
            ]
        )
    midpoints = [midpoint for midpoint, _ in bucket_biases]
    biases = [bias for _, bias in bucket_biases]
    midpoint_mean = fmean(midpoints)
    bias_mean = fmean(biases)
    slope = sum(
        (midpoint - midpoint_mean) * (bias - bias_mean)
        for midpoint, bias in bucket_biases
    ) / sum((midpoint - midpoint_mean) ** 2 for midpoint in midpoints)

    print("## Lead time profile, 4 hour buckets, all January published vintages")
    print()
    print(
        f"January published vintages: {len(january_vintages)}, "
        f"exact duplicate pairs dropped: {duplicate_count}, "
        f"excluded outside [0,48): {out_of_range_count}, "
        f"excluded missing actual pair: {missing_actual_count}, "
        f"scored: {sum(len(pairs) for pairs in buckets)}"
    )
    print()
    print(
        markdown_table(
            [
                "Lead hours",
                "n",
                "Mean forecast MW",
                "Mean actual MW",
                "Mean signed error MW",
                "Relative bias pct",
                "MAE MW",
                "RMSE MW",
            ],
            lead_rows,
        )
    )
    print()
    print(f"Least squares slope of bucket bias vs lead midpoint: {slope:.2f} MW per lead hour")
    print()

    # Terciles of the 744 selected cutoff hours.
    ordered = sorted(points, key=lambda point: (point.actual_mw, point.start_time))
    third = len(ordered) // 3
    groups = (
        ("Low", ordered[:third]),
        ("Mid", ordered[third : 2 * third]),
        ("High", ordered[2 * third :]),
    )
    tercile_rows = []
    for name, rows in groups:
        stats = row_stats(
            [row.forecast_mw for row in rows],
            [row.actual_mw for row in rows],
        )
        tercile_rows.append(
            [
                name,
                str(stats["n"]),
                f"{min(row.actual_mw for row in rows):,.1f} to {max(row.actual_mw for row in rows):,.1f}",
                f"{stats['mean_actual_mw']:,.2f}",
                f"{stats['mae_mw']:,.2f}",
                f"{stats['bias_mw']:,.2f}",
                f"{stats['relative_bias_pct']:.2f}",
            ]
        )
    print("## Bias by actual level tercile, 744 selected cutoff hours")
    print()
    print(
        markdown_table(
            ["Group", "n", "Actual range MW", "Mean actual MW", "MAE MW", "Bias MW", "Relative bias pct"],
            tercile_rows,
        )
    )
    print()

    # Shift tests: move the actual window only, forecast timestamp stays fixed.
    def shift_stats(shift_hours: float) -> dict[str, float | int]:
        shift = timedelta(hours=shift_hours)
        forecasts: list[float] = []
        actuals: list[float] = []
        for point in points:
            first = actual_by_start.get(point.start_time + shift)
            second = actual_by_start.get(point.start_time + shift + HALF_HOUR)
            if first is None or second is None:
                continue
            forecasts.append(point.forecast_mw)
            actuals.append((first + second) / 2.0)
        return row_stats(forecasts, actuals)

    baseline = shift_stats(0.0)
    integer_rows = []
    for shift_hours in range(-6, 7):
        stats = shift_stats(float(shift_hours))
        integer_rows.append(
            [
                f"{shift_hours:+d}",
                str(stats["n"]),
                f"{stats['mae_mw']:,.2f}",
                f"{stats['bias_mw']:,.2f}",
            ]
        )
    print("## Shift test, integer hours, actual window moved, forecast timestamp fixed")
    print()
    print(
        markdown_table(
            ["Actual window shift h", "n", "MAE MW", "Bias MW"],
            integer_rows,
        )
    )
    print()
    half_rows = []
    half_steps = [-3.0 + 0.5 * step for step in range(13)]
    for shift_hours in half_steps:
        stats = shift_stats(shift_hours)
        label = f"{shift_hours:+g}"
        half_rows.append([label, str(stats["n"]), f"{stats['mae_mw']:,.2f}", f"{stats['bias_mw']:,.2f}"])
    print("## Shift test, half hour steps from -3 to +3, actual window moved")
    print()
    print(
        markdown_table(
            ["Actual window shift h", "n", "MAE MW", "Bias MW"],
            half_rows,
        )
    )
    print()

    candidates = [(float(hours), shift_stats(float(hours))["mae_mw"]) for hours in range(-6, 7)]
    candidates.extend((hours, shift_stats(hours)["mae_mw"]) for hours in half_steps)
    best_shift, best_mae = min(candidates, key=lambda item: (item[1], abs(item[0])))
    base_mae = float(baseline["mae_mw"])
    gain_mw = base_mae - float(best_mae)
    gain_pct = 100.0 * gain_mw / base_mae
    at_edge = abs(best_shift) == 6.0
    print(
        f"Baseline zero shift: MAE {base_mae:,.2f} MW, bias {baseline['bias_mw']:,.2f} MW. "
        f"Minimum MAE {best_mae:,.2f} MW at shift {best_shift:+g} h, "
        f"gain {gain_mw:,.2f} MW ({gain_pct:.2f} percent). "
        f"Minimum is {'at an edge of the tested range' if at_edge else 'interior'}."
    )
    print()

    # Daily mean signed error over the 31 delivery days.
    daily: dict[date, list[float]] = {}
    for point in points:
        daily.setdefault(point.start_time.date(), []).append(point.error_mw)
    daily_errors = [(day, fmean(errors)) for day, errors in sorted(daily.items())]
    positive_days = sum(1 for _, value in daily_errors if value > 0)
    daily_rows = []
    for index in range(0, len(daily_errors), 2):
        cells: list[str] = []
        first_day, first_value = daily_errors[index]
        cells.append(first_day.isoformat())
        cells.append(f"{first_value:+,.1f}")
        if index + 1 < len(daily_errors):
            second_day, second_value = daily_errors[index + 1]
            cells.append(second_day.isoformat())
            cells.append(f"{second_value:+,.1f}")
        else:
            cells.extend(["", ""])
        daily_rows.append(cells)
    print("## Daily mean signed error, selected cutoff hours, UTC delivery day")
    print()
    print(
        markdown_table(
            ["Delivery day", "Mean signed error MW", "Delivery day", "Mean signed error MW"],
            daily_rows,
        )
    )
    print()
    print(
        f"Days with positive mean error: {positive_days} of {len(daily_errors)}. "
        f"Day mean ranges from {min(value for _, value in daily_errors):+,.1f} MW "
        f"to {max(value for _, value in daily_errors):+,.1f} MW."
    )


if __name__ == "__main__":
    main()
