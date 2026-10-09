import type { Prediction } from "../../types/predictions";

interface ResolvedPredictionCardProps {
  prediction: Prediction;
}

function fmtPrice(price: string | null): string {
  if (!price) return "—";
  const n = parseFloat(price);
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: n >= 1000 ? 0 : 2,
  });
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtPct(pct: string | null): string {
  if (!pct) return "—";
  const n = parseFloat(pct);
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)}%`;
}

export function ResolvedPredictionCard({ prediction: p }: ResolvedPredictionCardProps) {
  const isCorrect = p.result === "correct";

  return (
    <div className={`vc-card vc-card--resolved vc-card--${isCorrect ? "correct" : "incorrect"}`}>
      <div className="vc-card-header">
        <span className="vc-card-asset">{p.asset}</span>
        <span className={`vc-dir-badge vc-dir-badge--${p.direction}`}>
          {p.direction === "up" ? "▲ Up" : "▼ Down"}
        </span>
        <span className={`vc-result-badge vc-result-badge--${isCorrect ? "correct" : "incorrect"}`}>
          {isCorrect ? "✓ Correct" : "✗ Incorrect"}
        </span>
      </div>

      <dl className="vc-card-dl">
        <div className="vc-card-dl-row">
          <dt>Timeframe</dt>
          <dd>{p.timeframe_label}</dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Entry price</dt>
          <dd>{fmtPrice(p.entry_price)}</dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Exit price</dt>
          <dd>{fmtPrice(p.exit_price)}</dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Movement</dt>
          <dd className={parseFloat(p.price_change_percent ?? "0") >= 0 ? "is-up" : "is-down"}>
            {fmtPct(p.price_change_percent)}
            {p.actual_direction && (
              <span className="vc-actual-dir">
                {" "}({p.actual_direction === "up" ? "▲ went up" : p.actual_direction === "down" ? "▼ went down" : "→ flat"})
              </span>
            )}
          </dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Confidence</dt>
          <dd>{p.confidence !== null ? `${p.confidence}/5` : "—"}</dd>
        </div>
        <div className="vc-card-dl-row">
          <dt>Resolved</dt>
          <dd>{fmtDate(p.resolved_at)}</dd>
        </div>
      </dl>

      {p.reflection_text && (
        <div className="vc-reflection">
          <p className="vc-reflection-text">{p.reflection_text}</p>
        </div>
      )}
    </div>
  );
}
