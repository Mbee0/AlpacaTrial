import { PortfolioSummaryResponse } from "../types";

interface PortfolioPageProps {
  data?: PortfolioSummaryResponse;
  loading: boolean;
  error?: string;
  onSelectSymbol: (symbol: string) => void;
}

function formatNumber(value: unknown, digits: number, fallback = "0.00"): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric.toFixed(digits);
}

export function PortfolioPage({ data, loading, error, onSelectSymbol }: PortfolioPageProps) {
  return (
    <section className="portfolio-page">
      <div className="panel">
        <h2>Portfolio Overview</h2>
        <p className="muted">Broker-synced snapshot and risk controls used for paper-trading safeguards.</p>
        {error && <div className="error">{error}</div>}
        {loading && !error ? (
          <div className="panel-loader">
            <div className="wave-loader" role="status" aria-label="Loading portfolio summary">
              <span className="wave-dot" />
              <span className="wave-dot" />
              <span className="wave-dot" />
            </div>
          </div>
        ) : !error && (
          <div className="score-grid">
            <div className="score-card">
              <strong>Live Trading</strong>
              <span>{data?.liveTradingEnabled ? "ENABLED" : "DISABLED"}</span>
            </div>
            <div className="score-card">
              <strong>Risk / Trade</strong>
              <span>{formatNumber((data?.riskControls.defaultRiskPct ?? 0) * 100, 2)}%</span>
            </div>
            <div className="score-card">
              <strong>Max Positions</strong>
              <span>{data?.riskControls.maxPositions ?? 0}</span>
            </div>
            <div className="score-card">
              <strong>Max DD</strong>
              <span>{formatNumber((data?.riskControls.maxDrawdownPct ?? 0) * 100, 2)}%</span>
            </div>
            <div className="score-card">
              <strong>Equity</strong>
              <span>${formatNumber(data?.latestSnapshot?.equity ?? 0, 2)}</span>
            </div>
            <div className="score-card">
              <strong>Cash</strong>
              <span>${formatNumber(data?.latestSnapshot?.cash ?? 0, 2)}</span>
            </div>
          </div>
        )}
      </div>

      <div className="panel">
        <h2>Positions</h2>
        <p className="muted">Click a symbol to inspect it on the dashboard chart with all rays and tracking lines.</p>
        {loading && !error ? (
          <div className="panel-loader">
            <div className="wave-loader" role="status" aria-label="Loading portfolio positions">
              <span className="wave-dot" />
              <span className="wave-dot" />
              <span className="wave-dot" />
            </div>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Symbol</th>
                  <th>Side</th>
                  <th>Qty</th>
                  <th>Avg Entry</th>
                  <th>Current</th>
                  <th>Market Value</th>
                  <th>Unrealized P/L</th>
                  <th>Realized P/L</th>
                  <th>Stop</th>
                  <th>Risk</th>
                </tr>
              </thead>
              <tbody>
                {(data?.positions ?? []).map((position) => (
                  <tr key={`${position.symbol}-${position.observedAt}`} onClick={() => onSelectSymbol(position.symbol)}>
                    <td>{position.symbol}</td>
                    <td>{position.side}</td>
                    <td>{formatNumber(position.qty, 2)}</td>
                    <td>{formatNumber(position.avgEntryPrice, 2)}</td>
                    <td>{formatNumber(position.currentPrice, 2)}</td>
                    <td>{formatNumber(position.marketValue, 2)}</td>
                    <td style={{ color: Number(position.unrealizedPnl) >= 0 ? "#1ed67c" : "#ff5a7d" }}>
                      {formatNumber(position.unrealizedPnl, 2)}
                    </td>
                    <td style={{ color: Number(position.realizedPnl) >= 0 ? "#1ed67c" : "#ff5a7d" }}>
                      {formatNumber(position.realizedPnl, 2)}
                    </td>
                    <td>{formatNumber(position.stop, 2, "-")}</td>
                    <td>{formatNumber(position.riskAmount, 2, "-")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
