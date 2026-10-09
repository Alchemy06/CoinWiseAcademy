import type { CalibrationScoreLabel } from "../../types/predictions";

interface PredictionStatsCardProps {
  score: number;
  label: CalibrationScoreLabel | string;
  resolvedCount: number;
}

const SCORE_COLOR: Record<string, string> = {
  "Overconfident":    "#E8354A",
  "Learning":         "#F5A623",
  "Calibrating":      "#F5A623",
  "Well Calibrated":  "#00C896",
  "Highly Calibrated":"#00C896",
};

const SCORE_DESC: Record<string, string> = {
  "Overconfident":    "Your confidence doesn't match your accuracy.",
  "Learning":         "You're developing awareness of market uncertainty.",
  "Calibrating":      "Your confidence is starting to reflect your knowledge.",
  "Well Calibrated":  "You know when you know something and when you're guessing.",
  "Highly Calibrated":"Rare. You've demonstrated consistent alignment between confidence and accuracy.",
};

const MIN_RESOLVED_FOR_SCORE = 5;

export function PredictionStatsCard({ score, label, resolvedCount }: PredictionStatsCardProps) {
  const color = SCORE_COLOR[label] ?? "#6B7A99";
  const desc  = SCORE_DESC[label]  ?? "";
  const hasScore = resolvedCount >= MIN_RESOLVED_FOR_SCORE;

  return (
    <div className="ds-card" style={{ padding: 20 }}>
      <p style={{
        fontFamily: "var(--ds-font-display)", fontSize: 10.5, fontWeight: 700,
        letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)",
        margin: "0 0 14px",
      }}>
        Calibration Score
      </p>

      {hasScore ? (
        <>
          {/* Big numeric score */}
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
            <span style={{
              fontFamily: "var(--ds-font-display)", fontSize: 52, fontWeight: 800,
              letterSpacing: "-0.05em", color, lineHeight: 1,
            }}>
              {score}
            </span>
            <span style={{ fontSize: 18, color: "var(--ds-muted)", fontWeight: 500 }}>/100</span>
          </div>

          {/* Label */}
          <p style={{
            fontFamily: "var(--ds-font-display)", fontSize: 14, fontWeight: 700,
            color, margin: "0 0 12px",
          }}>
            {label}
          </p>

          {/* Progress bar */}
          <div style={{
            height: 4, borderRadius: 999, background: "var(--ds-line)",
            marginBottom: 12, overflow: "hidden",
          }}>
            <div style={{
              height: "100%", width: `${score}%`,
              background: color, borderRadius: 999,
              transition: "width 0.6s ease",
            }} />
          </div>

          {/* Description */}
          <p style={{ fontSize: 12.5, color: "var(--ds-muted)", margin: 0, lineHeight: 1.5 }}>
            {desc}
          </p>
        </>
      ) : (
        <>
          {/* Locked state */}
          <div style={{
            height: 4, borderRadius: 999, background: "var(--ds-line)",
            marginBottom: 12, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${Math.min((resolvedCount / MIN_RESOLVED_FOR_SCORE) * 100, 100)}%`,
              background: "#6B7A99", borderRadius: 999,
              transition: "width 0.6s ease",
            }} />
          </div>
          <p style={{ fontSize: 13, color: "#6B7A99", fontStyle: "italic", margin: 0 }}>
            Make {MIN_RESOLVED_FOR_SCORE - resolvedCount} more prediction{MIN_RESOLVED_FOR_SCORE - resolvedCount !== 1 ? "s" : ""} to unlock your Calibration Score.
          </p>
        </>
      )}
    </div>
  );
}
