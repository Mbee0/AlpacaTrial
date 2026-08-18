import { OhlcvBar, SwingPoint, TrendDirection, Trendline, Timeframe } from "@trader/shared";

interface CandidateLine extends Trendline {
  fitError: number;
  recencyScore: number;
}

function toEpochMs(ts: string) {
  return new Date(ts).getTime();
}

function linePriceAt(params: { x1: number; y1: number; slope: number; x: number }) {
  const { x1, y1, slope, x } = params;
  return y1 + slope * (x - x1);
}

export function detectTrendDirection(swings: SwingPoint[]): TrendDirection {
  const highs = swings.filter((point) => point.kind === "HIGH").slice(-3);
  const lows = swings.filter((point) => point.kind === "LOW").slice(-3);
  if (highs.length < 2 || lows.length < 2) {
    return "SIDEWAYS";
  }

  const higherHighs = highs[highs.length - 1].price > highs[highs.length - 2].price;
  const higherLows = lows[lows.length - 1].price > lows[lows.length - 2].price;
  const lowerHighs = highs[highs.length - 1].price < highs[highs.length - 2].price;
  const lowerLows = lows[lows.length - 1].price < lows[lows.length - 2].price;

  if (higherHighs && higherLows) {
    return "BULLISH";
  }
  if (lowerHighs && lowerLows) {
    return "BEARISH";
  }
  return "SIDEWAYS";
}

function scoreLine(params: {
  bars: OhlcvBar[];
  startPoint: SwingPoint;
  endPoint: SwingPoint;
  direction: TrendDirection;
  symbol: string;
  timeframe: Timeframe;
}): CandidateLine {
  const { bars, startPoint, endPoint, direction, symbol, timeframe } = params;
  const x1 = toEpochMs(startPoint.timestamp);
  const x2 = toEpochMs(endPoint.timestamp);
  const y1 = startPoint.price;
  const y2 = endPoint.price;
  const slope = (y2 - y1) / (x2 - x1);

  const barsAfterStart = bars.filter((bar) => toEpochMs(bar.timestamp) >= x1);
  let touches = 0;
  let violations = 0;
  let adherenceError = 0;

  for (const bar of barsAfterStart) {
    const px = linePriceAt({ x1, y1, slope, x: toEpochMs(bar.timestamp) });
    const distance = Math.abs(bar.close - px) / bar.close;
    adherenceError += distance;

    const touchesLine = Math.abs(bar.low - px) / bar.close < 0.003 || Math.abs(bar.high - px) / bar.close < 0.003;
    if (touchesLine) {
      touches += 1;
    }

    const lineViolated =
      direction === "BULLISH" ? bar.close < px * 0.995 : direction === "BEARISH" ? bar.close > px * 1.005 : false;
    if (lineViolated) {
      violations += 1;
    }
  }

  const durationMs = Math.max(1, x2 - x1);
  const durationDays = durationMs / (1000 * 60 * 60 * 24);
  const avgError = adherenceError / Math.max(1, barsAfterStart.length);
  const fitError = Math.min(1, avgError * 10);

  const mostRecent = bars[bars.length - 1];
  const recencyDays = (toEpochMs(mostRecent.timestamp) - x2) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - recencyDays / 60);
  const normalizedSlopePenalty = Math.min(1, Math.abs(slope) * 86400000 * 2);

  const score =
    touches * 9 +
    durationDays * 0.4 +
    recencyScore * 25 -
    violations * 14 -
    fitError * 30 -
    normalizedSlopePenalty * 8;

  return {
    symbol,
    timeframe,
    direction,
    kind: "CANDIDATE",
    startTime: startPoint.timestamp,
    endTime: endPoint.timestamp,
    startPrice: startPoint.price,
    endPrice: endPoint.price,
    slope,
    score,
    touches,
    violations,
    fitError,
    recencyScore
  };
}

export function generateTrendlineCandidates(params: {
  symbol: string;
  timeframe: Timeframe;
  swings: SwingPoint[];
  bars: OhlcvBar[];
  direction: TrendDirection;
}) {
  const { symbol, timeframe, swings, bars, direction } = params;
  const anchorKind = direction === "BULLISH" ? "LOW" : direction === "BEARISH" ? "HIGH" : null;
  if (!anchorKind) {
    return [];
  }

  const anchors = swings.filter((swing) => swing.kind === anchorKind).slice(-8);
  const candidates: CandidateLine[] = [];

  for (let i = 0; i < anchors.length - 1; i += 1) {
    for (let j = i + 1; j < anchors.length; j += 1) {
      const candidate = scoreLine({
        bars,
        startPoint: anchors[i],
        endPoint: anchors[j],
        direction,
        symbol,
        timeframe
      });
      if (Number.isFinite(candidate.score)) {
        candidates.push(candidate);
      }
    }
  }

  return candidates.sort((a, b) => b.score - a.score);
}

export function pickActionAndSafetyLines(candidates: CandidateLine[]) {
  if (candidates.length === 0) {
    return {
      actionLine: undefined,
      safetyLine: undefined
    };
  }

  const [best, secondBest] = candidates;
  const actionLine: Trendline = { ...best, kind: "ACTION" };
  const safetyLine: Trendline | undefined = secondBest ? { ...secondBest, kind: "SAFETY" } : undefined;

  return { actionLine, safetyLine };
}
