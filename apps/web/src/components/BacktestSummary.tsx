import { BacktestResponse } from "../types";

interface BacktestSummaryProps {
  backtest?: BacktestResponse;
}

export function BacktestSummary({ backtest }: BacktestSummaryProps) {
  return (
    <div className="panel backtest-panel">
      <h2>Backtest Snapshot</h2>
      {!backtest ? (
        <p className="muted">Run a symbol analysis to generate a paired backtest result.</p>
      ) : (
        <div className="score-grid">
          <div className="score-card">
            <strong>Starting</strong>
            <span>${backtest.startingBalance.toFixed(2)}</span>
          </div>
          <div className="score-card">
            <strong>Ending</strong>
            <span>${backtest.endingBalance.toFixed(2)}</span>
          </div>
          <div className="score-card">
            <strong>Total Return</strong>
            <span>{backtest.totalReturnPct.toFixed(2)}%</span>
          </div>
          <div className="score-card">
            <strong>Win Rate</strong>
            <span>{backtest.winRatePct.toFixed(2)}%</span>
          </div>
          <div className="score-card">
            <strong>Profit Factor</strong>
            <span>{Number.isFinite(backtest.profitFactor) ? backtest.profitFactor.toFixed(2) : "∞"}</span>
          </div>
          <div className="score-card">
            <strong>Max DD</strong>
            <span>{backtest.maxDrawdownPct.toFixed(2)}%</span>
          </div>
          <div className="score-card">
            <strong>Trades</strong>
            <span>{backtest.trades}</span>
          </div>
        </div>
      )}
    </div>
  );
}
