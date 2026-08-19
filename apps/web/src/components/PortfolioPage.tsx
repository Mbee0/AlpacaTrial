import { PortfolioSummaryResponse } from "../types";

interface PortfolioPageProps {
  data?: PortfolioSummaryResponse;
  loading: boolean;
  error?: string;
  onSelectSymbol: (symbol: string) => void;
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
              <span>{((data?.riskControls.defaultRiskPct ?? 0) * 100).toFixed(2)}%</span>
            </div>
            <div className="score-card">
              <strong>Max Positions</strong>
              <span>{data?.riskControls.maxPositions ?? 0}</span>
            </div>
            <div className="score-card">
              <strong>Max DD</strong>
              <span>{((data?.riskControls.maxDrawdownPct ?? 0) * 100).toFixed(2)}%</span>
            </div>
            <div className="score-card">
              <strong>Equity</strong>
              <span>${(data?.latestSnapshot?.equity ?? 0).toFixed(2)}</span>
            </div>
            <div className="score-card">
              <strong>Cash</strong>
              <span>${(data?.latestSnapshot?.cash ?? 0).toFixed(2)}</span>
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
                    <td>{position.qty.toFixed(2)}</td>
                    <td>{position.avgEntryPrice.toFixed(2)}</td>
                    <td>{position.currentPrice.toFixed(2)}</td>
                    <td>{position.marketValue.toFixed(2)}</td>
                    <td style={{ color: position.unrealizedPnl >= 0 ? "#1ed67c" : "#ff5a7d" }}>
                      {position.unrealizedPnl.toFixed(2)}
                    </td>
                    <td style={{ color: position.realizedPnl >= 0 ? "#1ed67c" : "#ff5a7d" }}>
                      {position.realizedPnl.toFixed(2)}
                    </td>
                    <td>{position.stop?.toFixed(2) ?? "-"}</td>
                    <td>{position.riskAmount?.toFixed(2) ?? "-"}</td>
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
