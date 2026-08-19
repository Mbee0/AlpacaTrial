import { ScannerRow, Timeframe } from "@trader/shared";

interface ScannerTableProps {
  rows: ScannerRow[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
  loading: boolean;
  timeframe: Timeframe;
  timeframeOptions: Timeframe[];
  onTimeframeChange: (timeframe: Timeframe) => void;
  searchSymbol: string;
  onSearchSymbolChange: (value: string) => void;
  onSearchSubmit: () => void;
  safetyLossBufferPct: number;
  onSafetyLossBufferPctChange: (value: number) => void;
  onRefreshScanner: () => void;
}

function signalColor(signal: ScannerRow["signal"]) {
  switch (signal) {
    case "LONG":
      return "#1ed67c";
    case "SHORT":
      return "#ff5a7d";
    case "WATCH":
      return "#fbbf24";
    default:
      return "#b9c5d9";
  }
}

function formatNumber(value: unknown, digits = 2, fallback = "-") {
  return typeof value === "number" && Number.isFinite(value) ? value.toFixed(digits) : fallback;
}

export function ScannerTable({
  rows,
  selectedSymbol,
  onSelectSymbol,
  loading,
  timeframe,
  timeframeOptions,
  onTimeframeChange,
  searchSymbol,
  onSearchSymbolChange,
  onSearchSubmit,
  safetyLossBufferPct,
  onSafetyLossBufferPctChange,
  onRefreshScanner
}: ScannerTableProps) {
  const shouldShowSkeleton = loading && rows.length === 0;

  return (
    <div className="panel scanner-panel">
      <h2 className="title-with-hint">
        Market Scanner
        <span className="title-hint">
          Ranked symbols with transparent scoring. Click any symbol to inspect trendlines and decision logic.
        </span>
      </h2>
      <div className="scanner-toolbar">
        <div className="scanner-search">
          <input
            type="text"
            value={searchSymbol}
            placeholder="Search symbol (AAPL, NVDA...)"
            onChange={(event) => onSearchSymbolChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                onSearchSubmit();
              }
            }}
          />
          <button type="button" onClick={onSearchSubmit}>
            Load
          </button>
        </div>
        <div className="scanner-controls">
          <label htmlFor="scanner-timeframe">Timeframe</label>
          <select
            id="scanner-timeframe"
            value={timeframe}
            onChange={(event) => onTimeframeChange(event.target.value as Timeframe)}
          >
            {timeframeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>

          <label htmlFor="scanner-safety-loss">Safety-loss %</label>
          <input
            id="scanner-safety-loss"
            type="number"
            min={0.1}
            max={20}
            step={0.1}
            value={safetyLossBufferPct}
            onChange={(event) => onSafetyLossBufferPctChange(Number(event.target.value) || 1)}
          />
          <button type="button" onClick={onRefreshScanner}>
            Refresh
          </button>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>Trend</th>
              <th>Action</th>
              <th>Safety</th>
              <th>Safety-Loss</th>
              <th>Score</th>
              <th>Signal</th>
              <th>Confidence</th>
              <th>Risk/Share</th>
            </tr>
          </thead>
          <tbody>
            {shouldShowSkeleton
              ? Array.from({ length: 8 }).map((_, index) => (
                  <tr key={`skeleton-row-${index}`} className="skeleton-row">
                    {Array.from({ length: 10 }).map((__, cellIndex) => (
                      <td key={`skeleton-cell-${index}-${cellIndex}`}>
                        <span className="bubble-skeleton" />
                      </td>
                    ))}
                  </tr>
                ))
              : rows.map((row) => (
                  <tr
                    key={row.symbol}
                    className={selectedSymbol === row.symbol ? "selected" : ""}
                    onClick={() => onSelectSymbol(row.symbol)}
                  >
                    <td>{row.symbol}</td>
                    <td>{formatNumber(row.lastPrice)}</td>
                    <td>{row.trendDirection}</td>
                    <td>{formatNumber(row.actionLine)}</td>
                    <td>{formatNumber(row.safetyLine)}</td>
                    <td>{formatNumber(row.safetyLossLine)}</td>
                    <td>{formatNumber(row.score, 1)}</td>
                    <td style={{ color: signalColor(row.signal), fontWeight: 700 }}>{row.signal}</td>
                    <td>{formatNumber(row.confidence, 1)}</td>
                    <td>{formatNumber(row.riskPerShare)}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
