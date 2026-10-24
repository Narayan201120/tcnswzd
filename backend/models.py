from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class SignedPercentiles(StrictModel):
    p5: float | None
    p10: float | None
    p50: float | None
    p90: float | None
    p95: float | None


class ErrorPercentiles(StrictModel):
    p50: float | None
    p90: float | None
    p95: float | None


class BufferPercentiles(StrictModel):
    p90: float | None
    p95: float | None


class AccuracyMetrics(StrictModel):
    sample_count: int
    mean_actual_mw: float | None
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    nmae_pct: float | None
    relative_bias_pct: float | None
    mape_pct: float | None
    mape_sample_count: int
    mape_excluded_zero_actual_count: int
    signed_error_percentiles_mw: SignedPercentiles
    absolute_error_percentiles_mw: ErrorPercentiles
    positive_error_buffer_mw: BufferPercentiles
    positive_error_buffer_pct_forecast: BufferPercentiles
    positive_error_buffer_pct_sample_count: int


class Coverage(StrictModel):
    expected_target_hours: int
    scored_target_hours: int
    missing_half_hour_targets: int
    missing_forecast_targets: int
    corrected_actual_starts: int


class HealthResponse(StrictModel):
    status: str
    snapshot_loaded: bool
    actual_rows: int
    forecast_vintages: int
    schema_version: int | None


class ForecastPoint(StrictModel):
    start_time_utc: str
    forecast_mw: float | None
    publish_time_utc: str | None
    lead_hours: float | None


class ForecastResponse(StrictModel):
    delivery_date: str
    cutoff_local: str
    cutoff_utc: str
    points: list[ForecastPoint]
    missing_forecast_hours: int


class ScoredPointResponse(StrictModel):
    start_time_utc: str
    forecast_mw: float
    actual_mw: float
    error_mw: float
    absolute_error_mw: float
    publish_time_utc: str
    lead_hours: float


class ComparisonResponse(StrictModel):
    start_date: str
    end_date: str
    cutoff_local: str
    cutoff_timezone: str
    coverage: Coverage
    points: list[ScoredPointResponse]


class AccuracySummaryResponse(AccuracyMetrics):
    start_date: str
    end_date: str
    cutoff_local: str
    cutoff_timezone: str
    coverage: Coverage


class HourBucket(StrictModel):
    hour_local: int
    sample_count: int
    mae_mw: float | None
    bias_mw: float | None


class HourProfileResponse(StrictModel):
    start_date: str
    end_date: str
    cutoff_local: str
    cutoff_timezone: str
    buckets: list[HourBucket]


class LeadBucket(StrictModel):
    lead_start_hours: int
    lead_end_hours: int
    sample_count: int
    mae_mw: float | None
    bias_mw: float | None


class LeadTimeResponse(StrictModel):
    start_date: str
    end_date: str
    eligible_vintage_count: int
    excluded_out_of_range_count: int
    excluded_missing_actual_count: int
    buckets: list[LeadBucket]


class DistributionResponse(StrictModel):
    start_date: str
    end_date: str
    cutoff_local: str
    cutoff_timezone: str
    sample_count: int
    signed_error_mw: list[float]
    absolute_error_mw: list[float]


class SensitivityPoint(StrictModel):
    cutoff_local: str
    sample_count: int
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    p95_absolute_error_mw: float | None


class CutoffSensitivityResponse(StrictModel):
    start_date: str
    end_date: str
    cutoff_timezone: str
    cutoffs_compared: list[str]
    results: list[SensitivityPoint]


class RevisionPoint(StrictModel):
    start_time_utc: str
    generation_mw: float
    selected_at_cutoff: bool


class RevisionVintage(StrictModel):
    publish_time_utc: str
    points: list[RevisionPoint]


class RevisionResponse(StrictModel):
    delivery_date: str
    cutoff_local: str
    cutoff_utc: str
    vintages: list[RevisionVintage]
