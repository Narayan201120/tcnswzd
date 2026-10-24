// Plain language buying notes built from live API values only. No numbers are
// hard coded here; every figure in a sentence comes from a fixture or a real
// response, so the wording stays honest when the data changes.

import type { AccuracySummaryResponse, LeadBucket } from "../api/client";
import { leadWindowBias } from "./derive";
import { formatGw, formatPct } from "./format";

export interface BuyingNotes {
  sentences: string[];
  limitations: string[];
  wordCount: number;
}

function countWords(sentences: string[]): number {
  return sentences.join(" ").split(/\s+/).filter((word) => word.length > 0).length;
}

export function buildBuyingNotes(
  summary: AccuracySummaryResponse,
  leadBuckets: LeadBucket[],
): BuyingNotes {
  const sentences: string[] = [];

  const bias = summary.bias_mw;
  const relativeBias = summary.relative_bias_pct;
  if (bias !== null && relativeBias !== null) {
    const direction = bias >= 0 ? "above" : "below";
    sentences.push(
      `Across the ${summary.sample_count} scored hours in this period, the published forecast averaged ${formatGw(Math.abs(bias))} ${direction} reported wind output, ${formatPct(Math.abs(relativeBias))} of mean actual generation.`,
    );
  }

  const p90 = summary.positive_error_buffer_mw.p90;
  const p95 = summary.positive_error_buffer_mw.p95;
  const p90Pct = summary.positive_error_buffer_pct_forecast.p90;
  const p95Pct = summary.positive_error_buffer_pct_forecast.p95;
  if (p90 !== null && p95 !== null) {
    const p90Part =
      p90Pct === null ? formatGw(p90) : `${formatGw(p90)} (${formatPct(p90Pct)} of forecast)`;
    const p95Part =
      p95Pct === null ? formatGw(p95) : `${formatGw(p95)} (${formatPct(p95Pct)} of forecast)`;
    sentences.push(
      `To absorb the risk that the forecast runs high, the historical P90 and P95 overforecast errors were ${p90Part} and ${p95Part}.`,
    );
  }

  const shortLead = leadWindowBias(leadBuckets, 0, 4);
  const longLead = leadWindowBias(leadBuckets, 44, 48);
  if (shortLead !== null && longLead !== null) {
    if (Math.abs(longLead) > Math.abs(shortLead) * 1.05) {
      sentences.push(
        `The gap is already present in forecasts used 0 to 4 hours ahead (${formatGw(Math.abs(shortLead))}) and widens to ${formatGw(Math.abs(longLead))} at 44 to 48 hours, so fresher forecasts are modestly more accurate.`,
      );
    } else {
      sentences.push(
        `The gap stays in a similar range across lead times (${formatGw(Math.abs(shortLead))} at 0 to 4 hours, ${formatGw(Math.abs(longLead))} at 44 to 48 hours).`,
      );
    }
  }

  sentences.push(
    "Treat these figures as uncertainty references for day-ahead buying, not as procurement instructions; they describe January 2026 in sample and do not predict future errors.",
  );

  const limitations = [
    "One month of data: decisions made in January 2026, so every result is in sample.",
    "The datasets show reported output only; there is no curtailment or unconstrained availability data.",
    "The WINDFOR hour interval boundary is unconfirmed with a data owner.",
    "The 09:00 Europe/London cutoff is an assumption based on auction gate times.",
  ];

  return { sentences, limitations, wordCount: countWords(sentences) };
}
