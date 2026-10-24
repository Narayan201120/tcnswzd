import { useCallback, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  api,
  type ScoredPoint,
} from "../api/client";
import { ChartCard } from "../components/ChartCard";
import { ChartTooltip } from "../components/ChartTooltip";
import { CutoffControl } from "../components/CutoffControl";
import { DataTable } from "../components/DataTable";
import { MetricCard } from "../components/MetricCard";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/States";
import { useApi, type ApiQuery } from "../hooks/useApi";
import {
  DEFAULT_CUTOFF,
  SCOPE_END,
  SCOPE_START,
  countPositiveDays,
  dailyMeanErrors,
  histogramBins,
} from "../lib/derive";
import {
  formatGw,
  formatLondonDate,
  formatLondonDayClock,
  formatMw,
  formatPct,
  formatSignedMw,
  formatSignedPct,
} from "../lib/format";

function QuerySection<T>({
  query,
  label,
  render,
}: {
  query: ApiQuery<T>;
  label: string;
  render: (data: T) => ReactNode;
}) {
  if (query.loading) {
    return <LoadingSkeleton label={label} />;
  }
  if (query.error) {
    return <ErrorState error={query.error} onRetry={query.retry} />;
  }
  if (query.data === null) {
    return <EmptyState title="No data" body={`The API returned no ${label}.`} />;
  }
  return <>{render(query.data)}</>;
}

function errorSummaryRows(points: ScoredPoint[]): (string | number)[][] {
  if (points.length === 0) {
    return [["Hours scored", "0"]];
  }
  const errors = points.map((point) => point.error_mw);
  const total = errors.reduce((sum, value) => sum + value, 0);
  return [
    ["Hours scored", String(errors.length)],
    ["First hour UTC", points[0].start_time_utc.replace("T", " ").slice(0, 16)],
    ["Last hour UTC", points[points.length - 1].start_time_utc.replace("T", " ").slice(0, 16)],
    ["Mean error", formatSignedMw(total / errors.length)],
    ["Minimum error", formatSignedMw(Math.min(...errors))],
    ["Maximum error", formatSignedMw(Math.max(...errors))],
  ];
}

const MARGIN = { top: 8, right: 14, bottom: 4, left: 0 };
const TOOLTIP_CURSOR_LINE = { stroke: "#8fa3ad", strokeDasharray: "3 3" };
const TOOLTIP_CURSOR_AREA = { fill: "rgba(128, 140, 150, 0.12)" };

export function AccuracyView() {
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);
  const summary = useApi(
    useCallback(() => api.accuracySummary(SCOPE_START, SCOPE_END, cutoff), [cutoff]),
  );
  const comparison = useApi(
    useCallback(() => api.actualVsForecast(SCOPE_START, SCOPE_END, cutoff), [cutoff]),
  );
  const byHour = useApi(
    useCallback(() => api.accuracyByHour(SCOPE_START, SCOPE_END, cutoff), [cutoff]),
  );
  const byLead = useApi(useCallback(() => api.accuracyByLeadTime(SCOPE_START, SCOPE_END), []));
  const distribution = useApi(
    useCallback(() => api.accuracyDistribution(SCOPE_START, SCOPE_END, cutoff), [cutoff]),
  );
  const sensitivity = useApi(
    useCallback(() => api.cutoffSensitivity(SCOPE_START, SCOPE_END, cutoff), [cutoff]),
  );

  const series = (comparison.data?.points ?? []).map((point) => ({
    timeLabel: formatLondonDayClock(point.start_time_utc),
    utc: point.start_time_utc,
    actualMw: point.actual_mw,
    forecastMw: point.forecast_mw,
    errorMw: point.error_mw,
    publishUtc: point.publish_time_utc,
    leadHours: point.lead_hours,
  }));
  const daily = dailyMeanErrors(comparison.data?.points ?? []);
  const dailyData = daily.map((day) => ({
    dayLabel: formatLondonDate(day.date),
    meanErrorMw: day.meanErrorMw,
  }));
  const positiveDays = countPositiveDays(daily);
  const hourData = (byHour.data?.buckets ?? []).map((bucket) => ({
    hourLabel: `${String(bucket.hour_local).padStart(2, "0")}:00`,
    sampleCount: bucket.sample_count,
    maeMw: bucket.mae_mw,
    biasMw: bucket.bias_mw,
  }));
  const leadData = (byLead.data?.buckets ?? []).map((bucket) => ({
    leadLabel: String(bucket.lead_start_hours),
    sampleCount: bucket.sample_count,
    maeMw: bucket.mae_mw,
    biasMw: bucket.bias_mw,
  }));
  const histData = histogramBins(distribution.data?.signed_error_mw ?? []).map((bin) => ({
    binLabel: `${bin.fromMw} to ${bin.toMw}`,
    count: bin.count,
    negative: bin.fromMw < 0,
  }));

  const s = summary.data;
  const bufferP90 = s?.positive_error_buffer_mw.p90;
  const bufferP95 = s?.positive_error_buffer_mw.p95;
  const bufferP90Pct = s?.positive_error_buffer_pct_forecast.p90;
  const bufferP95Pct = s?.positive_error_buffer_pct_forecast.p95;

  return (
    <div className="view">
      <div className="controls-row">
        <CutoffControl value={cutoff} onChange={setCutoff} />
      </div>

      <div className="metric-row">
        <MetricCard
          label="MAE"
          value={s?.mae_mw != null ? formatMw(s.mae_mw) : "no data"}
          note="mean absolute error"
        />
        <MetricCard
          label="RMSE"
          value={s?.rmse_mw != null ? formatMw(s.rmse_mw) : "no data"}
          note="root mean square error"
        />
        <MetricCard
          label="Bias"
          value={s?.bias_mw != null ? formatSignedMw(s.bias_mw) : "no data"}
          note="forecast minus actual"
        />
        <MetricCard
          label="nMAE"
          value={s?.nmae_pct != null ? formatPct(s.nmae_pct) : "no data"}
          note="MAE over mean actual"
        />
        <MetricCard
          label="Relative bias"
          value={s?.relative_bias_pct != null ? formatSignedPct(s.relative_bias_pct) : "no data"}
          note="bias over mean actual"
        />
        <MetricCard
          label="P90 overforecast"
          value={bufferP90 != null ? formatGw(bufferP90) : "no data"}
          note={bufferP90Pct != null ? `${formatPct(bufferP90Pct)} of forecast` : undefined}
        />
        <MetricCard
          label="P95 overforecast"
          value={bufferP95 != null ? formatGw(bufferP95) : "no data"}
          note={bufferP95Pct != null ? `${formatPct(bufferP95Pct)} of forecast` : undefined}
        />
      </div>

      <ChartCard
        title="Actual versus forecast"
        howToRead="The forecast line sitting above the actual line marks hours the forecast overreported. Open the table below for a signed error summary."
      >
        <QuerySection query={comparison} label="the comparison series" render={(data) => (
          <>
            <div className="chart-body" role="img" aria-label="Actual and forecast wind generation over the period, in MW">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={series} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis dataKey="timeLabel" tickMargin={8} minTickGap={64} />
                  <YAxis
                    width={58}
                    tickFormatter={(value: number) => value.toLocaleString("en-GB")}
                    label={{ value: "MW", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip content={<ChartTooltip formatValue={formatMw} />} cursor={TOOLTIP_CURSOR_LINE} />
                  <Line type="monotone" dataKey="actualMw" name="Actual" stroke="#0f93aa" strokeWidth={1.6} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="forecastMw" name="Forecast" stroke="#667f8c" strokeWidth={1.6} strokeDasharray="5 3" dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-key">
              <span>
                <span className="key-swatch" aria-hidden="true" />
                Actual
              </span>
              <span>
                <span className="key-swatch key-swatch-secondary" aria-hidden="true" />
                Forecast
              </span>
            </p>
            <details className="chart-data">
              <summary>View as table</summary>
              <DataTable headers={["Metric", "Value"]} rows={errorSummaryRows(data.points)} caption="Comparison series summary" />
            </details>
          </>
        )} />
      </ChartCard>

      <ChartCard
        title="Signed error over time"
        howToRead="Areas above the zero line are hours the forecast overreported; below the line it underreported."
      >
        <QuerySection query={comparison} label="the comparison series" render={(data) => (
          <>
            <div className="chart-body" role="img" aria-label="Signed forecast error over the period, in MW">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={series} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis dataKey="timeLabel" tickMargin={8} minTickGap={64} />
                  <YAxis width={62} tickFormatter={(value: number) => value.toLocaleString("en-GB")} label={{ value: "MW", angle: -90, position: "insideLeft" }} />
                  <Tooltip content={<ChartTooltip formatValue={formatSignedMw} />} cursor={TOOLTIP_CURSOR_LINE} />
                  <ReferenceLine y={0} stroke="#8fa3ad" strokeDasharray="4 4" />
                  <Area type="monotone" dataKey="errorMw" name="Signed error" stroke="#0f93aa" fill="#0f93aa" fillOpacity={0.18} strokeWidth={1.4} dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
            <details className="chart-data">
              <summary>View as table</summary>
              <DataTable headers={["Metric", "Value"]} rows={errorSummaryRows(data.points)} caption="Signed error summary" />
            </details>
          </>
        )} />
      </ChartCard>

      <ChartCard
        title="Daily mean error"
        howToRead="Each bar is one delivery day; bars above zero mean the forecast ran high on average that day."
        summary={`${positiveDays} of ${daily.length} delivery days had a positive mean error.`}
      >
        <QuerySection query={comparison} label="the comparison series" render={(data) => (
          <>
            <div className="chart-body chart-body-short" role="img" aria-label="Daily mean signed error across the 31 delivery days, in MW">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={dailyData} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis dataKey="dayLabel" tickMargin={8} minTickGap={22} />
                  <YAxis width={62} tickFormatter={(value: number) => value.toLocaleString("en-GB")} label={{ value: "MW", angle: -90, position: "insideLeft" }} />
                  <Tooltip content={<ChartTooltip formatValue={formatSignedMw} />} cursor={TOOLTIP_CURSOR_AREA} />
                  <ReferenceLine y={0} stroke="#8fa3ad" />
                  <Bar dataKey="meanErrorMw" name="Daily mean error" isAnimationActive={false}>
                    {dailyData.map((day) => (
                      <Cell
                        key={day.dayLabel}
                        className={day.meanErrorMw >= 0 ? "bar-positive" : "bar-negative"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-key">
              <span>
                <span className="key-swatch" aria-hidden="true" />
                Positive day
              </span>
              <span>
                <span className="key-swatch key-swatch-negative" aria-hidden="true" />
                Negative day
              </span>
            </p>
            <details className="chart-data">
              <summary>View as table</summary>
              <DataTable
                headers={["Delivery day", "Mean signed error MW"]}
                rows={dailyMeanErrors(data.points).map((day) => [day.date, formatSignedMw(day.meanErrorMw)])}
                caption="Mean signed error by delivery day"
              />
            </details>
          </>
        )} />
      </ChartCard>

      <ChartCard
        title="Error by delivery hour"
        howToRead="Compare how error size (MAE) and direction (bias) move through the London clock day."
      >
        <QuerySection query={byHour} label="the hourly profile" render={(data) => (
          <>
            <div className="chart-body chart-body-short" role="img" aria-label="Mean absolute error and signed bias by delivery hour of day, in MW">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={hourData} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis dataKey="hourLabel" tickMargin={8} minTickGap={10} />
                  <YAxis width={58} tickFormatter={(value: number) => value.toLocaleString("en-GB")} label={{ value: "MW", angle: -90, position: "insideLeft" }} />
                  <Tooltip content={<ChartTooltip formatValue={formatMw} />} cursor={TOOLTIP_CURSOR_AREA} />
                  <Bar dataKey="maeMw" name="MAE" fill="#667f8c" isAnimationActive={false} />
                  <Bar dataKey="biasMw" name="Bias" fill="#0f93aa" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-key">
              <span>
                <span className="key-swatch key-swatch-secondary" aria-hidden="true" />
                MAE
              </span>
              <span>
                <span className="key-swatch" aria-hidden="true" />
                Bias
              </span>
            </p>
            <details className="chart-data">
              <summary>View as table</summary>
              <DataTable
                headers={["Hour London", "Hours scored", "MAE MW", "Bias MW"]}
                rows={data.buckets.map((bucket) => [
                  `${String(bucket.hour_local).padStart(2, "0")}:00`,
                  String(bucket.sample_count),
                  bucket.mae_mw === null ? "no data" : bucket.mae_mw.toFixed(1),
                  bucket.bias_mw === null ? "no data" : bucket.bias_mw.toFixed(1),
                ])}
                caption="Selected cutoff errors grouped by Europe/London clock hour"
              />
            </details>
          </>
        )} />
      </ChartCard>

      <ChartCard
        title="Error by lead time"
        howToRead="Bias growing with lead time means skill degrades further ahead; all January published vintages are included here."
      >
        <QuerySection query={byLead} label="the lead time profile" render={(data) => (
          <>
            <div className="chart-body" role="img" aria-label="Mean absolute error and signed bias by forecast lead time from 0 to 48 hours, in MW">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={leadData} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis
                    dataKey="leadLabel"
                    tickMargin={8}
                    interval={3}
                    label={{ value: "Hours ahead", position: "insideBottom", offset: -2 }}
                  />
                  <YAxis width={58} tickFormatter={(value: number) => value.toLocaleString("en-GB")} label={{ value: "MW", angle: -90, position: "insideLeft" }} />
                  <Tooltip content={<ChartTooltip formatValue={formatMw} />} cursor={TOOLTIP_CURSOR_LINE} />
                  <Line type="monotone" dataKey="maeMw" name="MAE" stroke="#667f8c" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                  <Line type="monotone" dataKey="biasMw" name="Bias" stroke="#0f93aa" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-key">
              <span>
                <span className="key-swatch key-swatch-secondary" aria-hidden="true" />
                MAE
              </span>
              <span>
                <span className="key-swatch" aria-hidden="true" />
                Bias
              </span>
            </p>
            <details className="chart-data">
              <summary>View as table</summary>
              <DataTable
                headers={["Lead bucket h", "Samples", "MAE MW", "Bias MW"]}
                rows={data.buckets.map((bucket) => [
                  `${bucket.lead_start_hours} to ${bucket.lead_end_hours}`,
                  String(bucket.sample_count),
                  bucket.mae_mw === null ? "no data" : bucket.mae_mw.toFixed(1),
                  bucket.bias_mw === null ? "no data" : bucket.bias_mw.toFixed(1),
                ])}
                caption="One hour lead time buckets over all January published vintages"
              />
            </details>
          </>
        )} />
      </ChartCard>

      <ChartCard
        title="Error distribution"
        howToRead="Mass to the right of zero MW shows the overforecast tendency; bin width is 500 MW."
      >
        <QuerySection query={distribution} label="the error distribution" render={(_data) => (
          <>
            <div className="chart-body chart-body-short" role="img" aria-label="Histogram of signed errors in 500 MW bins">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={histData} margin={MARGIN}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis
                    dataKey="binLabel"
                    tickMargin={6}
                    interval={0}
                    angle={-35}
                    textAnchor="end"
                    height={58}
                    tickFormatter={(value: string) => value.split(" to ")[0]}
                  />
                  <YAxis width={44} label={{ value: "Hours", angle: -90, position: "insideLeft" }} />
                  <Tooltip content={<ChartTooltip formatValue={formatMw} />} cursor={TOOLTIP_CURSOR_AREA} />
                  <ReferenceLine y={0} stroke="#8fa3ad" />
                  <Bar dataKey="count" name="Hours in bin" isAnimationActive={false}>
                    {histData.map((bin) => (
                      <Cell
                        key={bin.binLabel}
                        className={bin.negative ? "bar-negative" : "bar-positive"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-key">
              <span>
                <span className="key-swatch key-swatch-negative" aria-hidden="true" />
                Below zero
              </span>
              <span>
                <span className="key-swatch" aria-hidden="true" />
                Zero and above
              </span>
            </p>
            <details className="chart-data">
              <summary>View as table</summary>
              <DataTable
                headers={["Bin MW", "Hours"]}
                rows={histData.map((bin) => [bin.binLabel, String(bin.count)])}
                caption="Signed error histogram, 500 MW bins"
              />
            </details>
          </>
        )} />
      </ChartCard>

      <ChartCard
        title="Cutoff sensitivity"
        howToRead="Accuracy barely moves across plausible morning cutoffs, so the 09:00 assumption is not load bearing."
      >
        <QuerySection query={sensitivity} label="cutoff sensitivity" render={(data) => (
          <DataTable
            headers={["Cutoff London", "Hours scored", "MAE MW", "RMSE MW", "Bias MW", "P95 abs error MW"]}
            rows={data.results.map((row) => [
              row.cutoff_local === cutoff ? `${row.cutoff_local} (current)` : row.cutoff_local,
              String(row.sample_count),
              row.mae_mw === null ? "no data" : row.mae_mw.toFixed(1),
              row.rmse_mw === null ? "no data" : row.rmse_mw.toFixed(1),
              row.bias_mw === null ? "no data" : row.bias_mw.toFixed(1),
              row.p95_absolute_error_mw === null ? "no data" : row.p95_absolute_error_mw.toFixed(1),
            ])}
            caption="Accuracy across plausible decision cutoffs"
          />
        )} />
      </ChartCard>
    </div>
  );
}
