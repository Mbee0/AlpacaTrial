import { ScannerRow } from "@trader/shared";

interface SignalExplanationProps {
  signal?: ScannerRow;
}

export function SignalExplanation({ signal }: SignalExplanationProps) {
  if (!signal) {
    return (
      <div className="panel signal-panel">
        <h2>Signal Reasoning</h2>
        <p className="muted">Select a symbol to inspect strategy explanation.</p>
      </div>
    );
  }

  return (
    <div className="panel signal-panel">
      <h2>
        {signal.symbol} — {signal.signal}
      </h2>
      <p className="muted">Every signal includes a transparent breakdown, never a black-box BUY/SELL call.</p>
      <ul>
        {signal.explanation.map((line, index) => (
          <li key={`${line}-${index}`}>{line}</li>
        ))}
      </ul>

      <div className="score-grid">
        {Object.entries(signal.breakdown).map(([key, value]) => (
          <div key={key} className="score-card">
            <strong>{key}</strong>
            <span>{value.toFixed(1)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
