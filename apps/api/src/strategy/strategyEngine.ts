import { ScannerRow, ScoreBreakdown, StrategySignal, Timeframe, Trendline } from "@trader/shared";
import { OhlcvBar } from "@trader/shared";
import { detectSwingPoints } from "./swingPoints.js";
import { detectTrendDirection, generateTrendlineCandidates } from "./trendlines.js";

interface SymbolAnalysisResult {
  signal: StrategySignal;
  swings: ReturnType<typeof detectSwingPoints>;
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

function scoreSignal(params: {
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

  const score =
    breakdown.trendStrength * 0.22 +
    breakdown.trendlineQuality * 0.2 +
    breakdown.breakoutStrength * 0.18 +
    breakdown.volumeConfirmation * 0.1 +
    breakdown.multiTimeframeAlignment * 0.12 +
    breakdown.volatilitySuitability * 0.08 +
    breakdown.riskReward * 0.1;

  return {
    score: clamp(score, 0, 100),
    breakdown
  };
}

function classifySignal(params: {
  trendDirection: StrategySignal["trendDirection"];
  score: number;
  breakoutStrength: number;
}) {
  const { trendDirection, score, breakoutStrength } = params;
  if (trendDirection === "BULLISH" && score >= 70 && breakoutStrength >= 55) {
    return "LONG" as const;
  }
  if (trendDirection === "BEARISH" && score >= 72 && breakoutStrength >= 55) {
    return "SHORT" as const;
  }
  if (score >= 55) {
    return "WATCH" as const;
  }
  return "HOLD" as const;
}

function pickLatestLine(candidates: Trendline[]) {
  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort((a, b) => {
    const endDiff = new Date(b.endTime).getTime() - new Date(a.endTime).getTime();
    if (endDiff !== 0) {
      return endDiff;
    }
    return b.score - a.score;
  })[0];
}

export function analyzeSymbol(params: {
  symbol: string;
  timeframe: Timeframe;
  bars: OhlcvBar[];
  higherTimeframeDirection?: "BULLISH" | "BEARISH" | "SIDEWAYS";
  safetyLossBufferPct?: number;
}): SymbolAnalysisResult {
  const { symbol, timeframe, bars, higherTimeframeDirection, safetyLossBufferPct = 0.01 } = params;
  const swings = detectSwingPoints({ symbol, timeframe, bars });
  let trendDirection = detectTrendDirection(swings);
  const bullishCandidates = generateTrendlineCandidates({
    symbol,
    timeframe,
    swings,
    bars,
    direction: "BULLISH"
  });
  const bearishCandidates = generateTrendlineCandidates({
    symbol,
    timeframe,
    swings,
    bars,
    direction: "BEARISH"
  });

  const bullishStrength = bullishCandidates[0]?.score ?? Number.NEGATIVE_INFINITY;
  const bearishStrength = bearishCandidates[0]?.score ?? Number.NEGATIVE_INFINITY;
  if (trendDirection === "SIDEWAYS") {
    if (bullishStrength > bearishStrength + 5) {
      trendDirection = "BULLISH";
    } else if (bearishStrength > bullishStrength + 5) {
      trendDirection = "BEARISH";
    }
  }

  const activeCandidates =
    trendDirection === "BULLISH"
      ? bullishCandidates
      : trendDirection === "BEARISH"
        ? bearishCandidates
        : bullishStrength >= bearishStrength
          ? bullishCandidates
          : bearishCandidates;
  const opposingCandidates = activeCandidates === bullishCandidates ? bearishCandidates : bullishCandidates;
  const baseAction = pickLatestLine(activeCandidates);
  const baseSafety = pickLatestLine(opposingCandidates) ?? pickLatestLine(activeCandidates.slice(0, -1));
  const actionLine = baseAction ? { ...baseAction, kind: "ACTION" as const } : undefined;
  const safetyLine = baseSafety ? { ...baseSafety, kind: "SAFETY" as const } : undefined;
  const lastBar = bars[bars.length - 1];
  const prevBar = bars[bars.length - 2] ?? lastBar;

  const actionLinePrice = actionLine ? linePriceAt(actionLine, lastBar.timestamp) : undefined;
  const actionPrevPrice = actionLine ? linePriceAt(actionLine, prevBar.timestamp) : undefined;
  const safetyLinePrice = safetyLine ? linePriceAt(safetyLine, lastBar.timestamp) : undefined;
  const clampedSafetyLossBuffer = clamp(safetyLossBufferPct, 0.001, 0.2);
  const safetyLossLinePrice =
    trendDirection === "BEARISH"
      ? lastBar.close * (1 + clampedSafetyLossBuffer)
      : lastBar.close * (1 - clampedSafetyLossBuffer);

  const trendStrength = trendDirection === "SIDEWAYS" ? 35 : 68 + Math.min(20, swings.length);
  const trendlineQuality = actionLine ? clamp(actionLine.score, 0, 100) : 20;
  const breakoutStrength = actionLinePrice
    ? trendDirection === "BEARISH"
      ? clamp(((actionLinePrice - lastBar.close) / lastBar.close) * 2200 + 50, 0, 100)
      : clamp(((lastBar.close - actionLinePrice) / lastBar.close) * 2200 + 50, 0, 100)
    : 30;
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

  const riskPerShare = actionLinePrice && safetyLinePrice ? Math.abs(actionLinePrice - safetyLinePrice) : undefined;
  const rewardProxy = actionLinePrice ? Math.abs(lastBar.close - actionLinePrice) : 0;
  const riskReward =
    riskPerShare && riskPerShare > 0 ? clamp((rewardProxy / riskPerShare) * 50, 10, 95) : 40;

  const { score, breakdown } = scoreSignal({
    trendStrength,
    trendlineQuality,
    breakoutStrength,
    volumeConfirmation,
    multiTimeframeAlignment,
    volatilitySuitability,
    riskReward
  });

  const signalType = classifySignal({ trendDirection, score, breakoutStrength });
  const confidence = clamp(score + (signalType === "WATCH" ? -8 : 0), 0, 100);

  const explanation = [
    `Trend classification on ${timeframe}: ${trendDirection}.`,
    actionLine ? `Action Line score ${actionLine.score.toFixed(1)} with ${actionLine.touches} touches.` : "No robust Action Line detected.",
    safetyLine ? `Safety Line projected at ${safetyLinePrice?.toFixed(2)}.` : "Safety Line unavailable; risk estimates are conservative.",
    `Safety-loss line uses ${(clampedSafetyLossBuffer * 100).toFixed(2)}% buffer at ${safetyLossLinePrice.toFixed(2)}.`,
    `Ray engine found ${bullishCandidates.length} bullish support rays and ${bearishCandidates.length} bearish resistance rays.`,
    `Breakout strength ${breakoutStrength.toFixed(1)} and volume confirmation ${volumeConfirmation.toFixed(1)}.`,
    `Multi-timeframe alignment score ${multiTimeframeAlignment.toFixed(1)}.`
  ];

  if (actionLinePrice && actionPrevPrice) {
    const crossedUp = prevBar.close <= actionPrevPrice && lastBar.close > actionLinePrice;
    const crossedDown = prevBar.close >= actionPrevPrice && lastBar.close < actionLinePrice;
    if (crossedUp) {
      explanation.push("Latest candle crossed above Action Line (bullish trigger condition).");
    } else if (crossedDown) {
      explanation.push("Latest candle crossed below Action Line (bearish trigger condition).");
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

  const trendlinesForInspection: Trendline[] = [];
  const seen = new Set<string>();
  const pushUnique = (line: Trendline | undefined) => {
    if (!line) {
      return;
    }
    const key = `${line.kind}:${line.direction}:${line.startTime}:${line.endTime}`;
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    trendlinesForInspection.push(line);
  };

  pushUnique(actionLine);
  pushUnique(safetyLine);
  pushUnique({
    symbol,
    timeframe,
    direction: trendDirection,
    kind: "SAFETY_LOSS",
    startTime: bars[Math.max(0, bars.length - 40)].timestamp,
    endTime: lastBar.timestamp,
    startPrice: safetyLossLinePrice,
    endPrice: safetyLossLinePrice,
    slope: 0,
    score: 100,
    touches: 0,
    violations: 0
  });
  activeCandidates.slice(0, 4).forEach(pushUnique);
  opposingCandidates.slice(0, 4).forEach(pushUnique);

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
