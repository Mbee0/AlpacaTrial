import {
  DEFAULT_STRATEGY_SETTINGS,
  ScannerRow,
  ScoreBreakdown,
  StrategySettings,
  StrategySettingsInput,
  StrategySignal,
  SwingPoint,
  Timeframe,
  Trendline
} from "@trader/shared";
import { OhlcvBar } from "@trader/shared";

interface SymbolAnalysisResult {
  signal: StrategySignal;
  swings: SwingPoint[];
  trendlines: Trendline[];
}

function linePriceAt(trendline: Trendline, timestamp: string) {
  const x1 = new Date(trendline.startTime).getTime();
  const x = new Date(timestamp).getTime();
  return trendline.startPrice + trendline.slope * (x - x1);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

interface RayEndpoint {
  index: number;
  timestamp: string;
  price: number;
  slopePerBar: number;
  slopePerMs: number;
}

interface ChainedRaySegment {
  startIndex: number;
  endIndex: number;
  startPoint: SwingPoint;
  endPoint: SwingPoint;
  slopePerBar: number;
  slopePerMs: number;
  direction: Trendline["direction"];
  usedFallback: boolean;
}

function selectEndpointFromAnchor(params: {
  bars: OhlcvBar[];
  anchorIndex: number;
  anchorPrice: number;
  anchorTimeMs: number;
}) {
  const { bars, anchorIndex, anchorPrice, anchorTimeMs } = params;
  let selected: RayEndpoint | null = null;
  let usedFallback = false;

  for (let index = anchorIndex + 1; index < bars.length; index += 1) {
    const bar = bars[index];
    const runBars = index - anchorIndex;
    if (runBars <= 0) {
      continue;
    }
    const rise = bar.low - anchorPrice;
    const slopePerBar = rise / runBars;
    if (!Number.isFinite(slopePerBar)) {
      continue;
    }
    const barTime = new Date(bar.timestamp).getTime();
    if (!Number.isFinite(barTime) || barTime <= anchorTimeMs) {
      continue;
    }
    const slopePerMs = (bar.low - anchorPrice) / (barTime - anchorTimeMs);
    if (!Number.isFinite(slopePerMs)) {
      continue;
    }
    if (
      !selected ||
      slopePerBar < selected.slopePerBar - 1e-9 ||
      (Math.abs(slopePerBar - selected.slopePerBar) <= 1e-9 && index < selected.index)
    ) {
      selected = {
        index,
        timestamp: bar.timestamp,
        price: bar.low,
        slopePerBar,
        slopePerMs
      };
    }
  }

  if (!selected) {
    usedFallback = true;
    let fallbackIndex = anchorIndex + 1;
    let fallbackPrice = bars[fallbackIndex].low;
    for (let index = anchorIndex + 2; index < bars.length; index += 1) {
      if (bars[index].low > fallbackPrice) {
        fallbackPrice = bars[index].low;
        fallbackIndex = index;
      }
    }
    const fallbackTime = new Date(bars[fallbackIndex].timestamp).getTime();
    const fallbackSlopePerMs =
      Number.isFinite(fallbackTime) && fallbackTime > anchorTimeMs
        ? (bars[fallbackIndex].low - anchorPrice) / (fallbackTime - anchorTimeMs)
        : 0;
    selected = {
      index: fallbackIndex,
      timestamp: bars[fallbackIndex].timestamp,
      price: bars[fallbackIndex].low,
      slopePerBar: (bars[fallbackIndex].low - anchorPrice) / Math.max(1, fallbackIndex - anchorIndex),
      slopePerMs: Number.isFinite(fallbackSlopePerMs) ? fallbackSlopePerMs : 0
    };
  }

  return { endpoint: selected, usedFallback };
}

function buildRayChain(params: { symbol: string; timeframe: Timeframe; bars: OhlcvBar[] }) {
  const { symbol, timeframe, bars } = params;
  if (bars.length < 2) {
    return null;
  }

  let pointAIndex = 0;
  // Keep at least one forward bar so A->B is a forward ray.
  for (let index = 1; index < bars.length - 1; index += 1) {
    if (bars[index].low < bars[pointAIndex].low) {
      pointAIndex = index;
    }
  }

  const pointA = {
    symbol,
    timeframe,
    timestamp: bars[pointAIndex].timestamp,
    price: bars[pointAIndex].low,
    kind: "LOW",
    strength: 0
  } as SwingPoint;
  const swings: SwingPoint[] = [pointA];
  const segments: ChainedRaySegment[] = [];
  let anyFallback = false;
  let currentIndex = pointAIndex;

  while (currentIndex < bars.length - 1) {
    const anchorBar = bars[currentIndex];
    const anchorPoint: SwingPoint = {
      symbol,
      timeframe,
      timestamp: anchorBar.timestamp,
      price: anchorBar.low,
      kind: "LOW",
      strength: 0
    };
    const anchorTimeMs = new Date(anchorPoint.timestamp).getTime();
    if (!Number.isFinite(anchorTimeMs)) {
      break;
    }
    const selection = selectEndpointFromAnchor({
      bars,
      anchorIndex: currentIndex,
      anchorPrice: anchorPoint.price,
      anchorTimeMs
    });
    const endpoint = selection.endpoint;
    const endPoint: SwingPoint = {
      symbol,
      timeframe,
      timestamp: endpoint.timestamp,
      price: endpoint.price,
      kind: "LOW",
      strength: 0
    };
    segments.push({
      startIndex: currentIndex,
      endIndex: endpoint.index,
      startPoint: anchorPoint,
      endPoint,
      slopePerBar: endpoint.slopePerBar,
      slopePerMs: endpoint.slopePerMs,
      direction: endpoint.slopePerBar < 0 ? "BEARISH" : "BULLISH",
      usedFallback: selection.usedFallback
    });
    anyFallback = anyFallback || selection.usedFallback;
    swings.push(endPoint);
    if (endpoint.index <= currentIndex) {
      break;
    }
    currentIndex = endpoint.index;
  }

  if (segments.length === 0) {
    return null;
  }
  return {
    anchorIndex: pointAIndex,
    segments,
    swings,
    anyFallback
  };
}

function resolveStrategySettings(settings?: StrategySettingsInput): StrategySettings {
  const normalizedNumber = (value: unknown, fallback: number, min = 0, max = 100) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? clamp(parsed, min, max) : fallback;
  };
  const mergedWeights = {
    ...DEFAULT_STRATEGY_SETTINGS.weights,
    ...(settings?.weights ?? {})
  };
  const mergedThresholds = {
    ...DEFAULT_STRATEGY_SETTINGS.thresholds,
    ...(settings?.thresholds ?? {})
  };

  return {
    weights: {
      trendStrength: normalizedNumber(
        mergedWeights.trendStrength,
        DEFAULT_STRATEGY_SETTINGS.weights.trendStrength
      ),
      trendlineQuality: normalizedNumber(
        mergedWeights.trendlineQuality,
        DEFAULT_STRATEGY_SETTINGS.weights.trendlineQuality
      ),
      breakoutStrength: normalizedNumber(
        mergedWeights.breakoutStrength,
        DEFAULT_STRATEGY_SETTINGS.weights.breakoutStrength
      ),
      volumeConfirmation: normalizedNumber(
        mergedWeights.volumeConfirmation,
        DEFAULT_STRATEGY_SETTINGS.weights.volumeConfirmation
      ),
      multiTimeframeAlignment: normalizedNumber(
        mergedWeights.multiTimeframeAlignment,
        DEFAULT_STRATEGY_SETTINGS.weights.multiTimeframeAlignment
      ),
      volatilitySuitability: normalizedNumber(
        mergedWeights.volatilitySuitability,
        DEFAULT_STRATEGY_SETTINGS.weights.volatilitySuitability
      ),
      riskReward: normalizedNumber(mergedWeights.riskReward, DEFAULT_STRATEGY_SETTINGS.weights.riskReward)
    },
    thresholds: {
      longScore: normalizedNumber(mergedThresholds.longScore, DEFAULT_STRATEGY_SETTINGS.thresholds.longScore),
      shortScore: normalizedNumber(mergedThresholds.shortScore, DEFAULT_STRATEGY_SETTINGS.thresholds.shortScore),
      breakoutScore: normalizedNumber(
        mergedThresholds.breakoutScore,
        DEFAULT_STRATEGY_SETTINGS.thresholds.breakoutScore
      ),
      watchScore: normalizedNumber(mergedThresholds.watchScore, DEFAULT_STRATEGY_SETTINGS.thresholds.watchScore),
      watchConfidencePenalty: normalizedNumber(
        mergedThresholds.watchConfidencePenalty,
        DEFAULT_STRATEGY_SETTINGS.thresholds.watchConfidencePenalty
      )
    }
  };
}

function scoreSignal(params: {
  settings: StrategySettings;
  trendStrength: number;
  trendlineQuality: number;
  breakoutStrength: number;
  volumeConfirmation: number;
  multiTimeframeAlignment: number;
  volatilitySuitability: number;
  riskReward: number;
}) {
  const breakdown: ScoreBreakdown = {
    trendStrength: clamp(params.trendStrength, 0, 100),
    trendlineQuality: clamp(params.trendlineQuality, 0, 100),
    breakoutStrength: clamp(params.breakoutStrength, 0, 100),
    volumeConfirmation: clamp(params.volumeConfirmation, 0, 100),
    multiTimeframeAlignment: clamp(params.multiTimeframeAlignment, 0, 100),
    volatilitySuitability: clamp(params.volatilitySuitability, 0, 100),
    riskReward: clamp(params.riskReward, 0, 100)
  };

  const weights = params.settings.weights;
  const weightTotal = Math.max(
    1e-9,
    weights.trendStrength +
      weights.trendlineQuality +
      weights.breakoutStrength +
      weights.volumeConfirmation +
      weights.multiTimeframeAlignment +
      weights.volatilitySuitability +
      weights.riskReward
  );
  const score =
    (breakdown.trendStrength * weights.trendStrength +
      breakdown.trendlineQuality * weights.trendlineQuality +
      breakdown.breakoutStrength * weights.breakoutStrength +
      breakdown.volumeConfirmation * weights.volumeConfirmation +
      breakdown.multiTimeframeAlignment * weights.multiTimeframeAlignment +
      breakdown.volatilitySuitability * weights.volatilitySuitability +
      breakdown.riskReward * weights.riskReward) /
    weightTotal;

  return {
    score: clamp(score, 0, 100),
    breakdown
  };
}

function classifySignal(params: {
  settings: StrategySettings;
  trendDirection: StrategySignal["trendDirection"];
  score: number;
  breakoutStrength: number;
}) {
  const { trendDirection, score, breakoutStrength, settings } = params;
  if (
    trendDirection === "BULLISH" &&
    score >= settings.thresholds.longScore &&
    breakoutStrength >= settings.thresholds.breakoutScore
  ) {
    return "LONG" as const;
  }
  if (
    trendDirection === "BEARISH" &&
    score >= settings.thresholds.shortScore &&
    breakoutStrength >= settings.thresholds.breakoutScore
  ) {
    return "SHORT" as const;
  }
  if (score >= settings.thresholds.watchScore) {
    return "WATCH" as const;
  }
  return "HOLD" as const;
}

export function analyzeSymbol(params: {
  symbol: string;
  timeframe: Timeframe;
  bars: OhlcvBar[];
  higherTimeframeDirection?: "BULLISH" | "BEARISH" | "SIDEWAYS";
  safetyLossBufferPct?: number;
  strategySettings?: StrategySettingsInput;
}): SymbolAnalysisResult {
  const {
    symbol,
    timeframe,
    bars,
    higherTimeframeDirection,
    safetyLossBufferPct = 0.01,
    strategySettings
  } = params;
  const resolvedSettings = resolveStrategySettings(strategySettings);
  if (bars.length < 2) {
    const fallbackSignal: StrategySignal = {
      symbol,
      timeframe,
      signal: "HOLD",
      trendDirection: "SIDEWAYS",
      score: 0,
      confidence: 0,
      explanation: ["Not enough bar history to build the A→B baseline ray."],
      breakdown: {
        trendStrength: 0,
        trendlineQuality: 0,
        breakoutStrength: 0,
        volumeConfirmation: 0,
        multiTimeframeAlignment: 0,
        volatilitySuitability: 0,
        riskReward: 0
      }
    };
    return { signal: fallbackSignal, swings: [], trendlines: [] };
  }

  const rayChain = buildRayChain({ symbol, timeframe, bars });
  if (!rayChain || rayChain.segments.length === 0) {
    const fallbackSignal: StrategySignal = {
      symbol,
      timeframe,
      signal: "HOLD",
      trendDirection: "SIDEWAYS",
      score: 0,
      confidence: 0,
      explanation: ["Could not construct a valid A→B ray from available history."],
      breakdown: {
        trendStrength: 0,
        trendlineQuality: 0,
        breakoutStrength: 0,
        volumeConfirmation: 0,
        multiTimeframeAlignment: 0,
        volatilitySuitability: 0,
        riskReward: 0
      }
    };
    return { signal: fallbackSignal, swings: [], trendlines: [] };
  }

  const { segments, swings, anyFallback } = rayChain;
  const firstSegment = segments[0];
  const activeSegment = segments[segments.length - 1];
  const secondSegment = segments.length > 1 ? segments[1] : undefined;
  const pointA = firstSegment.startPoint;
  const pointB = firstSegment.endPoint;
  const pointC = secondSegment?.endPoint;
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2] ?? lastBar;
  const actionLine: Trendline = {
    symbol,
    timeframe,
    direction: activeSegment.direction,
    kind: "ACTION",
    startTime: activeSegment.startPoint.timestamp,
    endTime: activeSegment.endPoint.timestamp,
    startPrice: activeSegment.startPoint.price,
    endPrice: activeSegment.endPoint.price,
    slope: activeSegment.slopePerMs,
    score: 0,
    touches: 0,
    violations: 0
  };
  const activeStartIndex = activeSegment.startIndex;
  const activeSlopePerMs = activeSegment.slopePerMs;
  const activeSlopePerBar = activeSegment.slopePerBar;
  const activeStartPrice = activeSegment.startPoint.price;
  const activeRayLabel = `${actionLine.startTime.slice(0, 10)}→${actionLine.endTime.slice(0, 10)}`;

  const actionLinePrice = linePriceAt(actionLine, lastBar.timestamp);
  const actionPrevPrice = linePriceAt(actionLine, prevBar.timestamp);
  const trendDirection: StrategySignal["trendDirection"] = actionLine.direction;

  const clampedSafetyLossBuffer = clamp(safetyLossBufferPct, 0.001, 0.2);
  const safetyLinePrice =
    trendDirection === "BEARISH"
      ? actionLinePrice * (1 + clampedSafetyLossBuffer)
      : actionLinePrice * (1 - clampedSafetyLossBuffer);
  const safetyLossLinePrice =
    trendDirection === "BEARISH"
      ? lastBar.close * (1 + clampedSafetyLossBuffer)
      : lastBar.close * (1 - clampedSafetyLossBuffer);

  let touches = 0;
  let violations = 0;
  for (let index = activeStartIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    const linePx = linePriceAt(actionLine, bar.timestamp);
    const referencePrice = trendDirection === "BEARISH" ? bar.high : bar.low;
    const proximity = Math.abs(referencePrice - linePx) / Math.max(1e-9, bar.close);
    if (proximity <= 0.006) {
      touches += 1;
    }
    if (trendDirection === "BEARISH") {
      if (bar.high > linePx * 1.007) {
        violations += 1;
      }
    } else if (bar.low < linePx * 0.993) {
      violations += 1;
    }
  }

  const slopePctPerYear = ((activeSlopePerMs * 86400000 * 252) / Math.max(1e-9, activeStartPrice)) * 100;
  const trendStrength = clamp(50 + slopePctPerYear * 0.18, 5, 95);
  const trendlineQuality = clamp(55 + touches * 2.2 - violations * 6.5, 0, 100);
  const breakoutStrength =
    trendDirection === "BEARISH"
      ? clamp(((actionLinePrice - lastBar.close) / Math.max(1e-9, lastBar.close)) * 2200 + 50, 0, 100)
      : clamp(((lastBar.close - actionLinePrice) / Math.max(1e-9, lastBar.close)) * 2200 + 50, 0, 100);
  const avgVolume = bars.slice(-20).reduce((acc, bar) => acc + bar.volume, 0) / Math.max(1, bars.slice(-20).length);
  const volumeConfirmation = clamp((lastBar.volume / Math.max(1, avgVolume)) * 50, 0, 100);
  const multiTimeframeAlignment =
    higherTimeframeDirection && higherTimeframeDirection === trendDirection ? 85 : higherTimeframeDirection ? 45 : 60;
  const averageRangePct =
    bars
      .slice(-20)
      .reduce((acc, bar) => acc + (bar.high - bar.low) / Math.max(1e-9, bar.close), 0) /
    Math.max(1, bars.slice(-20).length);
  const volatilitySuitability = clamp((0.035 - Math.abs(averageRangePct - 0.02)) * 2800, 20, 95);

  const riskPerShare = Math.abs(actionLinePrice - safetyLinePrice);
  const rewardProxy = Math.abs(lastBar.close - actionLinePrice);
  const riskReward = riskPerShare > 0 ? clamp((rewardProxy / riskPerShare) * 50, 10, 95) : 40;

  const { score, breakdown } = scoreSignal({
    settings: resolvedSettings,
    trendStrength,
    trendlineQuality,
    breakoutStrength,
    volumeConfirmation,
    multiTimeframeAlignment,
    volatilitySuitability,
    riskReward
  });

  const signalType = classifySignal({ settings: resolvedSettings, trendDirection, score, breakoutStrength });
  const confidence = clamp(
    score + (signalType === "WATCH" ? -resolvedSettings.thresholds.watchConfidencePenalty : 0),
    0,
    100
  );

  const explanation = [
    `Point A anchored at timeframe low (${pointA.timestamp.slice(0, 10)}) price ${pointA.price.toFixed(2)}.`,
    `Point B chosen at ${pointB.timestamp.slice(0, 10)} low ${pointB.price.toFixed(2)} via minimum rise/run (${firstSegment.slopePerBar.toFixed(6)} per bar).`,
    pointC
      ? `Point C chosen from Point B at ${pointC.timestamp.slice(0, 10)} low ${pointC.price.toFixed(2)} via minimum rise/run (${(secondSegment?.slopePerBar ?? 0).toFixed(6)} per bar).`
      : "Point C unavailable because there are not enough forward bars after Point B.",
    firstSegment.slopePerBar < 0
        ? "Selected rise/run is negative, so the A→B action line is bearish (red)."
        : "Selected rise/run is non-negative, so the A→B action line is bullish (green).",
    anyFallback
      ? "At least one chained step required fallback because no valid slope candidate was found."
      : "Each chained step used the minimum rise/run selector without fallback.",
    `Built ${segments.length} chained rays toward present; active ray ${activeRayLabel} uses rise/run ${activeSlopePerBar.toFixed(6)} per bar.`,
    `Active ray projects Action Line at ${actionLinePrice.toFixed(2)} (current close ${lastBar.close.toFixed(2)}).`,
    `Safety line derived from Action Line using ${(clampedSafetyLossBuffer * 100).toFixed(2)}% buffer at ${safetyLinePrice.toFixed(2)}.`,
    `Safety-loss line from close with same buffer at ${safetyLossLinePrice.toFixed(2)}.`,
    `Touches ${touches}, violations ${violations}, breakout ${breakoutStrength.toFixed(1)}, volume ${volumeConfirmation.toFixed(1)}.`
  ];

  if (actionLinePrice && actionPrevPrice) {
    const crossedUp = prevBar.close <= actionPrevPrice && lastBar.close > actionLinePrice;
    const crossedDown = prevBar.close >= actionPrevPrice && lastBar.close < actionLinePrice;
    if (crossedUp) {
      explanation.push(`Latest candle crossed above the active ray (${activeRayLabel}).`);
    } else if (crossedDown) {
      explanation.push(`Latest candle crossed below the active ray (${activeRayLabel}).`);
    }
  }

  const signal: StrategySignal = {
    symbol,
    timeframe,
    signal: signalType,
    trendDirection,
    score,
    confidence,
    actionLine: actionLinePrice,
    safetyLine: safetyLinePrice,
    safetyLossLine: safetyLossLinePrice,
    explanation,
    breakdown
  };

  const trendlinesForInspection: Trendline[] = segments.map((segment, index) => {
    const isActive = index === segments.length - 1;
    return {
      symbol,
      timeframe,
      direction: segment.direction,
      kind: "ACTION",
      startTime: segment.startPoint.timestamp,
      endTime: segment.endPoint.timestamp,
      startPrice: segment.startPoint.price,
      endPrice: segment.endPoint.price,
      slope: segment.slopePerMs,
      score: isActive ? trendlineQuality : clamp(45 + Math.min(45, Math.abs(segment.slopePerBar) * 4000), 0, 100),
      touches: isActive ? touches : 0,
      violations: isActive ? violations : 0
    };
  });

  return {
    signal,
    swings,
    trendlines: trendlinesForInspection
  };
}

export function scannerRowFromSignal(params: {
  signal: StrategySignal;
  lastPrice: number;
}): ScannerRow {
  const { signal, lastPrice } = params;
  const riskPerShare =
    signal.actionLine && signal.safetyLine ? Math.abs(signal.actionLine - signal.safetyLine) : undefined;

  return {
    ...signal,
    lastPrice,
    riskPerShare,
    plannedRMultiple:
      riskPerShare && signal.actionLine ? Math.abs(lastPrice - signal.actionLine) / Math.max(1e-9, riskPerShare) : undefined
  };
}
