import { useCallback, useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, type RevisionResponse } from "../api/client";
import { ChartTooltip } from "../components/ChartTooltip";
import { CutoffControl } from "../components/CutoffControl";
import { DataTable } from "../components/DataTable";
import { DateSelect } from "../components/DateSelect";
import { MetricCard } from "../components/MetricCard";
import { EmptyState, ErrorState, LoadingSkeleton } from "../components/States";
import { useApi, type ApiQuery } from "../hooks/useApi";
import {
  DEFAULT_CUTOFF,
  SCOPE_END,
  SCOPE_START,
  deliveryDates2026,
  forecastStats,
} from "../lib/derive";
import {
  formatGw,
  formatLondonDate,
  formatLondonTime,
  formatMw,
  formatSignedMw,
  formatUtcFull,
  formatUtcTime,
} from "../lib/format";

interface CurveDatum {
  hourLabel: string;
  utc: string;
  published: number | null;
  adjusted: number | null;
  publishUtc: string | null;
  leadHours: number | null;
}

export function DecisionView() {
  const [deliveryDate, setDeliveryDate] = useState(SCOPE_START);
  const [cutoff, setCutoff] = useState(DEFAULT_CUTOFF);
  const [biasAdjustOn, setBiasAdjustOn] = useState(false);
  const [biasAdjustMw, setBiasAdjustMw] = useState<number | null>(null);

  const dates = useMemo(deliveryDates2026, []);
  const latest = useApi(
    useCallback(() => api.latestForecast(deliveryDate, cutoff), [deliveryDate, cutoff]),
  );
  const summary = useApi(
    useCallback(() => api.accuracySummary(SCOPE_START, SCOPE_END, cutoff), [cutoff]),
  );
  const revisions = useApi(
    useCallback(() => api.revisions(deliveryDate, cutoff), [deliveryDate, cutoff]),
  );

  // The what-if slider defaults to the January mean signed error once the
  // summary arrives, until the user moves it.
  const bias = summary.data?.bias_mw;
  const defaultAdjustMw = bias === null || bias === undefined ? 0 : Math.round(bias);
  const adjustMw = biasAdjustMw ?? defaultAdjustMw;

  const points = latest.data?.points ?? [];
  const curveData: CurveDatum[] = points.map((point) => ({
    hourLabel: formatLondonTime(point.start_time_utc),
    utc: point.start_time_utc,
    published: point.forecast_mw,
    adjusted: point.forecast_mw === null ? null : Math.max(0, point.forecast_mw - adjustMw),
    publishUtc: point.publish_time_utc,
    leadHours: point.lead_hours,
  }));

  const stats = latest.data ? forecastStats(latest.data.points) : null;
  const publishTimes = [
    ...new Set(points.map((point) => point.publish_time_utc).filter((value): value is string => value !== null)),
  ].sort();
  const leads = points.map((point) => point.lead_hours).filter((value): value is number => value !== null);
  const leadMin = leads.length > 0 ? Math.min(...leads) : null;
  const leadMax = leads.length > 0 ? Math.max(...leads) : null;
  const allMissing = points.length > 0 && points.every((point) => point.forecast_mw === null);

  return (
    <div className="view">
      <div className="controls-row">
        <DateSelect value={deliveryDate} dates={dates} onChange={setDeliveryDate} />
        <CutoffControl value={cutoff} onChange={setCutoff} />
      </div>
      {latest.loading ? <LoadingSkeleton label="the decision forecast" /> : null}
      {latest.error ? <ErrorState error={latest.error} onRetry={latest.retry} /> : null}
      {latest.data !== null && allMissing ? (
        <EmptyState
          title="No forecast at this cutoff"
          body={`No WINDFOR edition for ${formatLondonDate(deliveryDate)} was published by ${cutoff} London. Try an earlier cutoff such as 08:00 or pick another day.`}
        />
      ) : null}
      {latest.data !== null && !allMissing ? (
        <>
          <div className="metric-row">
            <MetricCard
              label="Peak forecast"
              value={stats ? formatGw(stats.peakMw) : "no data"}
              note={stats ? `${formatLondonTime(stats.peakTimeUtc)} London` : undefined}
            />
            <MetricCard
              label="Trough forecast"
              value={stats ? formatGw(stats.troughMw) : "no data"}
              note={stats ? `${formatLondonTime(stats.troughTimeUtc)} London` : undefined}
            />
            <MetricCard
              label="Mean forecast"
              value={stats ? formatGw(stats.meanMw) : "no data"}
              note="across the delivery day"
            />
          </div>

          <section className="chart-card">
            <h3>Latest forecast available at the cutoff</h3>
            <p className="how-to-read">
              The curve is the newest WINDFOR edition published by the cutoff for each delivery
              hour. Actuals never appear in this view.
            </p>
            <p className="meta-line">
              Cutoff {cutoff} London ({latest.data.cutoff_utc ? formatUtcTime(latest.data.cutoff_utc) : "unknown"}).
              Selected edition published{" "}
              {publishTimes.length > 0
                ? publishTimes.map((time) => formatUtcTime(time)).join(", ")
                : "unknown"}
              . Lead{" "}
              {leadMin !== null && leadMax !== null
                ? `${leadMin.toFixed(1)} to ${leadMax.toFixed(1)} h before each target hour`
                : "unknown"}
              .
              {latest.data.missing_forecast_hours > 0
                ? ` ${latest.data.missing_forecast_hours} of 24 hours have no eligible edition.`
                : ""}
            </p>
            <div className="what-if">
              <div className="what-if-head">
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={biasAdjustOn}
                    onChange={(event) => setBiasAdjustOn(event.target.checked)}
                  />
                  <span>Adjust for observed January bias</span>
                </label>
                <p className="what-if-value" aria-live="polite">
                  {formatSignedMw(-adjustMw)} adjustment
                </p>
              </div>
              <input
                type="range"
                min={0}
                max={6000}
                step={25}
                value={adjustMw}
                aria-label="Bias adjustment subtracted from the published forecast, in MW"
                onChange={(event) => {
                  setBiasAdjustMw(Number(event.target.value));
                  setBiasAdjustOn(true);
                }}
              />
              <p className="control-hint">
                The adjusted curve is the published forecast minus this amount, never below zero.
                Derived from January 2026 errors, in-sample, not a forecast of future bias.
              </p>
            </div>
            <div
              className="chart-body"
              role="img"
              aria-label={`Published forecast curve for ${formatLondonDate(deliveryDate)} in MW`}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={curveData} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
                  <XAxis dataKey="hourLabel" tickMargin={8} minTickGap={18} />
                  <YAxis
                    width={58}
                    tickFormatter={(value: number) => value.toLocaleString("en-GB")}
                    label={{ value: "MW", angle: -90, position: "insideLeft" }}
                  />
                  <Tooltip
                    content={<ChartTooltip formatValue={formatMw} />}
                    cursor={{ stroke: "#8fa3ad", strokeDasharray: "3 3" }}
                  />
                  <Line
                    type="monotone"
                    dataKey="published"
                    name="Published forecast"
                    stroke="#0f93aa"
                    strokeWidth={2}
                    dot={false}
                    connectNulls={false}
                    isAnimationActive={false}
                  />
                  {biasAdjustOn ? (
                    <Line
                      type="monotone"
                      dataKey="adjusted"
                      name="Bias adjusted"
                      stroke="#d0862c"
                      strokeWidth={2}
                      strokeDasharray="6 3"
                      dot={false}
                      connectNulls={false}
                      isAnimationActive={false}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
            </div>
            <p className="chart-key">
              <span>
                <span className="key-swatch" aria-hidden="true" />
                Published forecast
              </span>
              {biasAdjustOn ? (
                <span>
                  <span className="key-swatch key-swatch-negative" aria-hidden="true" />
                  Bias adjusted
                </span>
              ) : null}
            </p>
            <details className="chart-data">
              <summary>View as table</summary>
              <DataTable
                headers={["Hour London", "Target UTC", "Forecast MW", "Published at UTC", "Lead hours"]}
                rows={curveData.map((datum) => [
                  datum.hourLabel,
                  datum.utc.slice(11, 16),
                  datum.published === null
                    ? "missing"
                    : Math.round(datum.published).toLocaleString("en-GB"),
                  datum.publishUtc === null ? "missing" : formatUtcFull(datum.publishUtc),
                  datum.leadHours === null ? "missing" : datum.leadHours.toFixed(1),
                ])}
                caption={`Selected forecast for ${formatLondonDate(deliveryDate)} at the ${cutoff} London cutoff`}
              />
            </details>
          </section>
          <RevisionsPanel query={revisions} cutoff={cutoff} />
        </>
      ) : null}
    </div>
  );
}

function RevisionsPanel({ query, cutoff }: { query: ApiQuery<RevisionResponse>; cutoff: string }) {
  if (query.loading) {
    return (
      <section className="chart-card">
        <h3>Forecast editions for the day</h3>
        <LoadingSkeleton label="forecast editions" />
      </section>
    );
  }
  if (query.error) {
    return (
      <section className="chart-card">
        <h3>Forecast editions for the day</h3>
        <ErrorState error={query.error} onRetry={query.retry} />
      </section>
    );
  }
  const vintages = query.data?.vintages ?? [];
  if (vintages.length === 0) {
    return (
      <section className="chart-card">
        <h3>Forecast editions for the day</h3>
        <EmptyState
          title="No editions found"
          body="The snapshot holds no WINDFOR vintages for this delivery day."
        />
      </section>
    );
  }
  const selectedIndex = vintages.findIndex((vintage) =>
    vintage.points.some((point) => point.selected_at_cutoff),
  );
  const allTimes = [
    ...new Set(vintages.flatMap((vintage) => vintage.points.map((point) => point.start_time_utc))),
  ].sort();
  const data: Record<string, string | number | null>[] = allTimes.map((utc) => {
    const row: Record<string, string | number | null> = {
      hourLabel: formatLondonTime(utc),
      utc,
    };
    vintages.forEach((vintage, index) => {
      const point = vintage.points.find((item) => item.start_time_utc === utc);
      row[`e${index}`] = point === undefined ? null : point.generation_mw;
    });
    return row;
  });
  return (
    <section className="chart-card">
      <h3>Forecast editions for the day</h3>
      <p className="how-to-read">
        Each line is one published edition of the day-ahead forecast; the highlighted line is the
        edition the cutoff rule selects. Later editions stay visible here but were not available at
        decision time.
      </p>
      <div
        className="chart-body"
        role="img"
        aria-label="Forecast editions across the delivery day, one line per published edition"
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} className="chart-grid" />
            <XAxis dataKey="hourLabel" tickMargin={8} minTickGap={18} />
            <YAxis
              width={58}
              tickFormatter={(value: number) => value.toLocaleString("en-GB")}
              label={{ value: "MW", angle: -90, position: "insideLeft" }}
            />
            <Tooltip
              content={<ChartTooltip formatValue={formatMw} />}
              cursor={{ stroke: "#8fa3ad", strokeDasharray: "3 3" }}
            />
            {vintages.map((vintage, index) => (
              <Line
                key={vintage.publish_time_utc}
                type="monotone"
                dataKey={`e${index}`}
                name={formatUtcTime(vintage.publish_time_utc)}
                stroke={index === selectedIndex ? "#0f93aa" : "#667f8c"}
                strokeWidth={index === selectedIndex ? 2.4 : 1.1}
                strokeOpacity={index === selectedIndex || vintages.length <= 3 ? 1 : 0.5}
                dot={false}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <details className="chart-data">
        <summary>View editions as table</summary>
        <DataTable
          headers={["Published London", "Published UTC", "Hours covered", "Mean MW", "Selected"]}
          rows={vintages.map((vintage) => {
            const values = vintage.points.map((point) => point.generation_mw);
            const selected =
              selectedIndex >= 0 && vintage.points.some((point) => point.selected_at_cutoff);
            return [
              formatLondonTime(vintage.publish_time_utc),
              formatUtcFull(vintage.publish_time_utc),
              String(vintage.points.length),
              Math.round(
                values.reduce((total, value) => total + value, 0) / Math.max(1, values.length),
              ).toLocaleString("en-GB"),
              selected ? "Yes" : "",
            ];
          })}
          caption={`All ${vintages.length} WINDFOR editions for this delivery day, cutoff ${cutoff} London`}
        />
      </details>
    </section>
  );
}
