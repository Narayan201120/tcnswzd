from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import logging
import math
from pathlib import Path
import sys
import time
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from backend.domain import finite_generation, iso_utc, parse_timestamp

API_BASE = "https://data.elexon.co.uk/bmrs/api/v1"
FORECAST_CONTEXT_START = datetime(2025, 12, 31, tzinfo=timezone.utc)
PUBLISH_START = datetime(2026, 1, 1, tzinfo=timezone.utc)
FIRST_DELIVERY_END = datetime(2026, 1, 3, tzinfo=timezone.utc)
PUBLISH_END = datetime(2026, 2, 1, tzinfo=timezone.utc)
TARGET_START = datetime(2026, 1, 2, tzinfo=timezone.utc)
TARGET_END = datetime(2026, 2, 2, tzinfo=timezone.utc)
ACTUAL_PUBLISH_START = datetime(2026, 1, 2, tzinfo=timezone.utc)
ACTUAL_PUBLISH_END = datetime(2026, 2, 2, 3, tzinfo=timezone.utc)
DEFAULT_OUTPUT = Path(__file__).parent / "data" / "january_2026.json"
LOGGER = logging.getLogger("windlens.ingest")


def fetch_stream(path: str, params: dict[str, str], retries: int = 4) -> list[dict[str, Any]]:
    url = f"{API_BASE}/{path}?{urlencode(params)}"
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "WindLens pilot ingestion/1.0"})
    for attempt in range(retries + 1):
        try:
            with urlopen(request, timeout=45) as response:
                payload = json.loads(response.read().decode("utf-8"))
            if isinstance(payload, list):
                return payload
            if isinstance(payload, dict) and isinstance(payload.get("data"), list):
                return payload["data"]
            raise ValueError(f"unexpected JSON response shape from {path}")
        except HTTPError as error:
            retryable = error.code == 429 or 500 <= error.code < 600
            if not retryable or attempt == retries:
                raise RuntimeError(f"Elexon request failed with HTTP {error.code}: {path}") from error
            retry_after = error.headers.get("Retry-After")
            try:
                delay = min(30.0, max(1.0, float(retry_after))) if retry_after else min(30.0, 2.0**attempt)
            except ValueError:
                delay = min(30.0, 2.0**attempt)
            LOGGER.warning("HTTP %s for %s, retry %s/%s in %.1f seconds", error.code, path, attempt + 1, retries, delay)
            time.sleep(delay)
        except (URLError, TimeoutError) as error:
            if attempt == retries:
                raise RuntimeError(f"Elexon request failed after retries: {path}: {error}") from error
            delay = min(30.0, 2.0**attempt)
            LOGGER.warning("Network error for %s, retry %s/%s in %.1f seconds", path, attempt + 1, retries, delay)
            time.sleep(delay)
    raise RuntimeError("request retry loop ended unexpectedly")


def normalize_generation_row(row: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(row, dict):
        raise ValueError("stream row must be an object")
    return {
        "dataset": str(row.get("dataset", "")),
        "publishTime": iso_utc(parse_timestamp(row["publishTime"])),
        "startTime": iso_utc(parse_timestamp(row["startTime"])),
        "generation": finite_generation(row["generation"]),
    }


def within(value: datetime, lower: datetime, upper: datetime) -> bool:
    return lower <= value < upper


def unique_forecasts(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    duplicates = 0
    for row in rows:
        key = (row["startTime"], row["publishTime"])
        current = unique.get(key)
        if current is None:
            unique[key] = row
        elif current["generation"] != row["generation"]:
            raise ValueError(f"conflicting WINDFOR duplicate for {key}")
        else:
            duplicates += 1
    return sorted(unique.values(), key=lambda row: (row["startTime"], row["publishTime"])), duplicates


def unique_actual_rows(rows: list[dict[str, Any]]) -> tuple[list[dict[str, Any]], int]:
    unique: dict[tuple[str, str], dict[str, Any]] = {}
    duplicates = 0
    for row in rows:
        key = (row["startTime"], row["publishTime"])
        current = unique.get(key)
        if current is None:
            unique[key] = row
        elif current["generation"] != row["generation"]:
            raise ValueError(f"conflicting FUELHH duplicate for {key}")
        else:
            duplicates += 1
    return sorted(unique.values(), key=lambda row: (row["startTime"], row["publishTime"])), duplicates


def build_snapshot(delay_seconds: float = 1.0) -> dict[str, Any]:
    if delay_seconds < 0 or not math.isfinite(delay_seconds):
        raise ValueError("request delay must be a finite nonnegative number")
    forecast_raw = fetch_stream(
        "datasets/WINDFOR/stream",
        {
            "publishDateTimeFrom": iso_utc(FORECAST_CONTEXT_START),
            "publishDateTimeTo": iso_utc(PUBLISH_END),
        },
    )
    LOGGER.info("Fetched %s WINDFOR rows", len(forecast_raw))
    if delay_seconds:
        time.sleep(delay_seconds)
    actual_raw = fetch_stream(
        "datasets/FUELHH/stream",
        {
            "publishDateTimeFrom": iso_utc(ACTUAL_PUBLISH_START),
            "publishDateTimeTo": iso_utc(ACTUAL_PUBLISH_END),
            "fuelType": "WIND",
        },
    )
    LOGGER.info("Fetched %s FUELHH rows", len(actual_raw))

    forecasts = []
    for raw in forecast_raw:
        row = normalize_generation_row(raw)
        published = parse_timestamp(row["publishTime"])
        target = parse_timestamp(row["startTime"])
        january_vintage = within(published, PUBLISH_START, PUBLISH_END)
        first_day_context = within(published, FORECAST_CONTEXT_START, PUBLISH_START) and target < FIRST_DELIVERY_END
        if (january_vintage or first_day_context) and within(target, TARGET_START, TARGET_END):
            forecasts.append(row)
    actuals = []
    for raw in actual_raw:
        if raw.get("fuelType") != "WIND":
            continue
        row = normalize_generation_row(raw)
        published = parse_timestamp(row["publishTime"])
        target = parse_timestamp(row["startTime"])
        if within(published, ACTUAL_PUBLISH_START, ACTUAL_PUBLISH_END) and within(target, TARGET_START, TARGET_END):
            row["fuelType"] = "WIND"
            actuals.append(row)

    forecasts, forecast_duplicates = unique_forecasts(forecasts)
    actuals, actual_duplicates = unique_actual_rows(actuals)
    LOGGER.info(
        "Normalized %s forecast vintages and %s actual rows; removed %s exact forecast duplicates and %s exact actual duplicates",
        len(forecasts), len(actuals), forecast_duplicates, actual_duplicates,
    )
    return {
        "schema_version": 1,
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "metadata": {
            "source": "Elexon BMRS Insights API",
            "delivery_start_utc": iso_utc(TARGET_START),
            "delivery_end_exclusive_utc": iso_utc(TARGET_END),
            "forecast_publish_start_utc": iso_utc(PUBLISH_START),
            "forecast_context_publish_start_utc": iso_utc(FORECAST_CONTEXT_START),
            "forecast_publish_end_exclusive_utc": iso_utc(PUBLISH_END),
            "actual_publish_start_utc": iso_utc(ACTUAL_PUBLISH_START),
            "actual_publish_end_utc": iso_utc(ACTUAL_PUBLISH_END),
            "request_delay_seconds": delay_seconds,
            "forecast_exact_duplicates_removed": forecast_duplicates,
            "actual_exact_duplicates_removed": actual_duplicates,
            "actual_grain": "half-hourly",
            "forecast_grain": "hourly",
        },
        "actuals": actuals,
        "forecasts": forecasts,
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fetch and normalize the January 2026 Elexon wind snapshot")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--delay-seconds", type=float, default=1.0, help="polite delay between Elexon requests")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    try:
        snapshot = build_snapshot(args.delay_seconds)
        args.output.parent.mkdir(parents=True, exist_ok=True)
        temporary = args.output.with_suffix(args.output.suffix + ".tmp")
        with temporary.open("w", encoding="utf-8", newline="\n") as handle:
            json.dump(snapshot, handle, ensure_ascii=True, separators=(",", ":"))
            handle.write("\n")
        temporary.replace(args.output)
        LOGGER.info(
            "Wrote %s (%s actual rows, %s forecast vintages)",
            args.output, len(snapshot["actuals"]), len(snapshot["forecasts"]),
        )
        return 0
    except Exception:
        LOGGER.exception("Snapshot ingestion failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
