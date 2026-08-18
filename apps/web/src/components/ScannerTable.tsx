import { ScannerRow } from "@trader/shared";

interface ScannerTableProps {
  rows: ScannerRow[];
  selectedSymbol?: string;
  onSelectSymbol: (symbol: string) => void;
}

function signalColor(signal: ScannerRow["signal"]) {
  switch (signal) {
    case "LONG":
      return "#22c55e";
    case "SHORT":
      return "#ef4444";
    case "WATCH":
      return "#f59e0b";
    default:
      return "#9ca3af";
  }
}

export function ScannerTable({ rows, selectedSymbol, onSelectSymbol }: ScannerTableProps) {
  return (
    <div className="panel scanner-panel">
      <h2>Market Scanner</h2>
      <p className="muted">
        Ranked symbols with transparent scoring. Click any symbol to inspect trendlines and decision logic.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Symbol</th>
              <th>Price</th>
              <th>Trend</th>
              <th>Action</th>
              <th>Safety</th>
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
