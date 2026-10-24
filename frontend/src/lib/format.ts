// Pure formatting helpers shared by views, charts, and tests. No React, no
// network, no state. Energy values arrive in MW from the API; large levels are
// shown in GW with one decimal, errors and metric values in MW.

const LONDON_TIME_ZONE = "Europe/London";

const londonClock = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

const londonDay = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON_TIME_ZONE,
  day: "numeric",
  month: "short",
});

const londonFullDate = new Intl.DateTimeFormat("en-GB", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
  year: "numeric",
});

function parseUtc(iso: string): Date {
  return new Date(iso);
}

export function formatMw(valueMw: number): string {
  return `${Math.round(valueMw).toLocaleString("en-GB")} MW`;
}

export function formatGw(valueMw: number): string {
  return `${(valueMw / 1000).toFixed(1)} GW`;
}

export function formatSignedMw(valueMw: number): string {
  const rounded = Math.round(valueMw);
  const magnitude = Math.abs(rounded).toLocaleString("en-GB");
  return rounded >= 0 ? `+${magnitude} MW` : `-${magnitude} MW`;
}

export function formatPct(valuePct: number, digits = 1): string {
  return `${valuePct.toFixed(digits)}%`;
}

export function formatSignedPct(valuePct: number, digits = 1): string {
  const magnitude = Math.abs(valuePct).toFixed(digits);
  return valuePct >= 0 ? `+${magnitude}%` : `-${magnitude}%`;
}

export function formatHours(valueHours: number): string {
  return `${valueHours.toFixed(1)} h`;
}

export function formatLondonTime(isoUtc: string): string {
  return londonClock.format(parseUtc(isoUtc));
}

export function formatLondonDay(isoUtc: string): string {
  return londonDay.format(parseUtc(isoUtc));
}

export function formatLondonDayClock(isoUtc: string): string {
  const instant = parseUtc(isoUtc);
  return `${londonDay.format(instant)}, ${londonClock.format(instant)}`;
}

export function formatUtcTime(isoUtc: string): string {
  return `${isoUtc.slice(11, 16)} UTC`;
}

export function formatUtcFull(isoUtc: string): string {
  return `${isoUtc.slice(0, 16).replace("T", " ")} UTC`;
}

export function formatLondonDate(dateIso: string): string {
  return londonFullDate.format(parseUtc(`${dateIso}T00:00:00Z`));
}
