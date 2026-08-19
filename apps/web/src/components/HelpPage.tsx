const glossaryRows: Array<{
  metric: string;
  source: string;
  definition: string;
  formula: string;
}> = [
  {
    metric: "OHLCV Bars",
    source: "Alpaca historical market data API",
    definition: "Open, high, low, close, and volume per timeframe candle.",
    formula: "Raw provider values (no transformation besides storage/normalization)."
  },
  {
    metric: "Swing High / Swing Low",
    source: "Calculated in strategy engine from OHLCV bars",
    definition: "Local turning points used as anchors for trend rays.",
    formula:
      "Swing High if high[i] >= highs in left/right window; Swing Low if low[i] <= lows in left/right window."
  },
  {
    metric: "Bullish Rays",
    source: "Calculated from swing lows + first bar low",
    definition: "Progressive support rays that chain through touch points while price never pokes below the line before the next touch.",
    formula:
      "Start at earliest bar low. For each anchor, test future low anchors and choose the line with highest touches; ties prefer furthest valid endpoint, with no low(line breach) before endpoint."
  },
  {
    metric: "Bearish Rays",
    source: "Calculated from swing highs + top-most stock high",
    definition: "Progressive resistance rays that start at the chart’s top-most point and chain forward without pre-touch breaches.",
    formula:
      "Start at highest historical high. For each anchor, test future high anchors and choose max-touch line; ties prefer furthest valid endpoint, with no high(line breach) before endpoint."
  },
  {
    metric: "Action Line",
    source: "Highest scored candidate line in active direction",
    definition: "Primary tracking line used for breakout/breakdown context.",
    formula: "Argmax(score(candidate_lines in active trend direction))."
  },
  {
    metric: "Safety Line",
    source: "Second-best candidate line in active direction",
    definition: "Secondary protection line used for risk framing.",
    formula: "Second highest scored line in active trend direction."
  },
  {
    metric: "Safety-Loss Line",
    source: "User-configured buffer from latest price",
    definition: "A hard-offset stop guide to limit downside while testing.",
    formula:
      "Bullish: close * (1 - bufferPct). Bearish: close * (1 + bufferPct). Example bufferPct = 0.01 for 1%."
  },
  {
    metric: "Trend Direction",
    source: "Calculated from recent swings",
    definition: "High-level market structure label.",
    formula: "Bullish if higher highs + higher lows; Bearish if lower highs + lower lows; else Sideways."
  },
  {
    metric: "Breakout Strength",
    source: "Calculated from price vs Action Line",
    definition: "Measures how strongly current price is beyond action ray.",
    formula:
      "Bullish approx: clamp(((close-actionLine)/close)*2200 + 50, 0, 100); mirrored for bearish."
  },
  {
    metric: "Volume Confirmation",
    source: "Calculated from OHLCV",
    definition: "Compares latest volume to trailing average volume.",
    formula: "clamp((latestVolume / avgVolume20) * 50, 0, 100)."
  },
  {
    metric: "Risk/Share",
    source: "Calculated from line distances",
    definition: "Approximate risk unit for one share.",
    formula: "|actionLine - safetyLine|."
  },
  {
    metric: "Position Size Suggestion",
    source: "Calculated from portfolio risk settings",
    definition: "Shares sized to keep max loss within risk budget.",
    formula: "floor((equity * riskPct) / riskPerShare)."
  }
];

export function HelpPage() {
  return (
    <section className="panel help-page">
      <h2>Data Dictionary & Formulas</h2>
      <p className="muted">
        This page explains exactly where each value comes from and how it is computed so you can judge decisions with full transparency.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th>Source</th>
              <th>Definition</th>
              <th>Formula</th>
            </tr>
          </thead>
          <tbody>
            {glossaryRows.map((row) => (
              <tr key={row.metric}>
                <td>{row.metric}</td>
                <td>{row.source}</td>
                <td>{row.definition}</td>
                <td>{row.formula}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
