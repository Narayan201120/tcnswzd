import type { ReactNode } from "react";

interface ChartCardProps {
  title: string;
  howToRead: string;
  children: ReactNode;
  table?: ReactNode;
  summary?: string;
}

export function ChartCard({ title, howToRead, children, table, summary }: ChartCardProps) {
  return (
    <section className="chart-card">
      <h3>{title}</h3>
      <p className="how-to-read">{howToRead}</p>
      {children}
      {table !== undefined ? (
        <details className="chart-data">
          <summary>View as table</summary>
          {table}
        </details>
      ) : null}
      {summary !== undefined ? <p className="chart-summary">{summary}</p> : null}
    </section>
  );
}
