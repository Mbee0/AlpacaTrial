import { BacktestResponse } from "../types";

interface BacktestSummaryProps {
  backtest?: BacktestResponse;
  loading?: boolean;
}

export function BacktestSummary({ backtest, loading = false }: BacktestSummaryProps) {
  return (
    <div className="panel backtest-panel">
      <h2 className="title-with-hint">
        Backtest Snapshot
        <span className="title-hint">Historical simulation summary for this symbol and timeframe.</span>
      </h2>
      {!backtest ? (
        loading ? (
          <div className="score-grid">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={`backtest-skeleton-${index}`} className="score-card">
                <span className="bubble-skeleton" />
                <span className="bubble-skeleton short" />
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">Run a symbol analysis to generate a paired backtest result.</p>
        )
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
