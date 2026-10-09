import { useState } from "react";
import type {
  CreatePredictionPayload,
  PredictionAsset,
  PredictionDirection,
} from "../../types/predictions";
import { TIMEFRAME_OPTIONS } from "../../types/predictions";

interface PredictionFormProps {
  asset: PredictionAsset | null;
  onAssetChange: (asset: PredictionAsset) => void;
  onSubmit: (payload: CreatePredictionPayload) => Promise<void>;
  pendingAssets: Set<PredictionAsset>;
}

const CONFIDENCE_LABELS: Record<number, string> = {
  1: "Not very sure",
  2: "Slightly unsure",
  3: "Neutral",
  4: "Fairly confident",
  5: "Very confident",
};

export function PredictionForm({
  asset,
  onAssetChange,
  onSubmit,
  pendingAssets,
}: PredictionFormProps) {
  const [direction, setDirection] = useState<PredictionDirection | null>(null);
  const [timeframe, setTimeframe] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = asset !== null && direction !== null && timeframe !== null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValid || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        asset: asset!,
        direction: direction!,
        timeframe_minutes: timeframe!,
        confidence: confidence ?? 3,
      });
      setSuccess(true);
      setDirection(null);
      setTimeframe(null);
      setConfidence(null);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="vc-form" onSubmit={handleSubmit} noValidate>
      {/* Asset */}
      <fieldset className="vc-form-group">
        <legend className="vc-form-label">Choose an asset</legend>
        <div className="vc-btn-row">
          {(["BTC", "ETH"] as PredictionAsset[]).map((a) => {
            const hasPending = pendingAssets.has(a);
            return (
              <button
                key={a}
                type="button"
                className={`vc-selector-btn vc-asset-btn ${asset === a ? "is-active" : ""} ${hasPending ? "is-disabled" : ""}`}
                onClick={() => !hasPending && onAssetChange(a)}
                disabled={hasPending}
                title={hasPending ? `You already have a pending ${a} prediction` : undefined}
              >
                {a}
                {hasPending && <span className="vc-pending-badge">Pending</span>}
              </button>
            );
          })}
        </div>
      </fieldset>

      {/* Direction */}
      <fieldset className="vc-form-group">
        <legend className="vc-form-label">Predict direction</legend>
        <div className="vc-btn-row">
          {(["up", "down"] as PredictionDirection[]).map((d) => (
            <button
              key={d}
              type="button"
              className={`vc-selector-btn vc-dir-btn vc-dir-btn--${d} ${direction === d ? "is-active" : ""}`}
              onClick={() => setDirection(d)}
            >
              {d === "up" ? "▲ Up" : "▼ Down"}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Timeframe */}
      <fieldset className="vc-form-group">
        <legend className="vc-form-label">Select timeframe</legend>
        <div className="vc-btn-row vc-btn-row--wrap">
          {TIMEFRAME_OPTIONS.map((opt) => (
            <button
              key={opt.minutes}
              type="button"
              className={`vc-selector-btn vc-tf-btn ${timeframe === opt.minutes ? "is-active" : ""}`}
              onClick={() => setTimeframe(opt.minutes)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </fieldset>

      {/* Confidence */}
      <fieldset className="vc-form-group">
        <legend className="vc-form-label">
          How confident are you?{" "}
          <span className="vc-optional">(optional)</span>
        </legend>
        <div className="vc-btn-row">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              className={`vc-selector-btn vc-conf-btn ${confidence === n ? "is-active" : ""}`}
              onClick={() => setConfidence(confidence === n ? null : n)}
              title={CONFIDENCE_LABELS[n]}
              aria-label={`Confidence ${n} — ${CONFIDENCE_LABELS[n]}`}
            >
              {n}
            </button>
          ))}
        </div>
        {confidence !== null && (
          <p className="vc-conf-desc">{CONFIDENCE_LABELS[confidence]}</p>
        )}
      </fieldset>

      {error && <p className="vc-form-error" role="alert">{error}</p>}

      {success && (
        <p className="vc-form-success" role="status">
          ✓ Prediction created! Watch for it in Pending Predictions below.
        </p>
      )}

      <button
        type="submit"
        className={`vc-submit-btn ${submitting ? "is-loading" : ""}`}
        disabled={!isValid || submitting}
      >
        {submitting ? "Submitting…" : "Submit Prediction"}
      </button>
    </form>
  );
}
