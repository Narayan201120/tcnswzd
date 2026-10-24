import type { AccuracySummaryResponse, LeadBucket } from "../api/client";
import { buildBuyingNotes } from "../lib/notes";

function leadBucket(startHour: number, biasMw: number): LeadBucket {
  return {
    lead_start_hours: startHour,
    lead_end_hours: startHour + 1,
    sample_count: 243,
    mae_mw: 1800,
    bias_mw: biasMw,
  };
}

function wideningBuckets(): LeadBucket[] {
  return Array.from({ length: 48 }, (_, index) => leadBucket(index, 1500 + index * 10));
}

function flatBuckets(): LeadBucket[] {
  return Array.from({ length: 48 }, (_, index) => leadBucket(index, 1500));
}

function summaryFixture(overrides: Partial<AccuracySummaryResponse> = {}): AccuracySummaryResponse {
  return {
    sample_count: 744,
    mean_actual_mw: 11283.56,
    mae_mw: 2038.91,
    rmse_mw: 2504.76,
    bias_mw: 1747.89,
    nmae_pct: 18.07,
    relative_bias_pct: 15.49,
    mape_pct: 22.04,
    mape_sample_count: 744,
    mape_excluded_zero_actual_count: 0,
    signed_error_percentiles_mw: { p5: -1151.4, p10: -549.3, p50: 1592, p90: 4097.9, p95: 5283.35 },
    absolute_error_percentiles_mw: { p50: 1671, p90: 4097.9, p95: 5283.35 },
    positive_error_buffer_mw: { p90: 4097.9, p95: 5283.35 },
    positive_error_buffer_pct_forecast: { p90: 29.78, p95: 41.9 },
    positive_error_buffer_pct_sample_count: 744,
    start_date: "2026-01-02",
    end_date: "2026-02-01",
    cutoff_local: "09:00",
    cutoff_timezone: "Europe/London",
    coverage: {
      expected_target_hours: 744,
      scored_target_hours: 744,
      missing_half_hour_targets: 0,
      missing_forecast_targets: 0,
      corrected_actual_starts: 0,
    },
    ...overrides,
  };
}

describe("buildBuyingNotes", () => {
  it("describes a positive bias from live values", () => {
    const notes = buildBuyingNotes(summaryFixture(), wideningBuckets());
    expect(notes.sentences[0]).toContain("1.7 GW");
    expect(notes.sentences[0]).toContain("above");
    expect(notes.sentences[0]).toContain("15.5%");
    expect(notes.sentences[1]).toContain("4.1 GW");
    expect(notes.sentences[1]).toContain("5.3 GW");
    expect(notes.sentences[1]).toContain("29.8%");
    expect(notes.sentences[1]).toContain("41.9%");
    expect(notes.sentences[2]).toContain("widens");
    expect(notes.sentences[2]).toContain("1.5 GW");
    expect(notes.sentences[2]).toContain("2.0 GW");
  });

  it("flips the wording for a negative bias case", () => {
    const notes = buildBuyingNotes(
      summaryFixture({
        bias_mw: -1234.5,
        relative_bias_pct: -10.9,
        positive_error_buffer_mw: { p90: 500, p95: 900 },
        positive_error_buffer_pct_forecast: { p90: 4.4, p95: 8.1 },
      }),
      wideningBuckets(),
    );
    expect(notes.sentences[0]).toContain("below");
    expect(notes.sentences[0]).not.toContain("above");
    expect(notes.sentences[0]).toContain("1.2 GW");
    expect(notes.sentences[0]).toContain("10.9%");
    expect(notes.sentences[1]).toContain("0.5 GW");
    expect(notes.sentences[1]).toContain("0.9 GW");
  });

  it("uses the flat lead time wording when the gap does not widen", () => {
    const notes = buildBuyingNotes(summaryFixture(), flatBuckets());
    expect(notes.sentences[2]).toContain("similar range");
    expect(notes.sentences[2]).not.toContain("widens");
  });

  it("stays under 150 words and lists the four limitations", () => {
    const notes = buildBuyingNotes(summaryFixture(), wideningBuckets());
    expect(notes.wordCount).toBeLessThan(150);
    expect(notes.limitations).toHaveLength(4);
    expect(notes.limitations.some((item) => item.includes("curtailment"))).toBe(true);
    expect(notes.limitations.some((item) => item.includes("09:00"))).toBe(true);
  });
});
