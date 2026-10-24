from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from fastapi.testclient import TestClient

import backend.app as app_module
from backend.domain import ActualOutturn, ForecastVintage
from backend.store import Snapshot

UTC = timezone.utc
DELIVERY = date(2026, 1, 2)


def make_snapshot() -> Snapshot:
    actuals = []
    forecasts = []
    for hour in range(24):
        start = datetime(2026, 1, 2, hour, tzinfo=UTC)
        actual_mw = 1000 + hour
        actuals.append(ActualOutturn(start, start + timedelta(minutes=30), actual_mw))
        actuals.append(ActualOutturn(start + timedelta(minutes=30), start + timedelta(hours=1), actual_mw))
        for publish_clock, extra in (("07:30", 10), ("09:10", 20), ("09:30", 30)):
            publish_time = datetime.fromisoformat(f"2026-01-01T{publish_clock}:00+00:00")
            forecasts.append(ForecastVintage(start, publish_time, actual_mw + extra))
    return Snapshot(
        schema_version=1,
        retrieved_at="2026-10-24T00:00:00Z",
        actuals=tuple(actuals),
        forecasts=tuple(forecasts),
        metadata={},
    )


def test_health_and_actual_free_decision_view(monkeypatch) -> None:
    monkeypatch.setattr(app_module, "get_snapshot", make_snapshot)
    client = TestClient(app_module.app)
    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["snapshot_loaded"] is True
    assert health.json()["actual_rows"] == 48

    response = client.get("/api/forecast/latest", params={"delivery_date": "2026-01-02", "cutoff": "09:00"})
    assert response.status_code == 200
    payload = response.json()
    assert len(payload["points"]) == 24
    assert payload["points"][0]["forecast_mw"] == 1010
    assert payload["points"][0]["publish_time_utc"] == "2026-01-01T07:30:00Z"
    assert payload["points"][0]["lead_hours"] == 16.5
    assert "actual_mw" not in payload["points"][0]


def test_accuracy_endpoints_use_hourly_actual_pairs(monkeypatch) -> None:
    monkeypatch.setattr(app_module, "get_snapshot", make_snapshot)
    client = TestClient(app_module.app)
    query = {"start": "2026-01-02", "end": "2026-01-02", "cutoff": "09:00"}

    comparison = client.get("/api/actual-vs-forecast", params=query).json()
    assert comparison["coverage"]["expected_target_hours"] == 24
    assert comparison["coverage"]["scored_target_hours"] == 24
    assert comparison["coverage"]["missing_half_hour_targets"] == 0
    assert comparison["points"][0]["actual_mw"] == 1000
    assert comparison["points"][0]["error_mw"] == 10

    summary = client.get("/api/accuracy/summary", params=query).json()
    assert summary["sample_count"] == 24
    assert summary["mae_mw"] == 10
    assert summary["bias_mw"] == 10
    assert summary["absolute_error_percentiles_mw"]["p95"] == 10
    assert summary["positive_error_buffer_mw"]["p90"] == 10
    assert summary["cutoff_timezone"] == "Europe/London"

    hours = client.get("/api/accuracy/by-hour", params=query).json()
    assert len(hours["buckets"]) == 24
    assert hours["buckets"][0]["sample_count"] == 1

    distribution = client.get("/api/accuracy/distribution", params=query).json()
    assert distribution["sample_count"] == 24
    assert distribution["signed_error_mw"] == [10] * 24


def test_cutoff_sensitivity_compares_defaults_and_custom_value(monkeypatch) -> None:
    monkeypatch.setattr(app_module, "get_snapshot", make_snapshot)
    client = TestClient(app_module.app)
    response = client.get(
        "/api/accuracy/cutoff-sensitivity",
        params={"start": "2026-01-02", "end": "2026-01-02", "cutoff": "10:00"},
    )
    assert response.status_code == 200
    payload = response.json()
    assert payload["cutoffs_compared"] == ["08:00", "09:00", "09:20", "10:00"]
    assert [item["mae_mw"] for item in payload["results"]] == [10, 10, 20, 30]


def test_lead_time_and_revision_endpoints_include_all_vintages_and_selected_marker(monkeypatch) -> None:
    monkeypatch.setattr(app_module, "get_snapshot", make_snapshot)
    client = TestClient(app_module.app)
    params = {"start": "2026-01-02", "end": "2026-01-02"}
    profile_response = client.get("/api/accuracy/by-lead-time", params=params)
    assert profile_response.status_code == 200
    profile = profile_response.json()
    assert profile["eligible_vintage_count"] == 72
    assert len(profile["buckets"]) == 48
    assert sum(item["sample_count"] for item in profile["buckets"]) == 72

    revisions_response = client.get(
        "/api/revisions", params={"delivery_date": "2026-01-02", "cutoff": "09:00"}
    )
    assert revisions_response.status_code == 200
    revisions = revisions_response.json()["vintages"]
    assert len(revisions) == 3
    selected_counts = [sum(point["selected_at_cutoff"] for point in item["points"]) for item in revisions]
    assert sorted(selected_counts) == [0, 0, 24]


def test_invalid_date_range_and_cutoff_return_422(monkeypatch) -> None:
    monkeypatch.setattr(app_module, "get_snapshot", make_snapshot)
    client = TestClient(app_module.app)
    out_of_range = client.get("/api/accuracy/summary", params={"start": "2026-01-01", "end": "2026-01-02"})
    assert out_of_range.status_code == 422
    invalid_cutoff = client.get(
        "/api/forecast/latest", params={"delivery_date": "2026-01-02", "cutoff": "25:00"}
    )
    assert invalid_cutoff.status_code == 422
