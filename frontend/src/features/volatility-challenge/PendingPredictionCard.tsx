import { useEffect, useState } from "react";
import type { Prediction } from "../../types/predictions";
import { fmtUsd } from "../../utils/predictions";

interface PendingPredictionCardProps {
  prediction: Prediction;
}

export function PendingPredictionCard({ prediction }: PendingPredictionCardProps) {
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  const resolveAt = new Date(prediction.resolve_at).getTime();
  const remainingMs = Math.max(0, resolveAt - now);
  const remainingMin = Math.round(remainingMs / 60_000);

  const timeLeftLabel =
    remainingMin > 60
      ? `${Math.floor(remainingMin / 60)}h ${remainingMin % 60}m`
      : `${remainingMin}m`;

  return (
    <div className="vc-card vc-card--pending">
      <div className="vc-card-header">
        <div className="vc-card-asset">
          <span className="vc-asset-badge">{prediction.asset}</span>
          <span className={`vc-dir-indicator is-${prediction.direction}`}>
            {prediction.direction === "up" ? "▲" : "▼"} {prediction.direction.toUpperCase()}
          </span>
        </div>
        <span className="vc-status-badge">Pending</span>
      </div>

      <dl className="vc-card-dl">
        <div className="vc-card-dl-row">
          <dt>Entry Price</dt>
          <dd>{fmtUsd(prediction.entry_price)}</dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Confidence</dt>
          <dd>{prediction.confidence}/5</dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Timeframe</dt>
          <dd>{prediction.timeframe_minutes} min</dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Resolves in</dt>
          <dd className="is-timer">{timeLeftLabel}</dd>
        </div>
      </dl>
    </div>
  );
}
