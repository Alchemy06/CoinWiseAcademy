import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreatePredictionPayload,
  Prediction,
  PredictionAsset,
  PredictionDirection,
} from "../../types/predictions";
import type { PredictionsResponse } from "../../types/predictions";
import { TIMEFRAME_OPTIONS } from "../../types/predictions";
import { createPrediction, fetchPredictions, fmtUsd } from "../../utils/predictions";
import { LivePriceChart } from "./LivePriceChart";
import { PendingPredictionCard } from "./PendingPredictionCard";
import { PredictionStatsCard } from "./PredictionStatsCard";
import { ResolvedPredictionCard } from "./ResolvedPredictionCard";

// ─── constants ────────────────────────────────────────────────────────────────

const CONFIDENCE_LABELS: Record<number, string> = {
  1: "Not very sure",
  2: "Slightly unsure",
  3: "Neutral",
  4: "Fairly confident",
  5: "Very confident",
};

// ─── helpers ──────────────────────────────────────────────────────────────────

function timeAgo(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const weeks = Math.floor(ms / 604_800_000);
  const days  = Math.floor(ms / 86_400_000);
  const hours = Math.floor(ms / 3_600_000);
  if (weeks >= 1)  return `${weeks} week${weeks > 1 ? "s" : ""} ago`;
  if (days >= 1)   return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours >= 1)  return `${hours}h ago`;
  return "Just now";
}

function fmtPct(pct: string | null): string {
  if (!pct) return "—";
  const n = parseFloat(pct);
  return `${n >= 0 ? "+" : ""}${n.toFixed(1)}%`;
}

// ─── component ────────────────────────────────────────────────────────────────

export function VolatilityChallengePage() {
  // ── Data ──────────────────────────────────────────────────────────────────
  const [data, setData] = useState<PredictionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ── Prediction form state ──────────────────────────────────────────────────
  const [selectedAsset, setSelectedAsset] = useState<PredictionAsset>("BTC");
  const [direction, setDirection] = useState<PredictionDirection | null>(null);
  const [timeframe, setTimeframe] = useState<number | null>(null);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitSuccess, setSubmitSuccess] = useState(false);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [newResult, setNewResult] = useState<Prediction | null>(null);
  const prevPredictionsRef = useRef<Prediction[]>([]);

  // ── Data loading ──────────────────────────────────────────────────────────
  const load = useCallback(async () => {
    try {
      const result = await fetchPredictions();
      setData(result);
      setFetchError(null);

      // Detect predictions that moved from pending → resolved since last poll.
      const allPredictions = [...result.pending, ...result.resolved];
      const justResolved = allPredictions.filter(
        (p) =>
          p.status === "resolved" &&
          prevPredictionsRef.current.find(
            (prev) => prev.id === p.id && prev.status === "pending"
          )
      );
      if (justResolved.length > 0) {
        setNewResult(justResolved[0]);
      }
      prevPredictionsRef.current = allPredictions;
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : "Failed to load predictions.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = setInterval(() => { void load(); }, 30_000);
    return () => clearInterval(id);
  }, [load]);

  // ── Submit ────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    if (!direction || !timeframe || !confidence || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const payload: CreatePredictionPayload = {
        asset: selectedAsset,
        direction,
        timeframe_minutes: timeframe,
        confidence: confidence as number,
      };
      await createPrediction(payload);
      setSubmitSuccess(true);
      setDirection(null);
      setTimeframe(null);
      setConfidence(null);
      await load();
      setTimeout(() => setSubmitSuccess(false), 3_000);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  const pendingAssets = new Set<PredictionAsset>(
    (data?.pending ?? []).map((p) => p.asset as PredictionAsset)
  );
  const stats = data?.stats ?? null;
  const isFormValid = !!direction && !!timeframe && !!confidence;
  const assetHasPending = pendingAssets.has(selectedAsset);
  const selectedTfLabel = TIMEFRAME_OPTIONS.find((o) => o.minutes === timeframe)?.label ?? null;
  const pendingCount = data?.pending.length ?? 0;
  const resolvedList = data?.resolved ?? [];
  const previewResolved = resolvedList.slice(0, 4);

  // ── Summary copy ──────────────────────────────────────────────────────────
  const summaryCopy = direction && timeframe
    ? `Predicting ${selectedAsset} goes ${direction === "up" ? "↑ up" : "↓ down"} over the next ${selectedTfLabel ?? "—"}${confidence !== null ? ` · ${CONFIDENCE_LABELS[confidence]}` : ""}.`
    : "Pick a direction to see a summary of your read.";

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="vc2-page ds-page ds-page-enter">

      {/* ── Page header ── */}
      <div style={{ marginBottom: 28 }}>
        <p style={{
          fontFamily: "var(--ds-font-display)", fontSize: 11, fontWeight: 700,
          letterSpacing: "0.1em", textTransform: "uppercase", color: "var(--ds-brand)", margin: "0 0 8px"
        }}>
          Practice
        </p>
        <h1 style={{
          fontFamily: "var(--ds-font-display)", fontSize: "clamp(1.8rem, 3vw, 2.4rem)",
          fontWeight: 700, letterSpacing: "-0.04em", color: "var(--ds-ink)", margin: "0 0 8px", lineHeight: 1.1
        }}>
          Volatility checker
        </h1>
        <p style={{ fontSize: 14.5, color: "var(--ds-muted)", margin: 0 }}>
          Make a call on real price action. No money changes hands. Your ego might.
        </p>
      </div>

      {/* ── Result notification banner ── */}
      {newResult && (
        <div style={{
          background: newResult.result === "correct" ? "#F0FDF9" : "#FFF2F3",
          border: `1px solid ${newResult.result === "correct" ? "#00C896" : "#E8354A"}`,
          borderRadius: 12,
          padding: "16px 20px",
          marginBottom: 24,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}>
          <div>
            <p style={{
              fontFamily: "var(--ds-font-display)", fontWeight: 600, fontSize: 16,
              color: "#0F1F3D", marginBottom: 4, marginTop: 0,
            }}>
              {newResult.result === "correct" ? "✓ Prediction correct" : "✗ Prediction incorrect"} — {newResult.asset} {newResult.direction}
            </p>
            <p style={{ fontSize: 13, color: "#6B7A99", margin: 0 }}>
              Entry ${parseFloat(newResult.entry_price).toLocaleString()} → Exit ${newResult.exit_price ? parseFloat(newResult.exit_price).toLocaleString() : "—"}{" "}
              ({newResult.price_change_percent
                ? `${parseFloat(newResult.price_change_percent) >= 0 ? "+" : ""}${parseFloat(newResult.price_change_percent).toFixed(2)}%`
                : "—"})
            </p>
          </div>
          <button
            type="button"
            onClick={() => setNewResult(null)}
            style={{
              background: "none", border: "none", fontSize: 18, cursor: "pointer",
              color: "#6B7A99", padding: "4px 8px", flexShrink: 0,
            }}
          >
            ×
          </button>
        </div>
      )}

      {/* ── Two-column layout ── */}
      <div style={{
        display: "grid",
        gridTemplateColumns: "1fr 360px",
        gap: 24,
        alignItems: "start"
      }}>

        {/* ── Left column: chart + history ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Chart — unchanged, no wrapper added */}
          <LivePriceChart
            asset={selectedAsset}
            onAssetChange={(a) => { setSelectedAsset(a); setDirection(null); }}
            onPriceChange={setEntryPrice}
          />

          {/* Prediction history table */}
          <div className="ds-card" style={{ padding: 24 }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 16 }}>
              <div>
                <h2 style={{
                  fontFamily: "var(--ds-font-display)", fontSize: 16, fontWeight: 700,
                  letterSpacing: "-0.025em", color: "var(--ds-ink)", margin: "0 0 3px"
                }}>
                  Your prediction history
                </h2>
                <p style={{ fontSize: 12.5, color: "var(--ds-muted)", margin: 0 }}>
                  {resolvedList.length > 0
                    ? `Last ${previewResolved.length} calls · scored automatically.`
                    : "No resolved predictions yet."}
                </p>
              </div>
              {resolvedList.length > 4 && (
                <button
                  type="button"
                  onClick={() => setShowAllHistory((v) => !v)}
                  style={{
                    background: "none", border: "none", cursor: "pointer",
                    fontFamily: "var(--ds-font-display)", fontSize: 13, fontWeight: 600,
                    color: "var(--ds-brand)", padding: 0
                  }}
                >
                  {showAllHistory ? "Show less" : "See all"}
                </button>
              )}
            </div>

            {loading && (
              <p style={{ fontSize: 13, color: "var(--ds-muted)", margin: 0 }}>Loading…</p>
            )}
            {fetchError && (
              <p style={{ fontSize: 13, color: "#cf202f", margin: 0 }}>{fetchError}</p>
            )}

            {/* Pending predictions banner */}
            {pendingCount > 0 && (
              <div style={{
                display: "flex", alignItems: "center", gap: 10, padding: "10px 14px",
                borderRadius: 10, background: "color-mix(in oklab, var(--ds-warn) 10%, transparent)",
                border: "1px solid color-mix(in oklab, var(--ds-warn) 20%, transparent)",
                marginBottom: 16
              }}>
                <span style={{ fontSize: 13, color: "var(--ds-warn)", fontWeight: 600 }}>
                  ⏱ {pendingCount} prediction{pendingCount > 1 ? "s" : ""} pending
                </span>
                <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
                  {data?.pending.map((p) => (
                    <span key={p.id} style={{
                      fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999,
                      background: "var(--ds-warn)", color: "#fff"
                    }}>
                      {p.asset} {p.direction === "up" ? "↑" : "↓"}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Resolved table */}
            {resolvedList.length > 0 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["WHEN", "ASSET", "CALL", "CONF.", "RESULT", "ACTUAL"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "6px 10px 10px 0",
                          fontFamily: "var(--ds-font-display)", fontSize: 10.5, fontWeight: 700,
                          letterSpacing: "0.08em", color: "var(--ds-muted)",
                          borderBottom: "1px solid var(--ds-line)"
                        }}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(showAllHistory ? resolvedList : previewResolved).map((p) => {
                      const isCorrect = p.result === "correct";
                      return (
                        <tr key={p.id} style={{ borderBottom: "1px solid var(--ds-line)" }}>
                          <td style={{ padding: "11px 10px 11px 0", color: "var(--ds-muted)", whiteSpace: "nowrap" }}>
                            {timeAgo(p.resolved_at)}
                          </td>
                          <td style={{ padding: "11px 10px 11px 0", fontWeight: 600, color: "var(--ds-ink)" }}>
                            {p.asset}
                          </td>
                          <td style={{ padding: "11px 10px 11px 0" }}>
                            <span style={{
                              fontWeight: 600,
                              color: p.direction === "up" ? "var(--ds-success)" : "#cf202f"
                            }}>
                              {p.direction === "up" ? "↑ Up" : "↓ Down"}
                            </span>
                          </td>
                          <td style={{ padding: "11px 10px 11px 0", color: "var(--ds-muted)" }}>
                            {p.confidence !== null ? `${p.confidence}/5` : "—"}
                          </td>
                          <td style={{ padding: "11px 10px 11px 0" }}>
                            <span style={{
                              display: "inline-flex", alignItems: "center", gap: 4,
                              padding: "3px 9px", borderRadius: 999, fontSize: 11, fontWeight: 700,
                              background: isCorrect
                                ? "color-mix(in oklab, var(--ds-success) 12%, transparent)"
                                : "color-mix(in oklab, #cf202f 12%, transparent)",
                              color: isCorrect ? "var(--ds-success)" : "#cf202f"
                            }}>
                              {isCorrect ? "✓ hit" : "✗ miss"}
                            </span>
                          </td>
                          <td style={{ padding: "11px 0 11px 0", color: "var(--ds-muted)", whiteSpace: "nowrap" }}>
                            <span style={{
                              color: parseFloat(p.price_change_percent ?? "0") >= 0 ? "var(--ds-success)" : "#cf202f",
                              fontWeight: 600
                            }}>
                              {fmtPct(p.price_change_percent)}
                            </span>
                            {" "}in {p.timeframe_label}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              !loading && (
                <p style={{ fontSize: 13, color: "var(--ds-muted)", margin: 0, padding: "12px 0" }}>
                  No resolved predictions yet. They score automatically once the timeframe passes.
                </p>
              )
            )}

            {/* Expanded pending card list */}
            {showAllHistory && pendingCount > 0 && (
              <div style={{ marginTop: 20 }}>
                <p style={{
                  fontFamily: "var(--ds-font-display)", fontSize: 12, fontWeight: 700,
                  letterSpacing: "0.06em", color: "var(--ds-muted)", textTransform: "uppercase",
                  marginBottom: 10
                }}>
                  Pending
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {data?.pending.map((p) => (
                    <PendingPredictionCard key={p.id} prediction={p} />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Full resolved card list (expanded) */}
          {showAllHistory && resolvedList.length > 4 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {resolvedList.slice(4).map((p) => (
                <ResolvedPredictionCard key={p.id} prediction={p} />
              ))}
            </div>
          )}
        </div>

        {/* ── Right column: form + info ── */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

          {/* Make your read */}
          <div className="ds-card" style={{ padding: 24 }}>
            <h2 style={{
              fontFamily: "var(--ds-font-display)", fontSize: 16, fontWeight: 700,
              letterSpacing: "-0.025em", color: "var(--ds-ink)", margin: "0 0 4px"
            }}>
              Make your read
            </h2>
            <p style={{ fontSize: 13, color: "var(--ds-muted)", margin: "0 0 22px" }}>
              Over the next timeframe, where does it go?
            </p>

            {/* Asset */}
            <div style={{ marginBottom: 18 }}>
              <p style={{
                fontFamily: "var(--ds-font-display)", fontSize: 10.5, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", margin: "0 0 8px"
              }}>
                Asset
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {(["BTC", "ETH"] as PredictionAsset[]).map((a) => {
                  const hasPending = pendingAssets.has(a);
                  const isSelected = selectedAsset === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      disabled={hasPending}
                      onClick={() => { if (!hasPending) { setSelectedAsset(a); setDirection(null); } }}
                      style={{
                        flex: 1, padding: "9px 0", borderRadius: 9,
                        border: `1.5px solid ${isSelected ? "var(--ds-brand)" : "var(--ds-line)"}`,
                        background: isSelected ? "var(--ds-brand-soft)" : "var(--ds-surface-1)",
                        color: isSelected ? "var(--ds-brand)" : "var(--ds-ink)",
                        fontFamily: "var(--ds-font-display)", fontSize: 13, fontWeight: 700,
                        cursor: hasPending ? "not-allowed" : "pointer",
                        opacity: hasPending ? 0.5 : 1, transition: "all 0.15s"
                      }}
                    >
                      {a}{hasPending ? " ⏱" : ""}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Direction */}
            <div style={{ marginBottom: 18 }}>
              <p style={{
                fontFamily: "var(--ds-font-display)", fontSize: 10.5, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", margin: "0 0 8px"
              }}>
                Direction
              </p>
              <div style={{ display: "flex", gap: 8 }}>
                {(["up", "down"] as PredictionDirection[]).map((d) => {
                  const isSelected = direction === d;
                  const isUp = d === "up";
                  const activeColor = isUp ? "var(--ds-success)" : "#cf202f";
                  const activeBg = isUp
                    ? "color-mix(in oklab, var(--ds-success) 10%, transparent)"
                    : "color-mix(in oklab, #cf202f 10%, transparent)";
                  return (
                    <button
                      key={d}
                      type="button"
                      disabled={assetHasPending}
                      onClick={() => setDirection(d)}
                      style={{
                        flex: 1, padding: "9px 8px", borderRadius: 9,
                        border: `1.5px solid ${isSelected ? activeColor : "var(--ds-line)"}`,
                        background: isSelected ? activeBg : "var(--ds-surface-1)",
                        color: isSelected ? activeColor : "var(--ds-ink)",
                        fontFamily: "var(--ds-font-display)", fontSize: 13, fontWeight: 700,
                        cursor: assetHasPending ? "not-allowed" : "pointer",
                        opacity: assetHasPending ? 0.5 : 1, transition: "all 0.15s",
                        display: "flex", flexDirection: "column", alignItems: "center", gap: 2,
                      }}
                    >
                      <span>{isUp ? "↑" : "↓"} {isUp ? "Up" : "Down"}</span>
                      <span style={{
                        fontSize: 11, fontStyle: "italic",
                        color: isSelected ? activeColor : "#6B7A99",
                        display: "block", fontWeight: 400, fontFamily: "inherit",
                        lineHeight: 1.3,
                      }}>
                        {isUp
                          ? "Momentum is strong, this will keep going"
                          : "This has run too far, a correction is coming"}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Timeframe */}
            <div style={{ marginBottom: 18 }}>
              <p style={{
                fontFamily: "var(--ds-font-display)", fontSize: 10.5, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", margin: "0 0 8px"
              }}>
                Timeframe
              </p>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {TIMEFRAME_OPTIONS.map((opt) => {
                  const isSelected = timeframe === opt.minutes;
                  const isHighNoise = opt.minutes === 5 || opt.minutes === 10;
                  const isRecommended = opt.minutes === 60 || opt.minutes === 1440;
                  return (
                    <button
                      key={opt.minutes}
                      type="button"
                      disabled={assetHasPending}
                      onClick={() => setTimeframe(opt.minutes)}
                      style={{
                        padding: "7px 13px", borderRadius: 8,
                        border: `1.5px solid ${isSelected ? "var(--ds-brand)" : "var(--ds-line)"}`,
                        background: isSelected ? "var(--ds-brand-soft)" : "var(--ds-surface-1)",
                        color: isSelected ? "var(--ds-brand)" : "var(--ds-ink)",
                        fontFamily: "var(--ds-font-display)", fontSize: 12.5, fontWeight: 600,
                        cursor: assetHasPending ? "not-allowed" : "pointer",
                        opacity: assetHasPending ? 0.5 : 1, transition: "all 0.15s",
                        display: "flex", alignItems: "center", gap: 4,
                      }}
                    >
                      {opt.label}
                      {isHighNoise && (
                        <span style={{
                          fontSize: 10, background: "#FFFBF0", color: "#B87D00",
                          padding: "1px 5px", borderRadius: 4, fontWeight: 500,
                        }}>
                          high noise
                        </span>
                      )}
                      {isRecommended && (
                        <span style={{
                          fontSize: 10, background: "#F0FDF9", color: "#00C896",
                          padding: "1px 5px", borderRadius: 4, fontWeight: 500,
                        }}>
                          recommended
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Confidence */}
            <div style={{ marginBottom: 22 }}>
              <p style={{
                fontFamily: "var(--ds-font-display)", fontSize: 10.5, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", margin: "0 0 6px"
              }}>
                Confidence
              </p>
              <p style={{ fontSize: 13, fontWeight: 500, color: "#6B7A99", marginBottom: 8, marginTop: 0 }}>
                Required. Used to calculate your Calibration Score.
              </p>
              <div style={{ display: "flex", gap: 6 }}>
                {[1, 2, 3, 4, 5].map((n) => {
                  const isSelected = confidence === n;
                  return (
                    <button
                      key={n}
                      type="button"
                      disabled={assetHasPending}
                      onClick={() => setConfidence(n)}
                      title={CONFIDENCE_LABELS[n]}
                      aria-label={`Confidence ${n} — ${CONFIDENCE_LABELS[n]}`}
                      style={{
                        flex: 1, padding: "7px 0", borderRadius: 8,
                        border: `1.5px solid ${isSelected ? "var(--ds-brand)" : "var(--ds-line)"}`,
                        background: isSelected ? "var(--ds-brand-soft)" : "var(--ds-surface-1)",
                        color: isSelected ? "var(--ds-brand)" : "var(--ds-muted)",
                        fontFamily: "var(--ds-font-display)", fontSize: 13, fontWeight: 700,
                        cursor: assetHasPending ? "not-allowed" : "pointer",
                        opacity: assetHasPending ? 0.5 : 1, transition: "all 0.15s"
                      }}
                    >
                      {n}
                    </button>
                  );
                })}
              </div>
              {confidence !== null && (
                <p style={{ fontSize: 12, color: "var(--ds-muted)", margin: "6px 0 0" }}>
                  {CONFIDENCE_LABELS[confidence]}
                </p>
              )}
            </div>

            {/* Summary */}
            <div style={{
              padding: "11px 14px", borderRadius: 9,
              background: "var(--ds-surface-2)", border: "1px solid var(--ds-line)",
              marginBottom: 16, fontSize: 13, color: direction ? "var(--ds-ink)" : "var(--ds-muted)",
              lineHeight: 1.5
            }}>
              {summaryCopy}
            </div>

            {/* Entry price preview */}
            {entryPrice !== null && (
              <div style={{ fontSize: 12, color: "var(--ds-muted)", marginBottom: 12 }}>
                Entry price: <span style={{ fontWeight: 600, color: "var(--ds-ink)" }}>{fmtUsd(entryPrice)}</span>
              </div>
            )}

            {/* Errors / success */}
            {submitError && (
              <p style={{
                fontSize: 13, color: "#cf202f", margin: "0 0 10px",
                padding: "8px 12px", borderRadius: 8,
                background: "color-mix(in oklab, #cf202f 8%, transparent)"
              }} role="alert">
                {submitError}
              </p>
            )}
            {submitSuccess && (
              <p style={{
                fontSize: 13, color: "var(--ds-success)", margin: "0 0 10px",
                padding: "8px 12px", borderRadius: 8,
                background: "color-mix(in oklab, var(--ds-success) 8%, transparent)"
              }} role="status">
                ✓ Prediction saved!
              </p>
            )}

            {/* Submit button */}
            <button
              type="button"
              disabled={!isFormValid || assetHasPending || submitting}
              onClick={() => { void handleSubmit(); }}
              title={
                assetHasPending
                  ? `${selectedAsset} already has a pending prediction`
                  : !direction
                  ? "Choose a direction to submit"
                  : !timeframe
                  ? "Choose a timeframe to submit"
                  : !confidence
                  ? "Select your confidence level to submit"
                  : undefined
              }
              style={{
                width: "100%", padding: "13px 0", borderRadius: 999,
                background: isFormValid && !assetHasPending && !submitting
                  ? "var(--ds-brand)" : "var(--ds-surface-2)",
                color: isFormValid && !assetHasPending && !submitting
                  ? "#fff" : "var(--ds-muted)",
                border: "none",
                cursor: isFormValid && !assetHasPending && !submitting ? "pointer" : "not-allowed",
                fontFamily: "var(--ds-font-display)", fontSize: 14, fontWeight: 700,
                letterSpacing: "-0.01em", transition: "opacity 0.15s"
              }}
            >
              {submitting ? "Saving…" : assetHasPending ? `${selectedAsset} pending…` : "Lock in prediction →"}
            </button>
          </div>

          {/* Stats mini-row (always show once data loaded) */}
          {stats && stats.total > 0 && (
            <div className="ds-card" style={{ padding: 20 }}>
              <p style={{
                fontFamily: "var(--ds-font-display)", fontSize: 10.5, fontWeight: 700,
                letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--ds-muted)", margin: "0 0 14px"
              }}>
                Your record
              </p>
              <div style={{ display: "flex", gap: 20 }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: "var(--ds-font-display)", fontSize: 26, fontWeight: 800,
                    letterSpacing: "-0.04em", color: "var(--ds-ink)", lineHeight: 1
                  }}>
                    {stats.total}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ds-muted)", marginTop: 3 }}>Total</div>
                </div>
                <div style={{ width: 1, background: "var(--ds-line)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: "var(--ds-font-display)", fontSize: 26, fontWeight: 800,
                    letterSpacing: "-0.04em",
                    color: stats.resolved > 0 ? (stats.accuracy >= 50 ? "var(--ds-success)" : "#cf202f") : "var(--ds-ink)",
                    lineHeight: 1
                  }}>
                    {stats.resolved > 0 ? `${stats.accuracy}%` : "—"}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ds-muted)", marginTop: 3 }}>Accuracy</div>
                </div>
                <div style={{ width: 1, background: "var(--ds-line)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{
                    fontFamily: "var(--ds-font-display)", fontSize: 26, fontWeight: 800,
                    letterSpacing: "-0.04em", color: "var(--ds-warn)", lineHeight: 1
                  }}>
                    {pendingCount}
                  </div>
                  <div style={{ fontSize: 11.5, color: "var(--ds-muted)", marginTop: 3 }}>Pending</div>
                </div>
              </div>
            </div>
          )}

          {/* Calibration Score card */}
          <PredictionStatsCard
            score={stats?.calibration_score ?? 50}
            label={stats?.calibration_score_label ?? "Learning"}
            resolvedCount={stats?.resolved ?? 0}
          />

          {/* What this teaches */}
          <div className="ds-card" style={{ padding: 20 }}>
            <h2 style={{
              fontFamily: "var(--ds-font-display)", fontSize: 15, fontWeight: 700,
              letterSpacing: "-0.02em", color: "var(--ds-ink)", margin: "0 0 4px"
            }}>
              What this teaches
            </h2>
            <p style={{ fontSize: 13, color: "var(--ds-muted)", margin: "0 0 18px" }}>
              Why we bother with predictions.
            </p>

            {[
              {
                icon: "📊",
                title: "Calibration > accuracy",
                body: "Being 60% sure when you're right 60% of the time is better than being 90% sure when you're right half the time."
              },
              {
                icon: "🎯",
                title: "Narrow beats wide",
                body: '"It\'ll move a lot" isn\'t a prediction. A specific direction & size is.'
              },
              {
                icon: "⏱",
                title: "Short is harder",
                body: "Short-term moves are closer to coin-flips than your gut suggests."
              }
            ].map(({ icon, title, body }) => (
              <div key={title} style={{ display: "flex", gap: 12, marginBottom: 16 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: "var(--ds-brand-soft)",
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16
                }}>
                  {icon}
                </div>
                <div>
                  <p style={{
                    fontFamily: "var(--ds-font-display)", fontSize: 13.5, fontWeight: 700,
                    color: "var(--ds-ink)", margin: "0 0 3px"
                  }}>
                    {title}
                  </p>
                  <p style={{ fontSize: 12.5, color: "var(--ds-muted)", margin: 0, lineHeight: 1.55 }}>
                    {body}
                  </p>
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}
