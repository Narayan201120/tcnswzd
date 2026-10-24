// Pure derived value helpers. They turn API series into the shapes views and
// charts need: daily mean errors, histogram bins, forecast level stats, and
// lead time windows. Everything here is testable without React or network.

import type { ForecastPoint, LeadBucket, ScoredPoint } from "../api/client";

export const SCOPE_START = "2026-01-02";
export const SCOPE_END = "2026-02-01";
export const DEFAULT_CUTOFF = "09:00";

export function mean(values: number[]): number {
  if (values.length === 0) {
    throw new Error("mean of an empty list is undefined");
  }
  return values.reduce((total, value) => total + value, 0) / values.length;
}

export interface DailyMeanError {
  date: string;
  meanErrorMw: number;
  count: number;
}

export function dailyMeanErrors(points: ScoredPoint[]): DailyMeanError[] {
  const groups = new Map<string, number[]>();
  for (const point of points) {
    const day = point.start_time_utc.slice(0, 10);
    const errors = groups.get(day);
    if (errors === undefined) {
      groups.set(day, [point.error_mw]);
    } else {
      errors.push(point.error_mw);
    }
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, errors]) => ({ date, meanErrorMw: mean(errors), count: errors.length }));
}

export function countPositiveDays(days: DailyMeanError[]): number {
  return days.filter((day) => day.meanErrorMw > 0).length;
}

export interface HistogramBin {
  fromMw: number;
  toMw: number;
  count: number;
}

export function histogramBins(values: number[], binWidthMw = 500): HistogramBin[] {
  if (values.length === 0) {
    return [];
  }
  const startIndex = Math.floor(Math.min(...values) / binWidthMw);
  const endIndex = Math.floor(Math.max(...values) / binWidthMw);
  const counts = new Map<number, number>();
  for (const value of values) {
    const index = Math.floor(value / binWidthMw);
    counts.set(index, (counts.get(index) ?? 0) + 1);
  }
  const bins: HistogramBin[] = [];
  for (let index = startIndex; index <= endIndex; index += 1) {
    bins.push({ fromMw: index * binWidthMw, toMw: (index + 1) * binWidthMw, count: counts.get(index) ?? 0 });
  }
  return bins;
}

export interface ForecastLevelStats {
  peakMw: number;
  peakTimeUtc: string;
  troughMw: number;
  troughTimeUtc: string;
  meanMw: number;
}

export function forecastStats(points: ForecastPoint[]): ForecastLevelStats | null {
  const scored = points.filter((point): point is ForecastPoint & { forecast_mw: number } => {
    return point.forecast_mw !== null;
  });
  if (scored.length === 0) {
    return null;
  }
  let peak = scored[0];
  let trough = scored[0];
  for (const point of scored) {
    if (point.forecast_mw > peak.forecast_mw) {
      peak = point;
    }
    if (point.forecast_mw < trough.forecast_mw) {
      trough = point;
    }
  }
  return {
    peakMw: peak.forecast_mw,
    peakTimeUtc: peak.start_time_utc,
    troughMw: trough.forecast_mw,
    troughTimeUtc: trough.start_time_utc,
    meanMw: mean(scored.map((point) => point.forecast_mw)),
  };
}

// Signed bias in MW averaged over one-hour lead buckets whose start hour falls
// in [fromHour, toHour), weighted by each bucket's sample count. Returns null
// when no bucket in the window has a bias value.
export function leadWindowBias(buckets: LeadBucket[], fromHour: number, toHour: number): number | null {
  let weightedTotal = 0;
  let sampleTotal = 0;
  for (const bucket of buckets) {
    if (bucket.lead_start_hours < fromHour || bucket.lead_start_hours >= toHour) {
      continue;
    }
    if (bucket.bias_mw === null) {
      continue;
    }
    weightedTotal += bucket.bias_mw * bucket.sample_count;
    sampleTotal += bucket.sample_count;
  }
  if (sampleTotal === 0) {
    return null;
  }
  return weightedTotal / sampleTotal;
}

// The 31 delivery days covered by the January 2026 snapshot: decision date
// D-1 in January 2026, so delivery runs Jan 2 through Feb 1 inclusive.
export function deliveryDates2026(): string[] {
  const dates: string[] = [];
  const start = Date.UTC(2026, 0, 2);
  const end = Date.UTC(2026, 1, 1);
  const dayMs = 24 * 60 * 60 * 1000;
  for (let instant = start; instant <= end; instant += dayMs) {
    dates.push(new Date(instant).toISOString().slice(0, 10));
  }
  return dates;
}
