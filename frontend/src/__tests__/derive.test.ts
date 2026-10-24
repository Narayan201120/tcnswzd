import type { ForecastPoint, LeadBucket, ScoredPoint } from "../api/client";
import {
  countPositiveDays,
  dailyMeanErrors,
  deliveryDates2026,
  forecastStats,
  histogramBins,
  leadWindowBias,
  mean,
} from "../lib/derive";

function scoredPoint(startUtc: string, errorMw: number): ScoredPoint {
  return {
    start_time_utc: startUtc,
    forecast_mw: 15000 + errorMw,
    actual_mw: 15000,
    error_mw: errorMw,
    absolute_error_mw: Math.abs(errorMw),
    publish_time_utc: "2026-01-01T09:00:00Z",
    lead_hours: 16.5,
  };
}

function leadBucket(startHour: number, biasMw: number, samples: number): LeadBucket {
  return {
    lead_start_hours: startHour,
    lead_end_hours: startHour + 1,
    sample_count: samples,
    mae_mw: 1000,
    bias_mw: biasMw,
  };
}

describe("dailyMeanErrors", () => {
  it("groups errors by UTC day and averages them", () => {
    const points = [
      scoredPoint("2026-01-02T00:00:00Z", 100),
      scoredPoint("2026-01-02T01:00:00Z", -100),
      scoredPoint("2026-01-03T00:00:00Z", 50),
    ];
    const days = dailyMeanErrors(points);
    expect(days).toHaveLength(2);
    expect(days[0].date).toBe("2026-01-02");
    expect(days[0].meanErrorMw).toBeCloseTo(0, 6);
    expect(days[0].count).toBe(2);
    expect(days[1].meanErrorMw).toBeCloseTo(50, 6);
  });

  it("counts positive days", () => {
    const days = dailyMeanErrors([
      scoredPoint("2026-01-02T00:00:00Z", -10),
      scoredPoint("2026-01-03T00:00:00Z", 10),
      scoredPoint("2026-01-04T00:00:00Z", 0),
    ]);
    expect(countPositiveDays(days)).toBe(1);
  });
});

describe("histogramBins", () => {
  it("bins values into 500 MW buckets aligned to multiples of the width", () => {
    const bins = histogramBins([-100, 100, 600]);
    expect(bins).toEqual([
      { fromMw: -500, toMw: 0, count: 1 },
      { fromMw: 0, toMw: 500, count: 1 },
      { fromMw: 500, toMw: 1000, count: 1 },
    ]);
  });

  it("keeps empty bins between filled ones", () => {
    const bins = histogramBins([-100, 600]);
    expect(bins).toHaveLength(3);
    expect(bins[1]).toEqual({ fromMw: 0, toMw: 500, count: 0 });
  });

  it("returns no bins for an empty list", () => {
    expect(histogramBins([])).toEqual([]);
  });
});

describe("leadWindowBias", () => {
  it("returns the sample weighted mean bias over the window", () => {
    const buckets = [
      leadBucket(0, 100, 2),
      leadBucket(1, 200, 1),
      leadBucket(4, 999, 5),
    ];
    expect(leadWindowBias(buckets, 0, 4)).toBeCloseTo(133.3333, 3);
    expect(leadWindowBias(buckets, 4, 48)).toBeCloseTo(999, 6);
  });

  it("returns null when the window has no scored buckets", () => {
    expect(leadWindowBias([leadBucket(0, 100, 2)], 10, 12)).toBeNull();
  });
});

describe("forecastStats", () => {
  it("finds peak, trough, and mean over non missing points", () => {
    const points: ForecastPoint[] = [
      { start_time_utc: "2026-01-02T00:00:00Z", forecast_mw: 1000, publish_time_utc: "2026-01-01T07:30:00Z", lead_hours: 16.5 },
      { start_time_utc: "2026-01-02T01:00:00Z", forecast_mw: 2000, publish_time_utc: "2026-01-01T07:30:00Z", lead_hours: 17.5 },
      { start_time_utc: "2026-01-02T02:00:00Z", forecast_mw: null, publish_time_utc: null, lead_hours: null },
      { start_time_utc: "2026-01-02T03:00:00Z", forecast_mw: 500, publish_time_utc: "2026-01-01T07:30:00Z", lead_hours: 19.5 },
    ];
    const stats = forecastStats(points);
    expect(stats).not.toBeNull();
    expect(stats?.peakMw).toBe(2000);
    expect(stats?.peakTimeUtc).toBe("2026-01-02T01:00:00Z");
    expect(stats?.troughMw).toBe(500);
    expect(stats?.troughTimeUtc).toBe("2026-01-02T03:00:00Z");
    expect(stats?.meanMw).toBeCloseTo(1166.6667, 3);
  });

  it("returns null when every point is missing", () => {
    const points: ForecastPoint[] = [
      { start_time_utc: "2026-01-02T00:00:00Z", forecast_mw: null, publish_time_utc: null, lead_hours: null },
    ];
    expect(forecastStats(points)).toBeNull();
  });
});

describe("deliveryDates2026", () => {
  it("lists the 31 delivery days from Jan 2 through Feb 1", () => {
    const dates = deliveryDates2026();
    expect(dates).toHaveLength(31);
    expect(dates[0]).toBe("2026-01-02");
    expect(dates[30]).toBe("2026-02-01");
  });
});

describe("mean", () => {
  it("throws on an empty list instead of returning a silent NaN", () => {
    expect(() => mean([])).toThrow();
  });
});
