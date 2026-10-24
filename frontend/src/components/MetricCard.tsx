interface MetricCardProps {
  label: string;
  value: string;
  note?: string;
}

export function MetricCard({ label, value, note }: MetricCardProps) {
  return (
    <div className="metric-card">
      <span className="metric-label">{label}</span>
      <span className="metric-value">{value}</span>
      {note !== undefined ? <span className="metric-note">{note}</span> : null}
    </div>
  );
}
