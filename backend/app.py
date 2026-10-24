from __future__ import annotations

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Query

from backend.domain import iso_utc
from backend.metrics import (
    align_hourly_actuals,
    all_vintage_lead_profile,
    by_delivery_clock_hour,
    cutoff_utc,
    delivery_hour_starts,
    error_distribution,
    score_delivery_window,
    select_latest_forecasts,
    summarize,
)
from backend.models import (
    AccuracySummaryResponse,
    ComparisonResponse,
    Coverage,
    CutoffSensitivityResponse,
    DistributionResponse,
    ForecastResponse,
    ForecastPoint,
    HealthResponse,
    HourProfileResponse,
    LeadTimeResponse,
    RevisionResponse,
    RevisionVintage,
    RevisionPoint,
    ScoredPointResponse,
    SensitivityPoint,
)
from backend.store import Snapshot, get_snapshot

LONDON = ZoneInfo("Europe/London")
SCOPE_START = date(2026, 1, 2)
SCOPE_END = date(2026, 2, 1)
DEFAULT_CUTOFF = "09:00"
DEFAULT_START = SCOPE_START
DEFAULT_END = SCOPE_END
LEAD_PUBLISH_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
LEAD_PUBLISH_END = datetime(2026, 2, 1, tzinfo=timezone.utc)

app = FastAPI(title="WindLens API", version="0.2.0")


def _snapshot() -> Snapshot:
    try:
        return get_snapshot()
    except FileNotFoundError as error:
        raise HTTPException(status_code=503, detail="January 2026 snapshot is not installed") from error
    except (ValueError, OSError) as error:
        raise HTTPException(status_code=503, detail=f"January 2026 snapshot is invalid: {error}") from error


def _check_range(start: date, end: date) -> None:
    if end < start:
        raise HTTPException(status_code=422, detail="end must be on or after start")
    if start < SCOPE_START or end > SCOPE_END:
        raise HTTPException(
            status_code=422,
            detail=f"date range must be within {SCOPE_START.isoformat()} through {SCOPE_END.isoformat()}",
        )


def _checked_score(snapshot: Snapshot, start: date, end: date, cutoff: str):
    _check_range(start, end)
    try:
        return score_delivery_window(snapshot.forecasts, snapshot.actuals, start, end, cutoff)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error


def _coverage(result) -> Coverage:
    return Coverage(
        expected_target_hours=result.expected_target_hours,
        scored_target_hours=len(result.points),
        missing_half_hour_targets=result.missing_half_hour_targets,
        missing_forecast_targets=result.missing_forecast_targets,
        corrected_actual_starts=result.corrected_actual_starts,
    )


def _point_response(point) -> ScoredPointResponse:
    return ScoredPointResponse(
        start_time_utc=iso_utc(point.start_time),
        forecast_mw=point.forecast_mw,
        actual_mw=point.actual_mw,
        error_mw=point.error_mw,
        absolute_error_mw=point.absolute_error_mw,
        publish_time_utc=iso_utc(point.publish_time),
        lead_hours=point.lead_hours,
    )


def _metrics_with_cutoff(snapshot: Snapshot, start: date, end: date, cutoff: str) -> dict[str, object]:
    result = _checked_score(snapshot, start, end, cutoff)
    return summarize(result.points)


@app.get("/health", response_model=HealthResponse)
def health() -> HealthResponse:
    try:
        snapshot = get_snapshot()
    except (FileNotFoundError, ValueError, OSError):
        return HealthResponse(status="degraded", snapshot_loaded=False, actual_rows=0, forecast_vintages=0, schema_version=None)
    return HealthResponse(
        status="ok",
        snapshot_loaded=True,
        actual_rows=len(snapshot.actuals),
        forecast_vintages=len(snapshot.forecasts),
        schema_version=snapshot.schema_version,
    )


@app.get("/api/forecast/latest", response_model=ForecastResponse)
def latest_forecast(
    delivery_date: date = Query(...),
    cutoff: str = Query(DEFAULT_CUTOFF, description="D-1 clock time in Europe/London, HH:MM"),
) -> ForecastResponse:
    _check_range(delivery_date, delivery_date)
    snapshot = _snapshot()
    targets = delivery_hour_starts(delivery_date, delivery_date)
    try:
        selected = select_latest_forecasts(snapshot.forecasts, targets, cutoff)
        resolved_cutoff = cutoff_utc(delivery_date, cutoff)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    points = []
    for target in targets:
        row = selected.get(target)
        points.append(
            ForecastPoint(
                start_time_utc=iso_utc(target),
                forecast_mw=row.generation_mw if row else None,
                publish_time_utc=iso_utc(row.publish_time) if row else None,
                lead_hours=(target - row.publish_time).total_seconds() / 3600 if row else None,
            )
        )
    local_cutoff = resolved_cutoff.astimezone(LONDON).isoformat(timespec="minutes")
    return ForecastResponse(
        delivery_date=delivery_date.isoformat(),
        cutoff_local=local_cutoff,
        cutoff_utc=iso_utc(resolved_cutoff),
        points=points,
        missing_forecast_hours=sum(point.forecast_mw is None for point in points),
    )


@app.get("/api/actual-vs-forecast", response_model=ComparisonResponse)
def actual_vs_forecast(
    start: date = DEFAULT_START,
    end: date = DEFAULT_END,
    cutoff: str = Query(DEFAULT_CUTOFF, description="D-1 clock time in Europe/London, HH:MM"),
) -> ComparisonResponse:
    snapshot = _snapshot()
    result = _checked_score(snapshot, start, end, cutoff)
    return ComparisonResponse(
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        cutoff_local=cutoff,
        cutoff_timezone="Europe/London",
        coverage=_coverage(result),
        points=[_point_response(point) for point in result.points],
    )


@app.get("/api/accuracy/summary", response_model=AccuracySummaryResponse)
def accuracy_summary(
    start: date = DEFAULT_START,
    end: date = DEFAULT_END,
    cutoff: str = Query(DEFAULT_CUTOFF, description="D-1 clock time in Europe/London, HH:MM"),
) -> AccuracySummaryResponse:
    snapshot = _snapshot()
    result = _checked_score(snapshot, start, end, cutoff)
    return AccuracySummaryResponse(
        **summarize(result.points),
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        cutoff_local=cutoff,
        cutoff_timezone="Europe/London",
        coverage=_coverage(result),
    )


@app.get("/api/accuracy/by-hour", response_model=HourProfileResponse)
def accuracy_by_hour(
    start: date = DEFAULT_START,
    end: date = DEFAULT_END,
    cutoff: str = Query(DEFAULT_CUTOFF, description="D-1 clock time in Europe/London, HH:MM"),
) -> HourProfileResponse:
    snapshot = _snapshot()
    result = _checked_score(snapshot, start, end, cutoff)
    return HourProfileResponse(
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        cutoff_local=cutoff,
        cutoff_timezone="Europe/London",
        buckets=by_delivery_clock_hour(result.points),
    )


@app.get("/api/accuracy/by-lead-time", response_model=LeadTimeResponse)
def accuracy_by_lead_time(
    start: date = DEFAULT_START,
    end: date = DEFAULT_END,
) -> LeadTimeResponse:
    _check_range(start, end)
    snapshot = _snapshot()
    targets = delivery_hour_starts(start, end)
    alignment = align_hourly_actuals(snapshot.actuals, targets)
    january_vintages = (row for row in snapshot.forecasts if LEAD_PUBLISH_START <= row.publish_time < LEAD_PUBLISH_END)
    profile = all_vintage_lead_profile(january_vintages, alignment, targets)
    return LeadTimeResponse(start_date=start.isoformat(), end_date=end.isoformat(), **profile)


@app.get("/api/accuracy/distribution", response_model=DistributionResponse)
def accuracy_distribution(
    start: date = DEFAULT_START,
    end: date = DEFAULT_END,
    cutoff: str = Query(DEFAULT_CUTOFF, description="D-1 clock time in Europe/London, HH:MM"),
) -> DistributionResponse:
    snapshot = _snapshot()
    result = _checked_score(snapshot, start, end, cutoff)
    distribution = error_distribution(result.points)
    return DistributionResponse(
        start_date=start.isoformat(),
        end_date=end.isoformat(),
        cutoff_local=cutoff,
        cutoff_timezone="Europe/London",
        **distribution,
    )


@app.get("/api/accuracy/cutoff-sensitivity", response_model=CutoffSensitivityResponse)
def cutoff_sensitivity(
    start: date = DEFAULT_START,
    end: date = DEFAULT_END,
    cutoff: str | None = Query(None, description="Optional additional cutoff in Europe/London, HH:MM"),
) -> CutoffSensitivityResponse:
    _check_range(start, end)
    cutoffs = ["08:00", "09:00", "09:20"]
    if cutoff:
        cutoffs.append(cutoff)
    unique_cutoffs = list(dict.fromkeys(cutoffs))
    snapshot = _snapshot()
    results = []
    for item in unique_cutoffs:
        stats = _metrics_with_cutoff(snapshot, start, end, item)
        absolute = stats["absolute_error_percentiles_mw"]
        results.append(
            SensitivityPoint(
                cutoff_local=item,
                sample_count=int(stats["sample_count"]),
                mae_mw=stats["mae_mw"],
                rmse_mw=stats["rmse_mw"],
                bias_mw=stats["bias_mw"],
                p95_absolute_error_mw=absolute["p95"],
            )
        )
    return CutoffSensitivityResponse(
        start_date=start.isoformat(), end_date=end.isoformat(), cutoff_timezone="Europe/London", cutoffs_compared=unique_cutoffs, results=results
    )


@app.get("/api/revisions", response_model=RevisionResponse)
def revisions(
    delivery_date: date = Query(...),
    cutoff: str = Query(DEFAULT_CUTOFF, description="D-1 clock time in Europe/London, HH:MM"),
) -> RevisionResponse:
    _check_range(delivery_date, delivery_date)
    snapshot = _snapshot()
    targets = delivery_hour_starts(delivery_date, delivery_date)
    try:
        selected = select_latest_forecasts(snapshot.forecasts, targets, cutoff)
        resolved_cutoff = cutoff_utc(delivery_date, cutoff)
    except ValueError as error:
        raise HTTPException(status_code=422, detail=str(error)) from error
    target_set = set(targets)
    grouped = {}
    for row in snapshot.forecasts:
        if row.start_time not in target_set:
            continue
        grouped.setdefault(row.publish_time, []).append(
            RevisionPoint(
                start_time_utc=iso_utc(row.start_time),
                generation_mw=row.generation_mw,
                selected_at_cutoff=selected.get(row.start_time) == row,
            )
        )
    vintages = [
        RevisionVintage(
            publish_time_utc=iso_utc(published),
            points=sorted(points, key=lambda point: point.start_time_utc),
        )
        for published, points in sorted(grouped.items())
    ]
    return RevisionResponse(
        delivery_date=delivery_date.isoformat(),
        cutoff_local=resolved_cutoff.astimezone(LONDON).isoformat(timespec="minutes"),
        cutoff_utc=iso_utc(resolved_cutoff),
        vintages=vintages,
    )
