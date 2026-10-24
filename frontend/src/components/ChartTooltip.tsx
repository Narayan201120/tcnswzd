import { formatHours, formatUtcTime } from "../lib/format";

interface TooltipPayloadItem {
  name?: string | number;
  value?: unknown;
  color?: string;
  payload?: Record<string, unknown>;
}

interface ChartTooltipProps {
  active?: boolean;
  label?: unknown;
  payload?: TooltipPayloadItem[];
  formatValue: (value: number) => string;
}

// Shared tooltip content for every chart. When a chart's datum carries utc,
// publishUtc, or leadHours fields, they are shown as notes under the values so
// London clock times stay on the axis and UTC stays in the tooltip.
export function ChartTooltip({ active, label, payload, formatValue }: ChartTooltipProps) {
  if (active !== true || payload === undefined || payload.length === 0) {
    return null;
  }
  const first = payload[0]?.payload;
  const utc = typeof first?.utc === "string" ? first.utc : null;
  const publishUtc = typeof first?.publishUtc === "string" ? first.publishUtc : null;
  const leadHours = typeof first?.leadHours === "number" ? first.leadHours : null;
  const notes: string[] = [];
  if (utc !== null) {
    notes.push(`target hour ${formatUtcTime(utc)}`);
  }
  if (publishUtc !== null) {
    notes.push(`published ${formatUtcTime(publishUtc)}`);
  }
  if (leadHours !== null) {
    notes.push(`lead ${formatHours(leadHours)}`);
  }
  return (
    <div className="chart-tooltip">
      <p className="chart-tooltip-label">{String(label ?? "")}</p>
      <ul>
        {payload.map((entry, index) => (
          <li key={index}>
            <span
              className="chart-tooltip-swatch"
              style={{ background: entry.color ?? "var(--text-muted)" }}
            />
            <span className="chart-tooltip-name">{String(entry.name ?? "")}</span>
            <span className="chart-tooltip-value">
              {typeof entry.value === "number"
                ? formatValue(entry.value)
                : entry.value === undefined
                  ? "no data"
                  : String(entry.value)}
            </span>
          </li>
        ))}
      </ul>
      {notes.length > 0 ? <p className="chart-tooltip-note">{notes.join(", ")}</p> : null}
    </div>
  );
}
