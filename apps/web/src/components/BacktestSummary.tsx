import { BacktestResponse } from "../types";

interface BacktestSummaryProps {
  backtest?: BacktestResponse;
  loading?: boolean;
}

function formatNumber(value: unknown, digits = 2, fallback = "—") {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : fallback;
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
            <span>${formatNumber(backtest.startingBalance)}</span>
          </div>
          <div className="score-card">
            <strong>Ending</strong>
            <span>${formatNumber(backtest.endingBalance)}</span>
          </div>
          <div className="score-card">
            <strong>Total Return</strong>
            <span>{formatNumber(backtest.totalReturnPct)}%</span>
          </div>
          <div className="score-card">
            <strong>Win Rate</strong>
            <span>{formatNumber(backtest.winRatePct)}%</span>
          </div>
          <div className="score-card">
            <strong>Profit Factor</strong>
            <span>{Number.isFinite(backtest.profitFactor) ? formatNumber(backtest.profitFactor) : "∞"}</span>
          </div>
          <div className="score-card">
            <strong>Max DD</strong>
            <span>{formatNumber(backtest.maxDrawdownPct)}%</span>
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
