from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path
from typing import Any

from backend.domain import ActualOutturn, ForecastVintage

DATA_PATH = Path(__file__).parent / "data" / "january_2026.json"


@dataclass(frozen=True, slots=True)
class Snapshot:
    schema_version: int
    retrieved_at: str
    actuals: tuple[ActualOutturn, ...]
    forecasts: tuple[ForecastVintage, ...]
    metadata: dict[str, Any]


def load_snapshot(path: Path = DATA_PATH) -> Snapshot:
    if not path.exists():
        raise FileNotFoundError(f"snapshot not found: {path}")
    with path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)
    if payload.get("schema_version") != 1:
        raise ValueError("unsupported snapshot schema_version")
    actual_records = payload.get("actuals")
    forecast_records = payload.get("forecasts")
    if not isinstance(actual_records, list) or not isinstance(forecast_records, list):
        raise ValueError("snapshot must contain actuals and forecasts arrays")
    actuals = tuple(ActualOutturn.from_record(row) for row in actual_records)
    forecasts = tuple(ForecastVintage.from_record(row) for row in forecast_records)
    return Snapshot(
        schema_version=1,
        retrieved_at=str(payload.get("retrieved_at", "unknown")),
        actuals=actuals,
        forecasts=forecasts,
        metadata=payload.get("metadata", {}),
    )


@lru_cache(maxsize=1)
def get_snapshot() -> Snapshot:
    return load_snapshot()
