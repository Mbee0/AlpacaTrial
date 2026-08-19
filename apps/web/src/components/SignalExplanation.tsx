import { ScannerRow } from "@trader/shared";

interface SignalExplanationProps {
  signal?: ScannerRow;
  loading?: boolean;
}

export function SignalExplanation({ signal, loading = false }: SignalExplanationProps) {
  if (!signal) {
    return (
      <div className="panel signal-panel">
        <h2 className="title-with-hint">
          Signal Reasoning
          <span className="title-hint">Shows the specific conditions and score contributions driving the signal.</span>
        </h2>
        {loading ? (
          <div className="bubble-stack">
            {Array.from({ length: 6 }).map((_, index) => (
              <span key={`signal-skeleton-${index}`} className="bubble-skeleton" />
            ))}
          </div>
        ) : (
          <p className="muted">Select a symbol to inspect strategy explanation.</p>
        )}
      </div>
    );
  }

  const explanationLines = Array.isArray(signal.explanation)
    ? signal.explanation
    : ["Signal explanation unavailable for this cached row."];
  const scoreBreakdownEntries = signal.breakdown ? Object.entries(signal.breakdown) : [];

  return (
    <div className="panel signal-panel">
      <h2 className="title-with-hint">
        {signal.symbol} — {signal.signal}
        <span className="title-hint">Every signal is transparent, with line context and scoring details.</span>
      </h2>
      <ul>
        {explanationLines.map((line, index) => (
          <li key={`${line}-${index}`}>{line}</li>
        ))}
        {signal.safetyLossLine && <li>Safety-loss line: {signal.safetyLossLine.toFixed(2)}.</li>}
      </ul>

      <div className="score-grid">
        {scoreBreakdownEntries.length === 0 ? (
          <p className="muted">Score breakdown unavailable for this cached row.</p>
        ) : (
          scoreBreakdownEntries.map(([key, value]) => (
            <div key={key} className="score-card">
              <strong>{key}</strong>
              <span>{value.toFixed(1)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
