import { formatLondonDate } from "../lib/format";

interface DateSelectProps {
  value: string;
  dates: string[];
  onChange: (value: string) => void;
}

export function DateSelect({ value, dates, onChange }: DateSelectProps) {
  return (
    <label className="date-select">
      <span>Delivery day</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {dates.map((date) => (
          <option key={date} value={date}>
            {formatLondonDate(date)}
          </option>
        ))}
      </select>
    </label>
  );
}
