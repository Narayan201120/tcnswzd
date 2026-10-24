import {
  formatGw,
  formatLondonDate,
  formatLondonDayClock,
  formatLondonTime,
  formatMw,
  formatPct,
  formatSignedMw,
  formatSignedPct,
  formatUtcTime,
} from "../lib/format";

describe("formatting helpers", () => {
  it("formats MW with thousands grouping", () => {
    expect(formatMw(2038.9126)).toBe("2,039 MW");
    expect(formatMw(940.4)).toBe("940 MW");
  });

  it("formats GW with one decimal", () => {
    expect(formatGw(1747.887)).toBe("1.7 GW");
    expect(formatGw(940)).toBe("0.9 GW");
    expect(formatGw(5283.35)).toBe("5.3 GW");
  });

  it("formats signed MW with an explicit sign", () => {
    expect(formatSignedMw(1747.887)).toBe("+1,748 MW");
    expect(formatSignedMw(-730.1)).toBe("-730 MW");
  });

  it("formats percentages with an explicit sign when signed", () => {
    expect(formatPct(15.49)).toBe("15.5%");
    expect(formatSignedPct(15.49)).toBe("+15.5%");
    expect(formatSignedPct(-8.34)).toBe("-8.3%");
  });

  it("formats London clock times and UTC times", () => {
    expect(formatLondonTime("2026-01-01T07:30:00Z")).toBe("07:30");
    expect(formatLondonTime("2026-01-02T00:00:00Z")).toBe("00:00");
    expect(formatUtcTime("2026-01-01T07:30:00Z")).toBe("07:30 UTC");
    expect(formatLondonDayClock("2026-01-02T23:30:00Z")).toBe("2 Jan, 23:30");
  });

  it("formats dates in a short readable form", () => {
    expect(formatLondonDate("2026-01-02")).toBe("2 Jan 2026");
    expect(formatLondonDate("2026-02-01")).toBe("1 Feb 2026");
  });
});
