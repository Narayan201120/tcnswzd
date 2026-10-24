export const CUTOFF_PRESETS = ["08:00", "09:00", "09:20"] as const;
export type CutoffPreset = (typeof CUTOFF_PRESETS)[number];
const DEFAULT_CUSTOM_CUTOFF = "10:00";

export function isPreset(value: string): value is CutoffPreset {
  return (CUTOFF_PRESETS as readonly string[]).includes(value);
}

interface CutoffControlProps {
  value: string;
  onChange: (cutoff: string) => void;
}

// Cutoff presets are Europe/London clock times on the D-1 decision day. The
// custom entry accepts any HH:MM London time and passes it through to the API,
// which validates it.
export function CutoffControl({ value, onChange }: CutoffControlProps) {
  const custom = !isPreset(value);
  return (
    <fieldset className="cutoff-control">
      <legend>Cutoff, Europe/London</legend>
      <div className="cutoff-options">
        {CUTOFF_PRESETS.map((preset) => (
          <label key={preset} className="radio-chip">
            <input
              type="radio"
              name="cutoff-preset"
              value={preset}
              checked={value === preset}
              onChange={() => onChange(preset)}
            />
            <span>{preset}</span>
          </label>
        ))}
        <label className="radio-chip">
          <input
            type="radio"
            name="cutoff-preset"
            value="custom"
            checked={custom}
            onChange={() => onChange(custom ? value : DEFAULT_CUSTOM_CUTOFF)}
          />
          <span>Custom</span>
        </label>
        <input
          type="time"
          className="cutoff-custom-time"
          aria-label="Custom cutoff time in Europe/London"
          value={custom ? value : ""}
          step={60}
          onChange={(event) => {
            const next = event.target.value;
            if (/^\d{2}:\d{2}$/.test(next)) {
              onChange(next);
            }
          }}
        />
      </div>
      <p className="control-hint">Decisions are assumed complete by this local time on D-1.</p>
    </fieldset>
  );
}
