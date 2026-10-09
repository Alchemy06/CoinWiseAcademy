import type { ChoiceRecord, ScenarioNode } from "../../types/trading";

interface ConsequenceScreenProps {
  record: ChoiceRecord;
  node: ScenarioNode | null;
  currency: string;
  currentBalance: number;
  initialBalance: number;
  onContinue: () => void;
}

function fmt(n: number, currency: string) {
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function ConsequenceSparkline({ data, delta }: { data: number[]; delta: number }) {
  if (data.length < 2) return null;

  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 480;
  const h = 160;
  const pad = 8;

  const pts = data.map((v, i) => {
    const x = pad + (i / (data.length - 1)) * (w - pad * 2);
    const y = pad + (h - pad * 2) - ((v - min) / range) * (h - pad * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const isUp = delta >= 0;
  const strokeColor = isUp ? "#00C896" : "#E8354A";
  const fillColor = isUp ? "rgba(0,200,150,0.12)" : "rgba(232,53,74,0.12)";

  // Close fill path
  const fillPath = `M${pts[0]} L${pts.join(" L")} L${pts[pts.length - 1].split(",")[0]},${h} L${pad},${h} Z`;

  // Mark the user's decision point (last point of array)
  const lastX = pad + (w - pad * 2);
  const lastY = pad + (h - pad * 2) - ((data[data.length - 1] - min) / range) * (h - pad * 2);

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width="100%"
      height={h}
      aria-hidden="true"
      style={{ display: "block" }}
    >
      {/* Fill */}
      <path d={fillPath} fill={fillColor} />
      {/* Line */}
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke={strokeColor}
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Decision marker dot */}
      <circle cx={lastX} cy={lastY} r="5" fill={strokeColor} />
    </svg>
  );
}

export function ConsequenceScreen({
  record,
  node,
  currency,
  currentBalance,
  initialBalance,
  onContinue,
}: ConsequenceScreenProps) {
  const priceData = node?.historical_price_data ?? [];

  // ── Pence-model values (Phase 2) ─────────────────────────────────────────
  // Use pence snapshot stored in the record for accurate financial display.
  // These are set server-side from derive_attempt_state at the moment of the choice.
  const totalValueGbp = record.total_value_pence != null
    ? record.total_value_pence / 100
    : currentBalance;
  const totalDeltaGbp = record.total_delta_pence != null
    ? record.total_delta_pence / 100
    : (currentBalance - initialBalance);

  // Amount committed (buy/sell choices only).
  const amountCommittedGbp = record.amount_committed_pence != null
    ? record.amount_committed_pence / 100
    : (record.amount_entered ? parseFloat(record.amount_entered) : null);

  // BTC received (for display on buy choices).
  const btcReceived = record.btc_received_satoshis != null
    ? record.btc_received_satoshis / 100_000_000
    : null;

  const isTotalUp = totalDeltaGbp >= 0;

  // feedback_text is pre-interpolated server-side — no placeholder substitution needed.
  const feedbackText = record.feedback_text;

  return (
    <div className="tf-consequence">
      {/* Headline */}
      <h2 className="tf-consequence-headline">
        {record.consequence_headline || "Result"}
      </h2>

      {/* Amount committed (buy/sell choices only) */}
      {amountCommittedGbp != null && amountCommittedGbp > 0 && (
        <div className="tf-consequence-invested">
          <span className="tf-consequence-invested-label">You committed</span>
          <span className="tf-consequence-invested-value">
            {fmt(amountCommittedGbp, currency)}
            {btcReceived != null && btcReceived > 0 && (
              <span className="tf-consequence-invested-btc">
                {" "}≈ {btcReceived.toFixed(6)} BTC
              </span>
            )}
          </span>
        </div>
      )}

      {/* Sparkline — raw pence values; shape is correct since chart normalises min/max */}
      {priceData.length >= 2 && (
        <div className="tf-consequence-chart">
          <ConsequenceSparkline data={priceData} delta={totalDeltaGbp} />
        </div>
      )}

      {/* Portfolio total — sourced from pence model snapshot */}
      <div className="tf-consequence-total">
        Portfolio: <strong>{fmt(totalValueGbp, currency)}</strong>
        <span className={`tf-consequence-total-delta ${isTotalUp ? "is-up" : "is-down"}`}>
          {isTotalUp ? "▲" : "▼"} {fmt(Math.abs(totalDeltaGbp), currency)} vs start
        </span>
      </div>

      {/* Feedback text — pre-interpolated server-side */}
      {feedbackText && (
        <p className="tf-consequence-feedback">{feedbackText}</p>
      )}

      {/* Continue button */}
      <button className="tf-consequence-continue" onClick={onContinue} type="button">
        Continue →
      </button>
    </div>
  );
}
