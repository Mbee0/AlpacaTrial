import { describe, expect, it } from "vitest";
import { OhlcvBar } from "@trader/shared";
import { analyzeSymbol } from "./strategyEngine.js";

function syntheticBars(): OhlcvBar[] {
  const bars: OhlcvBar[] = [];
  const start = new Date("2025-01-01T00:00:00Z").getTime();
  for (let i = 0; i < 220; i += 1) {
    const base = 100 + i * 0.25 + Math.sin(i / 5) * 1.3;
    bars.push({
      symbol: "TEST",
      timestamp: new Date(start + i * 60 * 60 * 1000).toISOString(),
      open: base - 0.4,
      high: base + 1,
      low: base - 1,
      close: base + 0.3,
      volume: 100000 + i * 500
    });
  }
  return bars;
}

describe("analyzeSymbol", () => {
  it("returns a scored signal and explanation", () => {
    const result = analyzeSymbol({
      symbol: "TEST",
      timeframe: "1Hour",
      bars: syntheticBars()
    });

    expect(result.signal.score).toBeGreaterThanOrEqual(0);
    expect(result.signal.score).toBeLessThanOrEqual(100);
    expect(result.signal.explanation.length).toBeGreaterThan(2);
  });
});
