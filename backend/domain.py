from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
import math

UTC = timezone.utc


def parse_timestamp(value: str | datetime) -> datetime:
    if isinstance(value, datetime):
        parsed = value
    elif isinstance(value, str):
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    else:
        raise ValueError("timestamp must be an ISO string or datetime")
    if parsed.tzinfo is None or parsed.utcoffset() is None:
        raise ValueError("timestamp must include a timezone")
    return parsed.astimezone(UTC)


def iso_utc(value: datetime) -> str:
    return value.astimezone(UTC).isoformat(timespec="seconds").replace("+00:00", "Z")


def finite_generation(value: object) -> float:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValueError("generation must be a number")
    result = float(value)
    if not math.isfinite(result):
        raise ValueError("generation must be finite")
    return result


@dataclass(frozen=True, slots=True)
class ForecastVintage:
    start_time: datetime
    publish_time: datetime
    generation_mw: float

    @classmethod
    def from_record(cls, row: dict[str, object]) -> ForecastVintage:
        return cls(
            start_time=parse_timestamp(str(row["startTime"])),
            publish_time=parse_timestamp(str(row["publishTime"])),
            generation_mw=finite_generation(row["generation"]),
        )


@dataclass(frozen=True, slots=True)
class ActualOutturn:
    start_time: datetime
    publish_time: datetime
    generation_mw: float

    @classmethod
    def from_record(cls, row: dict[str, object]) -> ActualOutturn:
        return cls(
            start_time=parse_timestamp(str(row["startTime"])),
            publish_time=parse_timestamp(str(row["publishTime"])),
            generation_mw=finite_generation(row["generation"]),
        )


@dataclass(frozen=True, slots=True)
class ScoredPoint:
    start_time: datetime
    forecast_mw: float
    actual_mw: float
    publish_time: datetime
    lead_hours: float

    @property
    def error_mw(self) -> float:
        return self.forecast_mw - self.actual_mw

    @property
    def absolute_error_mw(self) -> float:
        return abs(self.error_mw)
