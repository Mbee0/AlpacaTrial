export type Timeframe = "1Day" | "4Hour" | "1Hour" | "15Min";
export type PriceAdjustment = "raw" | "split" | "all";

export interface StrategyScoreWeights {
  trendStrength: number;
  trendlineQuality: number;
  breakoutStrength: number;
  volumeConfirmation: number;
  multiTimeframeAlignment: number;
  volatilitySuitability: number;
  riskReward: number;
}

export interface StrategyThresholds {
  longScore: number;
  shortScore: number;
  breakoutScore: number;
  watchScore: number;
  watchConfidencePenalty: number;
}

export interface StrategySettings {
  weights: StrategyScoreWeights;
  thresholds: StrategyThresholds;
}

export interface StrategySettingsInput {
  weights?: Partial<StrategyScoreWeights>;
  thresholds?: Partial<StrategyThresholds>;
}

export const DEFAULT_STRATEGY_SETTINGS: StrategySettings = {
  weights: {
    trendStrength: 22,
    trendlineQuality: 20,
    breakoutStrength: 18,
    volumeConfirmation: 10,
    multiTimeframeAlignment: 12,
    volatilitySuitability: 8,
    riskReward: 10
  },
  thresholds: {
    longScore: 70,
    shortScore: 72,
    breakoutScore: 55,
    watchScore: 55,
    watchConfidencePenalty: 8
  }
};

export type TrendDirection = "BULLISH" | "BEARISH" | "SIDEWAYS";
export type SignalType = "LONG" | "SHORT" | "WATCH" | "HOLD";
export type TrendlineKind = "ACTION" | "SAFETY" | "SAFETY_LOSS" | "CANDIDATE";

export interface OhlcvBar {
  symbol: string;
  timestamp: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SwingPoint {
  id?: string;
  symbol: string;
  timeframe: Timeframe;
  timestamp: string;
  price: number;
  kind: "HIGH" | "LOW";
  strength: number;
}

export interface Trendline {
  id?: string;
  symbol: string;
  timeframe: Timeframe;
  direction: TrendDirection;
  kind: TrendlineKind;
  startTime: string;
  endTime: string;
  startPrice: number;
  endPrice: number;
  slope: number;
  score: number;
  touches: number;
  violations: number;
}

export interface ScoreBreakdown {
  trendStrength: number;
  trendlineQuality: number;
  breakoutStrength: number;
  volumeConfirmation: number;
  multiTimeframeAlignment: number;
  volatilitySuitability: number;
  riskReward: number;
}

export interface StrategySignal {
  symbol: string;
  timeframe: Timeframe;
  signal: SignalType;
  trendDirection: TrendDirection;
  score: number;
  confidence: number;
  actionLine?: number;
  safetyLine?: number;
  safetyLossLine?: number;
  explanation: string[];
  breakdown: ScoreBreakdown;
}

export interface ScannerRow extends StrategySignal {
  lastPrice: number;
  riskPerShare?: number;
  plannedRMultiple?: number;
}
