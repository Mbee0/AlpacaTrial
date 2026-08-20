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

function buildPrimaryRay(params: { symbol: string; timeframe: Timeframe; bars: OhlcvBar[] }) {
  const { symbol, timeframe, bars } = params;
  if (bars.length < 2) {
    return null;
  }

  const firstBar = bars[0];
  const pointA: SwingPoint = {
    symbol,
    timeframe,
    timestamp: firstBar.timestamp,
    price: firstBar.low,
    kind: "LOW",
    strength: 0
  };
  let selected: RayEndpoint | null = null;
  let usedFallback = false;
  for (let index = 1; index < bars.length; index += 1) {
    const bar = bars[index];
    const runBars = index;
    if (runBars <= 0) {
      continue;
    }
    const rise = bar.low - pointA.price;
    const slopePerBar = rise / runBars;
    if (!Number.isFinite(slopePerBar) || slopePerBar < 0) {
      continue;
    }
    const barTime = new Date(bar.timestamp).getTime();
    const pointATime = new Date(pointA.timestamp).getTime();
    if (!Number.isFinite(pointATime) || !Number.isFinite(barTime) || barTime <= pointATime) {
      continue;
    }
    const slopePerMs = (bar.low - pointA.price) / (barTime - pointATime);
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
    let fallbackIndex = 1;
    let fallbackPrice = bars[1].low;
    for (let index = 2; index < bars.length; index += 1) {
      if (bars[index].low > fallbackPrice) {
        fallbackPrice = bars[index].low;
        fallbackIndex = index;
      }
    }
    const pointATime = new Date(pointA.timestamp).getTime();
    const fallbackTime = new Date(bars[fallbackIndex].timestamp).getTime();
    const fallbackSlopePerMs =
      Number.isFinite(pointATime) && Number.isFinite(fallbackTime) && fallbackTime > pointATime
        ? (bars[fallbackIndex].low - pointA.price) / (fallbackTime - pointATime)
        : 0;
    selected = {
      index: fallbackIndex,
      timestamp: bars[fallbackIndex].timestamp,
      price: bars[fallbackIndex].low,
      slopePerBar: Math.max(0, (bars[fallbackIndex].low - pointA.price) / Math.max(1, fallbackIndex)),
      slopePerMs: Number.isFinite(fallbackSlopePerMs) ? fallbackSlopePerMs : 0
    };
  }

  const pointB: SwingPoint = {
    symbol,
    timeframe,
    timestamp: selected.timestamp,
    price: selected.price,
    kind: "LOW",
    strength: 0
  };

  return {
    pointA,
    pointB,
    pointAIndex: 0,
    slopePerBar: selected.slopePerBar,
    slopePerMs: selected.slopePerMs,
    usedFallback
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

  const primaryRay = buildPrimaryRay({ symbol, timeframe, bars });
  if (!primaryRay) {
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

  const { pointA, pointB, pointAIndex, slopePerBar, slopePerMs, usedFallback } = primaryRay;
  const swings: SwingPoint[] = [pointA, pointB];
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2] ?? lastBar;
  const actionLine: Trendline = {
    symbol,
    timeframe,
    direction: "BULLISH",
    kind: "ACTION",
    startTime: pointA.timestamp,
    endTime: pointB.timestamp,
    startPrice: pointA.price,
    endPrice: pointB.price,
    slope: slopePerMs,
    score: 0,
    touches: 0,
    violations: 0
  };

  const actionLinePrice = linePriceAt(actionLine, lastBar.timestamp);
  const actionPrevPrice = linePriceAt(actionLine, prevBar.timestamp);
  const trendDirection: StrategySignal["trendDirection"] = lastBar.close >= actionLinePrice ? "BULLISH" : "BEARISH";

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
  for (let index = pointAIndex; index < bars.length; index += 1) {
    const bar = bars[index];
    const linePx = linePriceAt(actionLine, bar.timestamp);
    const proximity = Math.abs(bar.low - linePx) / Math.max(1e-9, bar.close);
    if (proximity <= 0.006) {
      touches += 1;
    }
    if (bar.low < linePx * 0.993) {
      violations += 1;
    }
  }

  const slopePctPerYear = ((slopePerMs * 86400000 * 252) / Math.max(1e-9, pointA.price)) * 100;
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
    `Point A anchored at first bar (${pointA.timestamp.slice(0, 10)}) low ${pointA.price.toFixed(2)}.`,
    `Point B chosen at ${pointB.timestamp.slice(0, 10)} low ${pointB.price.toFixed(2)} via minimum non-negative rise/run (${slopePerBar.toFixed(6)} per bar).`,
    usedFallback
      ? "No non-negative slope contact found; fallback selected highest reachable low as Point B."
      : "Point B is the first valid upward-contact candidate (minimum non-negative slope).",
    `A→B ray slope projects Action Line at ${actionLinePrice.toFixed(2)} (current close ${lastBar.close.toFixed(2)}).`,
    `Safety line derived from Action Line using ${(clampedSafetyLossBuffer * 100).toFixed(2)}% buffer at ${safetyLinePrice.toFixed(2)}.`,
    `Safety-loss line from close with same buffer at ${safetyLossLinePrice.toFixed(2)}.`,
    `Touches ${touches}, violations ${violations}, breakout ${breakoutStrength.toFixed(1)}, volume ${volumeConfirmation.toFixed(1)}.`
  ];

  if (actionLinePrice && actionPrevPrice) {
    const crossedUp = prevBar.close <= actionPrevPrice && lastBar.close > actionLinePrice;
    const crossedDown = prevBar.close >= actionPrevPrice && lastBar.close < actionLinePrice;
    if (crossedUp) {
      explanation.push("Latest candle crossed above the A→B ray.");
    } else if (crossedDown) {
      explanation.push("Latest candle crossed below the A→B ray.");
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

  const trendlinesForInspection: Trendline[] = [
    {
      ...actionLine,
      score: trendlineQuality,
      touches,
      violations
    }
  ];

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
