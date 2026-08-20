import { StrategySettings } from "@trader/shared";

interface StrategySettingsPanelProps {
  draft: StrategySettings;
  hasPendingChanges: boolean;
  onDraftChange: (next: StrategySettings) => void;
  onApply: () => void;
  onReset: () => void;
}

function parseInputNumber(value: string, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function StrategySettingsPanel({
  draft,
  hasPendingChanges,
  onDraftChange,
  onApply,
  onReset
}: StrategySettingsPanelProps) {
  return (
    <div className="panel strategy-settings-panel">
      <h2 className="title-with-hint">
        Strategy Settings
        <span className="title-hint">Tune scanner scoring weights and signal thresholds, then apply to recompute.</span>
      </h2>

      <div className="strategy-grid">
        <label>
          Trend weight
          <input
            type="number"
            step={0.1}
            value={draft.weights.trendStrength}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                weights: {
                  ...draft.weights,
                  trendStrength: parseInputNumber(event.target.value, draft.weights.trendStrength)
                }
              })
            }
          />
        </label>
        <label>
          Trendline weight
          <input
            type="number"
            step={0.1}
            value={draft.weights.trendlineQuality}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                weights: {
                  ...draft.weights,
                  trendlineQuality: parseInputNumber(event.target.value, draft.weights.trendlineQuality)
                }
              })
            }
          />
        </label>
        <label>
          Breakout weight
          <input
            type="number"
            step={0.1}
            value={draft.weights.breakoutStrength}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                weights: {
                  ...draft.weights,
                  breakoutStrength: parseInputNumber(event.target.value, draft.weights.breakoutStrength)
                }
              })
            }
          />
        </label>
        <label>
          Volume weight
          <input
            type="number"
            step={0.1}
            value={draft.weights.volumeConfirmation}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                weights: {
                  ...draft.weights,
                  volumeConfirmation: parseInputNumber(event.target.value, draft.weights.volumeConfirmation)
                }
              })
            }
          />
        </label>
        <label>
          Multi-TF weight
          <input
            type="number"
            step={0.1}
            value={draft.weights.multiTimeframeAlignment}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                weights: {
                  ...draft.weights,
                  multiTimeframeAlignment: parseInputNumber(event.target.value, draft.weights.multiTimeframeAlignment)
                }
              })
            }
          />
        </label>
        <label>
          Volatility weight
          <input
            type="number"
            step={0.1}
            value={draft.weights.volatilitySuitability}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                weights: {
                  ...draft.weights,
                  volatilitySuitability: parseInputNumber(event.target.value, draft.weights.volatilitySuitability)
                }
              })
            }
          />
        </label>
        <label>
          Risk/Reward weight
          <input
            type="number"
            step={0.1}
            value={draft.weights.riskReward}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                weights: {
                  ...draft.weights,
                  riskReward: parseInputNumber(event.target.value, draft.weights.riskReward)
                }
              })
            }
          />
        </label>

        <label>
          LONG score threshold
          <input
            type="number"
            step={0.1}
            value={draft.thresholds.longScore}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                thresholds: {
                  ...draft.thresholds,
                  longScore: parseInputNumber(event.target.value, draft.thresholds.longScore)
                }
              })
            }
          />
        </label>
        <label>
          SHORT score threshold
          <input
            type="number"
            step={0.1}
            value={draft.thresholds.shortScore}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                thresholds: {
                  ...draft.thresholds,
                  shortScore: parseInputNumber(event.target.value, draft.thresholds.shortScore)
                }
              })
            }
          />
        </label>
        <label>
          Breakout threshold
          <input
            type="number"
            step={0.1}
            value={draft.thresholds.breakoutScore}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                thresholds: {
                  ...draft.thresholds,
                  breakoutScore: parseInputNumber(event.target.value, draft.thresholds.breakoutScore)
                }
              })
            }
          />
        </label>
        <label>
          WATCH score threshold
          <input
            type="number"
            step={0.1}
            value={draft.thresholds.watchScore}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                thresholds: {
                  ...draft.thresholds,
                  watchScore: parseInputNumber(event.target.value, draft.thresholds.watchScore)
                }
              })
            }
          />
        </label>
        <label>
          WATCH confidence penalty
          <input
            type="number"
            step={0.1}
            value={draft.thresholds.watchConfidencePenalty}
            onChange={(event) =>
              onDraftChange({
                ...draft,
                thresholds: {
                  ...draft.thresholds,
                  watchConfidencePenalty: parseInputNumber(
                    event.target.value,
                    draft.thresholds.watchConfidencePenalty
                  )
                }
              })
            }
          />
        </label>
      </div>

      <div className="strategy-actions">
        <button type="button" onClick={onApply} disabled={!hasPendingChanges}>
          Apply Settings
        </button>
        <button type="button" onClick={onReset}>
          Reset Defaults
        </button>
      </div>
    </div>
  );
}
