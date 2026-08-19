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
  const safetyLoss =
    typeof signal.safetyLossLine === "number" && Number.isFinite(signal.safetyLossLine)
      ? signal.safetyLossLine
      : undefined;

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
        {safetyLoss !== undefined && <li>Safety-loss line: {safetyLoss.toFixed(2)}.</li>}
      </ul>

      <div className="score-grid">
        {scoreBreakdownEntries.length === 0 ? (
          <p className="muted">Score breakdown unavailable for this cached row.</p>
        ) : (
          scoreBreakdownEntries.map(([key, value]) => {
            const formattedValue = typeof value === "number" && Number.isFinite(value) ? value.toFixed(1) : "-";
            return (
              <div key={key} className="score-card">
                <strong>{key}</strong>
                <span>{formattedValue}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
