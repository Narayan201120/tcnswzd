// The single typed client for the WindLens API. Every network call in the app
// goes through this module; components never call fetch directly. The base
// path comes from one env var, VITE_API_BASE_PATH. It defaults to "/api",
// which the Vite dev server proxies to the backend on port 8000 and which
// production serves on the same origin, so no CORS is needed anywhere.

const API_BASE_PATH: string = import.meta.env.VITE_API_BASE_PATH ?? "/api";

export class ApiError extends Error {
  readonly status: number;

  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
  }
}

function detailText(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail: unknown = body.detail;
    if (typeof detail === "string" && detail.length > 0) {
      return detail;
    }
    if (detail !== undefined) {
      return JSON.stringify(detail);
    }
  }
  return `Request failed with status ${status}`;
}

async function request<T>(url: string, params: Record<string, string>): Promise<T> {
  const query = new URLSearchParams(params).toString();
  const fullUrl = query.length > 0 ? `${url}?${query}` : url;
  let response: Response;
  try {
    response = await fetch(fullUrl);
  } catch {
    throw new ApiError(0, "Could not reach the WindLens API. Check that it is running, then retry.");
  }
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiError(response.status, detailText(body, response.status));
  }
  return (await response.json()) as T;
}

function apiRequest<T>(route: string, params: Record<string, string> = {}): Promise<T> {
  return request<T>(`${API_BASE_PATH}${route}`, params);
}

export interface SignedPercentiles {
  p5: number | null;
  p10: number | null;
  p50: number | null;
  p90: number | null;
  p95: number | null;
}

export interface ErrorPercentiles {
  p50: number | null;
  p90: number | null;
  p95: number | null;
}

export interface BufferPercentiles {
  p90: number | null;
  p95: number | null;
}

export interface Coverage {
  expected_target_hours: number;
  scored_target_hours: number;
  missing_half_hour_targets: number;
  missing_forecast_targets: number;
  corrected_actual_starts: number;
}

export interface HealthResponse {
  status: string;
  snapshot_loaded: boolean;
  actual_rows: number;
  forecast_vintages: number;
  schema_version: number | null;
}

export interface ForecastPoint {
  start_time_utc: string;
  forecast_mw: number | null;
  publish_time_utc: string | null;
  lead_hours: number | null;
}

export interface ForecastResponse {
  delivery_date: string;
  cutoff_local: string;
  cutoff_utc: string;
  points: ForecastPoint[];
  missing_forecast_hours: number;
}

export interface ScoredPoint {
  start_time_utc: string;
  forecast_mw: number;
  actual_mw: number;
  error_mw: number;
  absolute_error_mw: number;
  publish_time_utc: string;
  lead_hours: number;
}

export interface ComparisonResponse {
  start_date: string;
  end_date: string;
  cutoff_local: string;
  cutoff_timezone: string;
  coverage: Coverage;
  points: ScoredPoint[];
}

export interface AccuracySummaryResponse {
  sample_count: number;
  mean_actual_mw: number | null;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  nmae_pct: number | null;
  relative_bias_pct: number | null;
  mape_pct: number | null;
  mape_sample_count: number;
  mape_excluded_zero_actual_count: number;
  signed_error_percentiles_mw: SignedPercentiles;
  absolute_error_percentiles_mw: ErrorPercentiles;
  positive_error_buffer_mw: BufferPercentiles;
  positive_error_buffer_pct_forecast: BufferPercentiles;
  positive_error_buffer_pct_sample_count: number;
  start_date: string;
  end_date: string;
  cutoff_local: string;
  cutoff_timezone: string;
  coverage: Coverage;
}

export interface HourBucket {
  hour_local: number;
  sample_count: number;
  mae_mw: number | null;
  bias_mw: number | null;
}

export interface HourProfileResponse {
  start_date: string;
  end_date: string;
  cutoff_local: string;
  cutoff_timezone: string;
  buckets: HourBucket[];
}

export interface LeadBucket {
  lead_start_hours: number;
  lead_end_hours: number;
  sample_count: number;
  mae_mw: number | null;
  bias_mw: number | null;
}

export interface LeadTimeResponse {
  start_date: string;
  end_date: string;
  eligible_vintage_count: number;
  excluded_out_of_range_count: number;
  excluded_missing_actual_count: number;
  buckets: LeadBucket[];
}

export interface DistributionResponse {
  start_date: string;
  end_date: string;
  cutoff_local: string;
  cutoff_timezone: string;
  sample_count: number;
  signed_error_mw: number[];
  absolute_error_mw: number[];
}

export interface SensitivityPoint {
  cutoff_local: string;
  sample_count: number;
  mae_mw: number | null;
  rmse_mw: number | null;
  bias_mw: number | null;
  p95_absolute_error_mw: number | null;
}

export interface CutoffSensitivityResponse {
  start_date: string;
  end_date: string;
  cutoff_timezone: string;
  cutoffs_compared: string[];
  results: SensitivityPoint[];
}

export interface RevisionPoint {
  start_time_utc: string;
  generation_mw: number;
  selected_at_cutoff: boolean;
}

export interface RevisionVintage {
  publish_time_utc: string;
  points: RevisionPoint[];
}

export interface RevisionResponse {
  delivery_date: string;
  cutoff_local: string;
  cutoff_utc: string;
  vintages: RevisionVintage[];
}

export const api = {
  health: (): Promise<HealthResponse> => request<HealthResponse>("/health", {}),
  latestForecast: (deliveryDate: string, cutoff: string): Promise<ForecastResponse> =>
    apiRequest("/forecast/latest", { delivery_date: deliveryDate, cutoff }),
  actualVsForecast: (start: string, end: string, cutoff: string): Promise<ComparisonResponse> =>
    apiRequest("/actual-vs-forecast", { start, end, cutoff }),
  accuracySummary: (start: string, end: string, cutoff: string): Promise<AccuracySummaryResponse> =>
    apiRequest("/accuracy/summary", { start, end, cutoff }),
  accuracyByHour: (start: string, end: string, cutoff: string): Promise<HourProfileResponse> =>
    apiRequest("/accuracy/by-hour", { start, end, cutoff }),
  accuracyByLeadTime: (start: string, end: string): Promise<LeadTimeResponse> =>
    apiRequest("/accuracy/by-lead-time", { start, end }),
  accuracyDistribution: (start: string, end: string, cutoff: string): Promise<DistributionResponse> =>
    apiRequest("/accuracy/distribution", { start, end, cutoff }),
  cutoffSensitivity: (
    start: string,
    end: string,
    cutoff?: string,
  ): Promise<CutoffSensitivityResponse> =>
    apiRequest(
      "/accuracy/cutoff-sensitivity",
      cutoff === undefined ? { start, end } : { start, end, cutoff },
    ),
  revisions: (deliveryDate: string, cutoff: string): Promise<RevisionResponse> =>
    apiRequest("/revisions", { delivery_date: deliveryDate, cutoff }),
};
