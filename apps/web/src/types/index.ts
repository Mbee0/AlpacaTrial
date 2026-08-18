import { OhlcvBar, ScannerRow, SwingPoint, Trendline } from "@trader/shared";

export interface SymbolAnalysisResponse {
  symbol: string;
  timeframe: string;
  lastPrice: number;
  bars: OhlcvBar[];
  swings: SwingPoint[];
  trendlines: Trendline[];
  signal: ScannerRow;
  scannerRow: ScannerRow;
}

export interface ScannerResponse {
  timeframe: string;
  count: number;
  rows: ScannerRow[];
}

export interface BacktestResponse {
  symbol: string;
  timeframe: string;
  startingBalance: number;
  endingBalance: number;
  totalReturnPct: number;
  winRatePct: number;
  profitFactor: number;
  trades: number;
  maxDrawdownPct: number;
  tradeList: Array<{
    symbol: string;
    entryTime: string;
    exitTime: string;
    entryPrice: number;
    exitPrice: number;
    qty: number;
    pnl: number;
    pnlPct: number;
    reason: string;
  }>;
}
