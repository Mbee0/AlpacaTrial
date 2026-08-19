import { OhlcvBar, SwingPoint, TrendDirection, Trendline, Timeframe } from "@trader/shared";

interface CandidateLine extends Trendline {
  fitError: number;
  recencyScore: number;
  violationsBeforeEnd: number;
  anchorSpan: number;
  endBarIndex: number;
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
  endBarIndex: number;
}): CandidateLine | null {
  const { bars, startPoint, endPoint, direction, symbol, timeframe, endBarIndex } = params;
  const x1 = toEpochMs(startPoint.timestamp);
  const x2 = toEpochMs(endPoint.timestamp);
  if (x2 <= x1) {
    return null;
  }

  const y1 = startPoint.price;
  const y2 = endPoint.price;
  const slope = (y2 - y1) / (x2 - x1);
  if (direction === "BULLISH" && slope <= 0) {
    return null;
  }
  if (direction === "BEARISH" && slope >= 0) {
    return null;
  }

  const barsAfterStart = bars.filter((bar) => toEpochMs(bar.timestamp) >= x1);
  if (barsAfterStart.length < 8) {
    return null;
  }

  let touches = 0;
  let violations = 0;
  let violationsBeforeEnd = 0;
  let adherenceError = 0;

  for (const bar of barsAfterStart) {
    const barTime = toEpochMs(bar.timestamp);
    const px = linePriceAt({ x1, y1, slope, x: barTime });
    const distance = Math.abs(bar.close - px) / bar.close;
    adherenceError += distance;

    const referencePrice = direction === "BULLISH" ? bar.low : bar.high;
    const touchesLine = Math.abs(referencePrice - px) / Math.max(1e-9, bar.close) < 0.003;
    if (touchesLine) {
      touches += 1;
    }

    const lineViolated =
      direction === "BULLISH" ? bar.low < px * 0.999 : direction === "BEARISH" ? bar.high > px * 1.001 : false;
    if (lineViolated) {
      violations += 1;
      if (barTime <= x2) {
        violationsBeforeEnd += 1;
      }
    }
  }

  // Core ray rule: the line cannot cut through price before the selected touch endpoint.
  if (violationsBeforeEnd > 0) {
    return null;
  }

  const durationMs = Math.max(1, x2 - x1);
  const durationDays = durationMs / (1000 * 60 * 60 * 24);
  const avgError = adherenceError / Math.max(1, barsAfterStart.length);
  const fitError = Math.min(1, avgError * 10);
  const anchorSpan = bars.filter((bar) => {
    const time = toEpochMs(bar.timestamp);
    return time >= x1 && time <= x2;
  }).length;

  const mostRecent = bars[bars.length - 1];
  const recencyDays = (toEpochMs(mostRecent.timestamp) - x2) / (1000 * 60 * 60 * 24);
  const recencyScore = Math.max(0, 1 - recencyDays / 60);
  const slopePerDay = slope * 86400000;
  const normalizedSlopePenalty = Math.min(14, Math.abs(slopePerDay) * 1.6);

  // Prioritize "many touches + no violations + long valid span", matching manual ray drawing.
  const score =
    touches * 15 +
    durationDays * 0.35 +
    recencyScore * 15 +
    anchorSpan * 0.7 +
    endBarIndex * 0.25 -
    violations * 11 -
    fitError * 30 -
    normalizedSlopePenalty;

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
    recencyScore,
    violationsBeforeEnd,
    anchorSpan,
    endBarIndex
  };
}

function dedupeAndSort(candidates: CandidateLine[]) {
  const byKey = new Map<string, CandidateLine>();
  for (const candidate of candidates) {
    const key = `${candidate.direction}:${candidate.startTime}:${candidate.endTime}`;
    const existing = byKey.get(key);
    if (!existing || candidate.score > existing.score) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()].sort((a, b) => b.score - a.score);
}

function buildInitialAnchor(params: {
  direction: Exclude<TrendDirection, "SIDEWAYS">;
  bars: OhlcvBar[];
  symbol: string;
  timeframe: Timeframe;
}): SwingPoint | null {
  const { direction, bars, symbol, timeframe } = params;
  if (bars.length === 0) {
    return null;
  }

  if (direction === "BULLISH") {
    const first = bars[0];
    return {
      symbol,
      timeframe,
      timestamp: first.timestamp,
      price: first.low,
      kind: "LOW",
      strength: 0
    };
  }

  // Bearish chain starts from the top-most point in the series.
  const highestBar = bars.reduce((best, bar) => (bar.high > best.high ? bar : best), bars[0]);
  return {
    symbol,
    timeframe,
    timestamp: highestBar.timestamp,
    price: highestBar.high,
    kind: "HIGH",
    strength: 0
  };
}

function anchorToBarIndex(bars: OhlcvBar[], anchor: SwingPoint) {
  const ts = toEpochMs(anchor.timestamp);
  const idx = bars.findIndex((bar) => toEpochMs(bar.timestamp) === ts);
  return Math.max(0, idx);
}

function chooseBestEndpoint(params: {
  bars: OhlcvBar[];
  startPoint: SwingPoint;
  direction: Exclude<TrendDirection, "SIDEWAYS">;
  symbol: string;
  timeframe: Timeframe;
  endpointCandidates: Array<{ point: SwingPoint; barIndex: number }>;
}) {
  const { bars, startPoint, direction, symbol, timeframe, endpointCandidates } = params;
  let best: CandidateLine | null = null;
  for (const candidatePoint of endpointCandidates) {
    const evaluated = scoreLine({
      bars,
      startPoint,
      endPoint: candidatePoint.point,
      direction,
      symbol,
      timeframe,
      endBarIndex: candidatePoint.barIndex
    });
    if (!evaluated) {
      continue;
    }

    if (!best) {
      best = evaluated;
      continue;
    }

    // First criterion: higher touch count. Then prefer farther endpoint. Then better score.
    if (
      evaluated.touches > best.touches ||
      (evaluated.touches === best.touches && evaluated.endBarIndex > best.endBarIndex) ||
      (evaluated.touches === best.touches && evaluated.endBarIndex === best.endBarIndex && evaluated.score > best.score)
    ) {
      best = evaluated;
    }
  }
  return best;
}

function generateProgressiveRayCandidates(params: {
  symbol: string;
  timeframe: Timeframe;
  swings: SwingPoint[];
  bars: OhlcvBar[];
  direction: Exclude<TrendDirection, "SIDEWAYS">;
}) {
  const { symbol, timeframe, swings, bars, direction } = params;
  const anchorKind = direction === "BULLISH" ? "LOW" : "HIGH";
  const initialAnchor = buildInitialAnchor({ direction, bars, symbol, timeframe });
  const rawAnchors = swings
    .filter((swing) => swing.kind === anchorKind)
    .sort((a, b) => toEpochMs(a.timestamp) - toEpochMs(b.timestamp));
  const anchors = initialAnchor
    ? [initialAnchor, ...rawAnchors.filter((swing) => toEpochMs(swing.timestamp) > toEpochMs(initialAnchor.timestamp))]
    : rawAnchors;
  if (anchors.length < 2) {
    return [];
  }

  const rays: CandidateLine[] = [];
  let startAnchorIndex = 0;
  while (startAnchorIndex < anchors.length - 1 && rays.length < 16) {
    const startPoint = anchors[startAnchorIndex];
    const startBarIndex = anchorToBarIndex(bars, startPoint);
    const endpointCandidates = anchors
      .map((point, idx) => ({ point, idx, barIndex: anchorToBarIndex(bars, point) }))
      .filter((entry) => entry.idx > startAnchorIndex && entry.barIndex > startBarIndex);

    const selected = chooseBestEndpoint({
      bars,
      startPoint,
      direction,
      symbol,
      timeframe,
      endpointCandidates
    });

    if (selected) {
      rays.push(selected);
      const selectedIndex = anchors.findIndex((anchor) => anchor.timestamp === selected.endTime);
      if (selectedIndex > startAnchorIndex) {
        startAnchorIndex = selectedIndex;
      } else {
        startAnchorIndex += 1;
      }
    } else {
      startAnchorIndex += 1;
    }
  }

  return rays;
}

export function generateTrendlineCandidates(params: {
  symbol: string;
  timeframe: Timeframe;
  swings: SwingPoint[];
  bars: OhlcvBar[];
  direction: TrendDirection;
}) {
  const { symbol, timeframe, swings, bars, direction } = params;
  if (direction === "SIDEWAYS") {
    return [];
  }

  const progressive = generateProgressiveRayCandidates({
    symbol,
    timeframe,
    swings,
    bars,
    direction
  });

  return dedupeAndSort(progressive);
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
