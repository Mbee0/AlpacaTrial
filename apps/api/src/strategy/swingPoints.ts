import { OhlcvBar, SwingPoint, Timeframe } from "@trader/shared";

export function detectSwingPoints(params: {
  symbol: string;
  timeframe: Timeframe;
  bars: OhlcvBar[];
  leftWindow?: number;
  rightWindow?: number;
}): SwingPoint[] {
  const { symbol, timeframe, bars, leftWindow = 2, rightWindow = 2 } = params;
  if (bars.length < leftWindow + rightWindow + 1) {
    return [];
  }

  const points: SwingPoint[] = [];

  for (let i = leftWindow; i < bars.length - rightWindow; i += 1) {
    const current = bars[i];
    const left = bars.slice(i - leftWindow, i);
    const right = bars.slice(i + 1, i + 1 + rightWindow);
    const neighbours = [...left, ...right];

    const higherThanAll = neighbours.every((bar) => current.high >= bar.high);
    const lowerThanAll = neighbours.every((bar) => current.low <= bar.low);

    if (higherThanAll) {
      const averageDifference =
        neighbours.reduce((acc, bar) => acc + (current.high - bar.high), 0) / neighbours.length;
      points.push({
        symbol,
        timeframe,
        timestamp: current.timestamp,
        price: current.high,
        kind: "HIGH",
        strength: Math.max(0, averageDifference)
      });
    }

    if (lowerThanAll) {
      const averageDifference =
        neighbours.reduce((acc, bar) => acc + (bar.low - current.low), 0) / neighbours.length;
      points.push({
        symbol,
        timeframe,
        timestamp: current.timestamp,
        price: current.low,
        kind: "LOW",
        strength: Math.max(0, averageDifference)
      });
    }
  }

  return points.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
}
