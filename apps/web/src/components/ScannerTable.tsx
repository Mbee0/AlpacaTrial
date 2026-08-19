import { ScannerRow, Timeframe } from "@trader/shared";

interface ScannerTableProps {
  rows: ScannerRow[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
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

export function ScannerTable({
  rows,
  selectedSymbol,
  onSelectSymbol,
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
  return (
    <div className="panel scanner-panel">
      <h2>Market Scanner</h2>
      <p className="muted">
        Ranked symbols with transparent scoring. Click any symbol to inspect trendlines and decision logic.
      </p>
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
            {rows.map((row) => (
              <tr
                key={row.symbol}
                className={selectedSymbol === row.symbol ? "selected" : ""}
                onClick={() => onSelectSymbol(row.symbol)}
              >
                <td>{row.symbol}</td>
                <td>{row.lastPrice.toFixed(2)}</td>
                <td>{row.trendDirection}</td>
                <td>{row.actionLine?.toFixed(2) ?? "-"}</td>
                <td>{row.safetyLine?.toFixed(2) ?? "-"}</td>
                <td>{row.safetyLossLine?.toFixed(2) ?? "-"}</td>
                <td>{row.score.toFixed(1)}</td>
                <td style={{ color: signalColor(row.signal), fontWeight: 700 }}>{row.signal}</td>
                <td>{row.confidence.toFixed(1)}</td>
                <td>{row.riskPerShare?.toFixed(2) ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
