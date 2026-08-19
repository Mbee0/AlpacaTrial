import { ScannerRow, Timeframe } from "@trader/shared";

export type ScannerTab = "market" | "test" | "saved";

interface ScannerTableProps {
  rows: ScannerRow[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
  loading: boolean;
  activeTab: ScannerTab;
  onActiveTabChange: (tab: ScannerTab) => void;
  testSymbols: string[];
  testSymbolDraft: string;
  onTestSymbolDraftChange: (value: string) => void;
  onAddTestSymbol: () => void;
  onRemoveTestSymbol: (symbol: string) => void;
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

function formatNumber(value: unknown, digits: number, fallback = "-"): string {
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }
  return numeric.toFixed(digits);
}

function tabLabel(tab: ScannerTab) {
  if (tab === "market") {
    return "Market";
  }
  if (tab === "test") {
    return "Test List";
  }
  return "Saved Tracks";
}

export function ScannerTable({
  rows,
  selectedSymbol,
  onSelectSymbol,
  loading,
  activeTab,
  onActiveTabChange,
  testSymbols,
  testSymbolDraft,
  onTestSymbolDraftChange,
  onAddTestSymbol,
  onRemoveTestSymbol,
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
  const hasNoRows = !loading && rows.length === 0;

  return (
    <div className="panel scanner-panel">
      <h2 className="title-with-hint">
        Market Scanner
        <span className="title-hint">
          Ranked symbols with transparent scoring. Click any symbol to inspect trendlines and decision logic.
        </span>
      </h2>
      <div className="scanner-tabs" role="tablist" aria-label="Scanner tracks">
        {(["market", "test", "saved"] as ScannerTab[]).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            className={`scanner-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => onActiveTabChange(tab)}
          >
            {tabLabel(tab)}
          </button>
        ))}
      </div>
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
        {activeTab === "test" && (
          <div className="track-editor">
            <div className="track-editor-input">
              <input
                type="text"
                value={testSymbolDraft}
                placeholder="Add test symbol (e.g., JPM)"
                onChange={(event) => onTestSymbolDraftChange(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    onAddTestSymbol();
                  }
                }}
              />
              <button type="button" onClick={onAddTestSymbol}>
                Add
              </button>
            </div>
            <div className="track-chip-list">
              {testSymbols.length === 0 ? (
                <span className="track-chip-empty">No test symbols yet.</span>
              ) : (
                testSymbols.map((symbol) => (
                  <button
                    key={`test-${symbol}`}
                    type="button"
                    className="track-chip"
                    onClick={() => onRemoveTestSymbol(symbol)}
                    title={`Remove ${symbol}`}
                  >
                    {symbol} ×
                  </button>
                ))
              )}
            </div>
          </div>
        )}
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
              : hasNoRows
                ? (
                  <tr>
                    <td colSpan={10} className="scanner-empty-cell">
                      {activeTab === "saved"
                        ? "No saved tracks yet. Use the star in Chart Inspection."
                        : `No rows in ${tabLabel(activeTab)}.`}
                    </td>
                  </tr>
                )
                : rows.map((row) => (
                    <tr
                      key={row.symbol}
                      className={selectedSymbol === row.symbol ? "selected" : ""}
                      onClick={() => onSelectSymbol(row.symbol)}
                    >
                      <td>{row.symbol}</td>
                      <td>{formatNumber(row.lastPrice, 2)}</td>
                      <td>{row.trendDirection}</td>
                      <td>{formatNumber(row.actionLine, 2)}</td>
                      <td>{formatNumber(row.safetyLine, 2)}</td>
                      <td>{formatNumber(row.safetyLossLine, 2)}</td>
                      <td>{formatNumber(row.score, 1)}</td>
                      <td style={{ color: signalColor(row.signal), fontWeight: 700 }}>{row.signal}</td>
                      <td>{formatNumber(row.confidence, 1)}</td>
                      <td>{formatNumber(row.riskPerShare, 2)}</td>
                    </tr>
                  ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
