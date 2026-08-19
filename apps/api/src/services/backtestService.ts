import { OhlcvBar, Timeframe } from "@trader/shared";
import { analyzeSymbol } from "../strategy/strategyEngine.js";

export interface BacktestTrade {
  symbol: string;
  entryTime: string;
  exitTime: string;
  entryPrice: number;
  exitPrice: number;
  qty: number;
  pnl: number;
  pnlPct: number;
  reason: "STOP" | "SIGNAL_FLIP" | "END_OF_TEST";
}

interface BacktestConfig {
  symbol: string;
  timeframe: Timeframe;
  bars: OhlcvBar[];
  startingBalance: number;
  riskPct: number;
  slippagePct: number;
  feePerTrade: number;
}

export function runBacktest(config: BacktestConfig) {
  const { symbol, timeframe, bars, startingBalance, riskPct, slippagePct, feePerTrade } = config;
  let equity = startingBalance;
  let peakEquity = startingBalance;
  let maxDrawdown = 0;
  let openPosition:
    | {
        entryTime: string;
        entryPrice: number;
        qty: number;
        stop: number;
      }
    | undefined;
  const trades: BacktestTrade[] = [];
  const equityCurve: Array<{ time: string; equity: number }> = [];

  for (let i = 80; i < bars.length; i += 1) {
    const view = bars.slice(0, i + 1);
    const bar = view[view.length - 1];
    const analysis = analyzeSymbol({ symbol, timeframe, bars: view });

    if (!openPosition && analysis.signal.signal === "LONG" && analysis.signal.actionLine && analysis.signal.safetyLine) {
      const riskAmount = equity * riskPct;
      const stopDistance = Math.max(0.01, analysis.signal.actionLine - analysis.signal.safetyLine);
      if (stopDistance > 0.01) {
        const qty = Math.floor(riskAmount / stopDistance);
        if (qty > 0) {
          const entryPrice = bar.close * (1 + slippagePct);
          openPosition = {
            entryTime: bar.timestamp,
            entryPrice,
            qty,
            stop: analysis.signal.safetyLine
          };
          equity -= feePerTrade;
        }
      }
    } else if (openPosition) {
      const stopHit = bar.low <= openPosition.stop;
      const signalFlip = analysis.signal.signal === "SHORT" || analysis.signal.signal === "HOLD";
      if (stopHit || signalFlip) {
        const exitPrice = (stopHit ? openPosition.stop : bar.close) * (1 - slippagePct);
        const pnl = (exitPrice - openPosition.entryPrice) * openPosition.qty - feePerTrade;
        equity += pnl;
        const pnlPct = (exitPrice - openPosition.entryPrice) / openPosition.entryPrice;
        trades.push({
          symbol,
          entryTime: openPosition.entryTime,
          exitTime: bar.timestamp,
          entryPrice: openPosition.entryPrice,
          exitPrice,
          qty: openPosition.qty,
          pnl,
          pnlPct,
          reason: stopHit ? "STOP" : "SIGNAL_FLIP"
        });
        openPosition = undefined;
      }
    }

    peakEquity = Math.max(peakEquity, equity);
    const drawdown = peakEquity === 0 ? 0 : (peakEquity - equity) / peakEquity;
    maxDrawdown = Math.max(maxDrawdown, drawdown);
    equityCurve.push({ time: bar.timestamp, equity });
  }

  if (openPosition) {
    const lastBar = bars[bars.length - 1];
    const exitPrice = lastBar.close * (1 - slippagePct);
    const pnl = (exitPrice - openPosition.entryPrice) * openPosition.qty - feePerTrade;
    equity += pnl;
    trades.push({
      symbol,
      entryTime: openPosition.entryTime,
      exitTime: lastBar.timestamp,
      entryPrice: openPosition.entryPrice,
      exitPrice,
      qty: openPosition.qty,
      pnl,
      pnlPct: (exitPrice - openPosition.entryPrice) / openPosition.entryPrice,
      reason: "END_OF_TEST"
    });
  }

  const wins = trades.filter((trade) => trade.pnl > 0);
  const losses = trades.filter((trade) => trade.pnl <= 0);
  const grossWin = wins.reduce((acc, trade) => acc + trade.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((acc, trade) => acc + trade.pnl, 0));
  const totalReturn = equity / startingBalance - 1;

  return {
    startingBalance,
    endingBalance: equity,
    totalReturnPct: totalReturn * 100,
    winRatePct: trades.length ? (wins.length / trades.length) * 100 : 0,
    avgWinner: wins.length ? grossWin / wins.length : 0,
    avgLoser: losses.length ? -grossLoss / Math.max(1, losses.length) : 0,
    profitFactor: grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? Number.POSITIVE_INFINITY : 0,
    trades: trades.length,
    maxDrawdownPct: maxDrawdown * 100,
    equityCurve,
    tradeList: trades
  };
}
