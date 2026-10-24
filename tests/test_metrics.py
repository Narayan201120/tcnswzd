from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
import json
from pathlib import Path

import pytest

from backend.domain import ActualOutturn, ForecastVintage, parse_timestamp
from backend.metrics import (
    align_hourly_actuals,
    all_vintage_lead_profile,
    by_delivery_clock_hour,
    cutoff_utc,
    delivery_hour_starts,
    error_distribution,
    percentile,
    score_delivery_window,
    select_latest_forecasts,
    summarize,
)

UTC = timezone.utc


def dt(value: str) -> datetime:
    return parse_timestamp(value)


def actual(start: datetime, value: float, published: datetime | None = None) -> ActualOutturn:
    return ActualOutturn(start, published or start + timedelta(minutes=30), value)


def forecast(start: datetime, published: datetime, value: float) -> ForecastVintage:
    return ForecastVintage(start, published, value)


def test_golden_example_from_design_uses_hourly_actual_mean_and_latest_eligible_vintage() -> None:
    sample_dir = Path(__file__).parents[1] / "docs" / "samples"
    actual_records = json.loads((sample_dir / "fuelhh_stream_sample.json").read_text(encoding="utf-8"))
    forecast_records = json.loads((sample_dir / "windfor_target_sample.json").read_text(encoding="utf-8"))
    actuals = [ActualOutturn.from_record(row) for row in actual_records]
    forecasts = [ForecastVintage.from_record(row) for row in forecast_records]

    result = score_delivery_window(
        forecasts, actuals, date(2026, 1, 2), date(2026, 1, 2), "09:00"
    )

    assert result.expected_target_hours == 24
    assert result.missing_half_hour_targets == 23
    assert len(result.points) == 1
    point = result.points[0]
    assert point.start_time == dt("2026-01-02T00:00:00Z")
    assert point.publish_time == dt("2026-01-01T07:30:00Z")
    assert point.forecast_mw == 18781
    assert point.actual_mw == pytest.approx((15228 + 15505) / 2)
    assert point.error_mw == pytest.approx(3414.5)
    assert point.lead_hours == pytest.approx(16.5)


def test_hourly_actual_alignment_drops_target_when_either_half_hour_is_missing() -> None:
    start = dt("2026-01-02T00:00:00Z")
    alignment = align_hourly_actuals([actual(start, 10)], [start])
    assert alignment.actual_by_start == {}
    assert alignment.expected_target_hours == 1
    assert alignment.missing_half_hour_targets == 1
    assert alignment.missing_half_hour_slots == 1


def test_actual_alignment_uses_latest_correction_for_each_half_hour() -> None:
    start = dt("2026-01-02T00:00:00Z")
    rows = [
        actual(start, 10, dt("2026-01-02T01:00:00Z")),
        actual(start, 12, dt("2026-01-02T02:00:00Z")),
        actual(start + timedelta(minutes=30), 20),
    ]
    aligned = align_hourly_actuals(rows, [start])
    assert aligned.actual_by_start[start] == 16
    assert aligned.corrected_actual_starts == 1


def test_selection_uses_latest_publish_at_or_before_local_cutoff() -> None:
    target = dt("2026-01-02T00:00:00Z")
    rows = [
        forecast(target, dt("2026-01-01T07:00:00Z"), 10),
        forecast(target, dt("2026-01-01T09:00:00Z"), 11),
        forecast(target, dt("2026-01-01T09:01:00Z"), 12),
    ]
    selected = select_latest_forecasts(rows, [target], "09:00")
    assert selected[target].generation_mw == 11
    assert selected[target].publish_time == dt("2026-01-01T09:00:00Z")
    assert select_latest_forecasts(rows, [target], "06:00") == {}


def test_selection_rejects_conflicting_same_vintage() -> None:
    target = dt("2026-01-02T00:00:00Z")
    published = dt("2026-01-01T08:00:00Z")
    rows = [forecast(target, published, 10), forecast(target, published, 11)]
    with pytest.raises(ValueError, match="conflicting forecast"):
        select_latest_forecasts(rows, [target], "09:00")


def test_delivery_hours_respect_london_dst_short_and_long_days() -> None:
    spring = delivery_hour_starts(date(2026, 3, 29), date(2026, 3, 29))
    autumn = delivery_hour_starts(date(2026, 10, 25), date(2026, 10, 25))
    assert len(spring) == 23
    assert len(autumn) == 25
    assert len(set(autumn)) == 25


def test_cutoff_rejects_nonexistent_time_and_resolves_ambiguous_time_earlier() -> None:
    with pytest.raises(ValueError, match="nonexistent"):
        cutoff_utc(date(2026, 3, 30), "01:30")
    assert cutoff_utc(date(2026, 10, 26), "01:30") == dt("2026-10-25T00:30:00Z")


def test_cutoff_parser_rejects_bad_clock_values() -> None:
    for value in ("9:00", "24:00", "12:60", "abc"):
        with pytest.raises(ValueError):
            cutoff_utc(date(2026, 1, 2), value)


def test_summary_handles_zero_actual_and_reports_one_sided_buffer() -> None:
    start = dt("2026-01-02T00:00:00Z")
    points = [
        forecast_point(start, 100, 0),
        forecast_point(start + timedelta(hours=1), 50, 100),
    ]
    summary = summarize(points)
    assert summary["sample_count"] == 2
    assert summary["mae_mw"] == 75
    assert summary["bias_mw"] == 25
    assert summary["nmae_pct"] == 150
    assert summary["relative_bias_pct"] == 50
    assert summary["mape_pct"] == 50
    assert summary["mape_excluded_zero_actual_count"] == 1
    assert summary["positive_error_buffer_mw"]["p90"] == pytest.approx(90)
    assert summary["positive_error_buffer_pct_forecast"]["p90"] == pytest.approx(90)
    assert summary["signed_error_percentiles_mw"]["p5"] == pytest.approx(-42.5)
    assert summary["signed_error_percentiles_mw"]["p95"] == pytest.approx(92.5)


def forecast_point(start: datetime, forecast_mw: float, actual_mw: float):
    from backend.domain import ScoredPoint

    published = start - timedelta(hours=1)
    return ScoredPoint(
        start_time=start,
        forecast_mw=forecast_mw,
        actual_mw=actual_mw,
        publish_time=published,
        lead_hours=1,
    )


def test_summary_returns_unavailable_percent_metrics_when_mean_actual_is_zero() -> None:
    point = forecast_point(dt("2026-01-02T00:00:00Z"), 10, 0)
    summary = summarize([point])
    assert summary["mape_pct"] is None
    assert summary["nmae_pct"] is None
    assert summary["relative_bias_pct"] is None
    assert summary["mape_excluded_zero_actual_count"] == 1


def test_empty_summary_and_invalid_percentile_probability() -> None:
    assert summarize([])["sample_count"] == 0
    assert percentile([], 0.5) is None
    with pytest.raises(ValueError):
        percentile([1.0, 2.0], 1.1)


def test_all_vintage_profile_buckets_leads_and_reports_exclusions() -> None:
    start = dt("2026-01-02T00:00:00Z")
    missing_start = start + timedelta(hours=1)
    alignment = align_hourly_actuals([actual(start, 10), actual(start + timedelta(minutes=30), 10)], [start, missing_start])
    rows = [
        forecast(start, start - timedelta(minutes=30), 30),
        forecast(start, start - timedelta(hours=1, minutes=30), 0),
        forecast(start, start - timedelta(hours=48), 10),
        forecast(start, start + timedelta(minutes=30), 10),
        forecast(missing_start, missing_start - timedelta(hours=2), 5),
    ]
    profile = all_vintage_lead_profile(rows, alignment, [start, missing_start])
    assert profile["eligible_vintage_count"] == 2
    assert profile["excluded_out_of_range_count"] == 2
    assert profile["excluded_missing_actual_count"] == 1
    assert profile["buckets"][0]["sample_count"] == 1
    assert profile["buckets"][0]["mae_mw"] == 20
    assert profile["buckets"][1]["sample_count"] == 1
    assert profile["buckets"][1]["bias_mw"] == -10
    assert len(profile["buckets"]) == 48


def test_by_delivery_clock_hour_and_distribution_keep_signed_errors() -> None:
    start = dt("2026-01-02T03:00:00Z")
    points = [forecast_point(start, 15, 10), forecast_point(start, 5, 10)]
    profile = by_delivery_clock_hour(points)
    assert profile[3]["sample_count"] == 2
    assert profile[3]["mae_mw"] == 5
    assert profile[3]["bias_mw"] == 0
    distribution = error_distribution(points)
    assert distribution["signed_error_mw"] == [-5, 5]
    assert distribution["absolute_error_mw"] == [5, 5]
