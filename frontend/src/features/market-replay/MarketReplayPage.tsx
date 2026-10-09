/**
 * MarketReplayPage.tsx — Market Replay historical trading simulator.
 * Coinbase-inspired educational UI with slow-reveal candle animation.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ReplayAttemptPayload,
  ReplayNewsEvent,
  ReplayScenario,
} from "../../types/marketReplay";
import type { MinuteCandle } from "./syntheticFill";
import {
  fetchReplayScenarios,
  startReplayAttempt,
  fetchReplayAttemptState,
  buyReplay,
  sellReplay,
} from "../../utils/marketReplay";
import { ReplayPriceChart } from "./ReplayPriceChart";
import { IconClock, IconSparkle, IconArrowRight } from "../../components/icons";
import { expandAllToMinutes, getVisibleMinuteCount } from "./syntheticFill";
import { useI18n } from "../../i18n/provider";
import type { TranslationParams } from "../../i18n/messages";
import {
  formatGBP,
  formatAsset,
  formatGBPDelta,
  formatPercentDelta,
} from "../covid-crash/lib/format";

type Translator = (source: string, params?: TranslationParams) => string;

function translateReplayScenario(scenario: ReplayScenario, tx: Translator): ReplayScenario {
  // Keep scenario translation in one helper so lobby cards and the active replay always render the same localized metadata.
  return {
    ...scenario,
    title: tx(scenario.title),
    subtitle: tx(scenario.subtitle),
    asset_name: tx(scenario.asset_name),
    lesson_tag: tx(scenario.lesson_tag),
    difficulty: tx(scenario.difficulty),
    real_event_reference: tx(scenario.real_event_reference),
  };
}

function translateReplayPayload(payload: ReplayAttemptPayload, tx: Translator): ReplayAttemptPayload {
  // Translate the nested replay payload once per render pass so downstream widgets can keep reading the original data shape.
  return {
    ...payload,
    scenario: translateReplayScenario(payload.scenario, tx),
    news_events: payload.news_events.map((event) => ({
      ...event,
      headline: tx(event.headline),
      body: tx(event.body),
      btc_context: tx(event.btc_context),
    })),
    latest_news_flash: payload.latest_news_flash
      ? {
          ...payload.latest_news_flash,
          headline: tx(payload.latest_news_flash.headline),
          body: tx(payload.latest_news_flash.body),
          btc_context: tx(payload.latest_news_flash.btc_context),
        }
      : null,
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatSecondsRemaining(secs: number): string {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

// ─── Design tokens ────────────────────────────────────────────────────────────

const BLUE  = "#2563EB";
const INK   = "#111827";
const MUTED = "#6B7280";
const CARD: React.CSSProperties = {
  background: "#FFFFFF",
  border: "1px solid #E2E8F0",
  borderRadius: 12,
};

// ═══════════════════════════════════════════════════════════════════════════════
// LOBBY
// ═══════════════════════════════════════════════════════════════════════════════

interface LobbyProps {
  scenarios: ReplayScenario[];
  isLoading: boolean;
  loadingId: number | null;
  error: string | null;
  onPlay: (scenarioId: number) => void;
}

function ReplayLobby({ scenarios, isLoading, loadingId, error, onPlay }: LobbyProps) {
  const { tx } = useI18n();
  return (
    <div className="cc-lobby">
      <div className="cc-lobby-hero">
        <div className="cc-lobby-hero-icon" aria-hidden="true">
          <IconClock size={26} stroke={1.6} />
        </div>
        <h1 className="cc-lobby-title">{tx("Market Replay")}</h1>
        <p className="cc-lobby-sub">
          {tx("Live historical simulation. The chart advances in real time across 24 hours, mapping a full year of history. Trade freely — come back hours later and see how the market moved while you were gone.")}
        </p>
      </div>

      {error && <p className="cc-lobby-error">{error}</p>}

      <section className="cc-scenarios-section">
        {isLoading ? (
          <div className="cc-scenarios-loading">{tx("Loading…")}</div>
        ) : scenarios.length === 0 ? (
          <div className="cc-scenarios-empty">{tx("No scenarios available.")}</div>
        ) : (
          <div className="cc-scenario-cards">
            {scenarios.map((s) => (
              <ReplayScenarioCard
                key={s.id}
                scenario={s}
                isLoading={loadingId === s.id}
                onPlay={onPlay}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface ReplayScenarioCardProps {
  scenario: ReplayScenario;
  isLoading: boolean;
  onPlay: (id: number) => void;
}

function ReplayScenarioCard({ scenario, isLoading, onPlay }: ReplayScenarioCardProps) {
  const { tx } = useI18n();
  const startLabel = formatDate(scenario.historical_start_date);
  const endLabel   = formatDate(scenario.historical_end_date);

  return (
    <div className="cc-scenario-card" style={{ borderTopColor: scenario.accent_color }}>
      <div className="cc-scenario-card-header">
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
          <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 999, background: `${scenario.accent_color}22`, color: scenario.accent_color, letterSpacing: "0.05em" }}>
            {scenario.difficulty}
          </span>
          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: "var(--ds-surface-2)", color: "var(--ds-muted)" }}>
            {scenario.lesson_tag}
          </span>
        </div>
        <h2 className="cc-scenario-title">{scenario.title}</h2>
        <p style={{ fontSize: 12.5, color: "var(--ds-muted)", margin: "4px 0 12px" }}>{scenario.subtitle}</p>
      </div>

      <div className="cc-replay-card-period">
        <IconClock size={12} stroke={1.7} />
        <span>{startLabel} → {endLabel}</span>
      </div>

      <p style={{ fontSize: 12, color: "var(--ds-muted)", lineHeight: 1.55, marginBottom: 18 }}>
        {scenario.real_event_reference}
      </p>

      {scenario.order === 2 && (
        <div className="cc-replay-card-callout">
          <span className="cc-replay-card-callout-icon" aria-hidden="true">
            <IconSparkle size={14} stroke={1.7} />
          </span>
          <span>
            <strong>{tx("Recommended:")}</strong>{" "}
            {tx("Play Scenario 1 (The COVID Crash) first. This scenario involves sub-penny asset prices and a total collapse — best appreciated after understanding how a recovery scenario works.")}
          </span>
        </div>
      )}

      <button
        className="cc-scenario-card-btn"
        style={{ background: scenario.accent_color }}
        disabled={isLoading}
        onClick={() => onPlay(scenario.id)}
        type="button"
      >
        <span>{isLoading ? tx("Loading…") : tx("Start Replay")}</span>
        {!isLoading && <IconArrowRight size={14} stroke={1.8} />}
      </button>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COINBASE-STYLE UI COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── Allocation donut ──────────────────────────────────────────────────────────

function AllocationDonut({ btcPct }: { btcPct: number }) {
  const { tx } = useI18n();
  const r    = 36;
  const circ = 2 * Math.PI * r;
  const fill = Math.max(0, Math.min(btcPct, 1)) * circ;
  return (
    <svg width={92} height={92} viewBox="0 0 92 92" aria-hidden="true">
      <circle cx={46} cy={46} r={r} fill="none" stroke="#E2E8F0" strokeWidth={11} />
      {fill > 0 && (
        <circle
          cx={46} cy={46} r={r} fill="none"
          stroke={BLUE} strokeWidth={11}
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeDashoffset={circ * 0.25}
          strokeLinecap="round"
        />
      )}
      <text x={46} y={42} textAnchor="middle" fontSize={14} fontWeight={700} fill={INK}>
        {Math.round(btcPct * 100)}%
      </text>
      <text x={46} y={55} textAnchor="middle" fontSize={9.5} fill={MUTED}>
        {tx("in BTC")}
      </text>
    </svg>
  );
}

// ── Featured event card ───────────────────────────────────────────────────────

const IMPACT_META: Record<string, { dot: string; label: string }> = {
  critical: { dot: "#EF4444", label: "CRITICAL" },
  high:     { dot: "#F59E0B", label: "HIGH" },
  medium:   { dot: BLUE,      label: "MEDIUM" },
  low:      { dot: "#6B7280", label: "LOW" },
};

function FeaturedEventCard({ event, flashKey }: { event: ReplayNewsEvent; flashKey: number }) {
  const { tx, formatDate } = useI18n();
  const meta = IMPACT_META[event.impact] ?? IMPACT_META.low;
  return (
    <div
      key={flashKey}
      style={{
        background: "#0F2744",
        borderRadius: 12,
        padding: "18px 20px",
        marginBottom: 12,
        animation: "replayBannerFlash 0.5s ease-out",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 9px", borderRadius: 999, background: `${meta.dot}22`, color: meta.dot, letterSpacing: "0.07em", border: `1px solid ${meta.dot}44` }}>
              {tx("{level} IMPACT", { level: tx(meta.label) })}
            </span>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.40)" }}>{formatDate(new Date(event.date))}</span>
          </div>
          <p style={{ fontWeight: 700, fontSize: 15, color: "white", margin: "0 0 6px", lineHeight: 1.35 }}>
            {event.headline}
          </p>
          <p style={{ fontSize: 12.5, color: "rgba(255,255,255,0.65)", margin: 0, lineHeight: 1.6 }}>
            {event.body}
          </p>
        </div>
        <div style={{ width: 52, height: 52, borderRadius: 10, background: `${BLUE}33`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 26 }}>
          ₿
        </div>
      </div>
      {event.btc_context && (
        <div style={{ marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.08)", fontSize: 12, color: "rgba(255,255,255,0.45)", display: "flex", gap: 6 }}>
          <span style={{ color: "rgba(255,255,255,0.30)", fontWeight: 600, flexShrink: 0 }}>{tx("Earlier:")}</span>
          <span>{event.btc_context}</span>
        </div>
      )}
    </div>
  );
}

// ── News & Events panel ───────────────────────────────────────────────────────

function NewsEventCard({ event }: { event: ReplayNewsEvent }) {
  const { tx, formatDate } = useI18n();
  const meta = IMPACT_META[event.impact] ?? IMPACT_META.low;
  return (
    <div style={{ padding: "12px 0", borderBottom: "1px solid #F1F5F9" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
        <div style={{ width: 8, height: 8, borderRadius: "50%", background: meta.dot, marginTop: 5, flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
            <span style={{ fontSize: 11, color: MUTED }}>{formatDate(new Date(event.date))}</span>
            <span style={{ fontSize: 10, fontWeight: 700, color: meta.dot, letterSpacing: "0.05em" }}>
              • {tx(meta.label)}
            </span>
          </div>
          <p style={{ fontWeight: 600, fontSize: 12.5, color: INK, margin: "0 0 3px", lineHeight: 1.4 }}>
            {event.headline}
          </p>
          <p style={{ fontSize: 11.5, color: MUTED, margin: 0, lineHeight: 1.5 }}>
            {event.btc_context}
          </p>
        </div>
      </div>
    </div>
  );
}

function NewsEventsPanel({ events }: { events: ReplayNewsEvent[] }) {
  const { tx } = useI18n();
  const displayed = [...events].reverse().slice(0, 7);
  return (
    <div style={{ ...CARD, padding: "16px 16px 0", height: "fit-content" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontWeight: 700, fontSize: 14, color: INK }}>{tx("News & Events")}</span>
        {events.length > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, background: "#EFF6FF", color: BLUE, padding: "2px 8px", borderRadius: 999 }}>
            {events.length}
          </span>
        )}
      </div>
      {events.length === 0 ? (
        <p style={{ fontSize: 12.5, color: MUTED, padding: "14px 0" }}>
          {tx("Events will appear as the replay progresses…")}
        </p>
      ) : (
        displayed.map((e) => <NewsEventCard key={e.id} event={e} />)
      )}
      {events.length > 7 && (
        <button type="button" style={{ width: "100%", padding: "12px 0", color: BLUE, fontSize: 13, fontWeight: 600, background: "none", border: "none", cursor: "pointer", borderTop: "1px solid #F1F5F9" }}>
          {tx("View all {count} events →", { count: events.length })}
        </button>
      )}
      <div style={{ height: events.length > 0 && events.length <= 7 ? 8 : 0 }} />
    </div>
  );
}

// ── Price summary card ────────────────────────────────────────────────────────

function PriceSummaryCard({ pricePence, assetSymbol, currentSimulatedIso }: { pricePence: number; assetSymbol: string; currentSimulatedIso: string }) {
  const { tx, formatDate } = useI18n();
  return (
    <div style={{ ...CARD, padding: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 4px" }}>
        {assetSymbol} / GBP
      </p>
      <p style={{ fontSize: 26, fontWeight: 800, color: INK, margin: "0 0 4px", letterSpacing: "-0.03em", lineHeight: 1 }}>
        {formatGBP(pricePence)}
      </p>
      <p style={{ fontSize: 11.5, color: MUTED, margin: "10px 0 0" }}>
        {tx("Replay time:")} {formatDate(new Date(currentSimulatedIso))}
      </p>
    </div>
  );
}

// ── Portfolio card ────────────────────────────────────────────────────────────

function PortfolioCard({ state, assetSymbol, pricePence }: { state: ReplayAttemptPayload["state"]; assetSymbol: string; pricePence: number }) {
  const { tx } = useI18n();
  void pricePence; // referenced for future sparkline
  const totalValue = state.total_value_pence;
  const btcPct     = totalValue > 0 ? state.position_value_pence / totalValue : 0;

  return (
    <div style={{ ...CARD, padding: 20 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: MUTED, letterSpacing: "0.07em", textTransform: "uppercase", margin: "0 0 12px" }}>
        {tx("Your Portfolio")}
      </p>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {[
            [tx("Cash"),                   formatGBP(state.cash_pence)],
            [tx("{asset} held", { asset: assetSymbol }),    formatAsset(state.btc_held_satoshis, assetSymbol)],
            [tx("Position value"),         formatGBP(state.position_value_pence)],
          ].map(([label, val]) => (
            <div key={label} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: MUTED }}>{label}</span>
              <span style={{ fontWeight: 500, color: INK }}>{val}</span>
            </div>
          ))}
          <div style={{ borderTop: "1px solid #F1F5F9", paddingTop: 7, marginTop: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: MUTED }}>{tx("Total value")}</span>
              <span style={{ fontWeight: 700, color: INK }}>{formatGBP(totalValue)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: MUTED }}>{tx("P&L")}</span>
              <span style={{ fontWeight: 600, color: state.total_delta_pence >= 0 ? "#10B981" : "#EF4444" }}>{formatGBPDelta(state.total_delta_pence)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
              <span style={{ color: MUTED }}>{tx("Return")}</span>
              <span style={{ fontWeight: 600, color: state.total_delta_pence >= 0 ? "#10B981" : "#EF4444" }}>{formatPercentDelta(state.total_delta_basis_pts)}</span>
            </div>
            {state.avg_entry_price_pence > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ color: MUTED }}>{tx("Avg entry")}</span>
                <span style={{ fontWeight: 500, color: INK }}>{formatGBP(state.avg_entry_price_pence)}</span>
              </div>
            )}
            {state.btc_held_satoshis > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                <span style={{ color: MUTED }}>{tx("Unrealised P&L")}</span>
                <span style={{ fontWeight: 600, color: state.unrealised_pnl_pence >= 0 ? "#10B981" : "#EF4444" }}>{formatGBPDelta(state.unrealised_pnl_pence)}</span>
              </div>
            )}
          </div>
        </div>
        <AllocationDonut btcPct={btcPct} />
      </div>
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: BLUE }} />
          <span style={{ fontSize: 11, color: MUTED }}>{assetSymbol} {Math.round(btcPct * 100)}%</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#E2E8F0" }} />
          <span style={{ fontSize: 11, color: MUTED }}>{tx("Cash {pct}%", { pct: Math.round((1 - btcPct) * 100) })}</span>
        </div>
      </div>
    </div>
  );
}

// ── Buy / Sell card ───────────────────────────────────────────────────────────

function BuySellCard({
  state, pricePence, isCompleteForToday, isSubmitting, tradeError,
  activeTab, setActiveTab, onBuy, onSell,
  positionValueIsDust, positionIsMinuscule, assetSymbol,
}: {
  state: ReplayAttemptPayload["state"];
  pricePence: number;
  isCompleteForToday: boolean;
  isSubmitting: boolean;
  tradeError: string | null;
  activeTab: "buy" | "sell";
  setActiveTab: (t: "buy" | "sell") => void;
  onBuy: (pence: number) => void;
  onSell: (sats: number) => void;
  positionValueIsDust: boolean;
  positionIsMinuscule: boolean;
  assetSymbol: string;
}) {
  const { tx } = useI18n();
  const [buyAmount, setBuyAmount] = useState("");
  const [sellPct, setSellPct]     = useState<number | null>(null);

  const cashGBP      = state.cash_pence / 100;
  const buyAmountNum = parseFloat(buyAmount) || 0;
  const buyPence     = Math.round(buyAmountNum * 100);
  const canBuy       = buyPence > 0 && buyPence <= state.cash_pence;
  const sellSats     = sellPct !== null ? Math.floor(state.btc_held_satoshis * sellPct) : 0;
  const canSell      = sellSats > 0 && state.btc_held_satoshis > 0;

  const handleBuyClick = () => {
    if (canBuy) { onBuy(buyPence); setBuyAmount(""); }
  };
  const handleSellClick = () => {
    if (canSell) { onSell(sellSats); setSellPct(null); }
  };

  if (isCompleteForToday) {
    return (
      <div style={{ ...CARD, padding: 24, textAlign: "center" }}>
        <p style={{ fontSize: 30, margin: "0 0 8px" }}>🏁</p>
        <p style={{ fontWeight: 700, fontSize: 14, color: INK, margin: "0 0 5px" }}>{tx("Today's session complete")}</p>
        <p style={{ fontSize: 13, color: MUTED }}>{tx("Return tomorrow for a fresh replay.")}</p>
      </div>
    );
  }

  const tabBtn = (tab: "buy" | "sell") => ({
    flex: 1, padding: "13px 0", fontWeight: 700, fontSize: 13,
    border: "none", cursor: "pointer" as const,
    background: activeTab === tab ? (tab === "buy" ? "#ECFDF5" : "#FEF2F2") : "#F8FAFC",
    color: activeTab === tab ? (tab === "buy" ? "#10B981" : "#EF4444") : MUTED,
    borderBottom: `2px solid ${activeTab === tab ? (tab === "buy" ? "#10B981" : "#EF4444") : "#E2E8F0"}`,
  });

  return (
    <div style={{ ...CARD, overflow: "hidden" }}>
      <div style={{ display: "flex" }}>
        <button type="button" style={tabBtn("buy")} onClick={() => setActiveTab("buy")}>{tx("BUY")}</button>
        <button type="button" style={tabBtn("sell")} onClick={() => setActiveTab("sell")}>{tx("SELL")}</button>
      </div>

      <div style={{ padding: "16px 18px" }}>
        {tradeError && (
          <div style={{ padding: "8px 11px", borderRadius: 6, background: "#FEF2F2", border: "1px solid #FECACA", color: "#EF4444", fontSize: 12, marginBottom: 10 }}>
            {tradeError}
          </div>
        )}

        {activeTab === "buy" ? (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{tx("Buy {asset}", { asset: assetSymbol })}</span>
              <span style={{ fontSize: 11.5, color: MUTED }}>{tx("Available:")} {formatGBP(state.cash_pence)}</span>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 4 }}>{tx("Amount (GBP)")}</label>
            <input
              type="number" min={0} value={buyAmount} onChange={(e) => setBuyAmount(e.target.value)}
              placeholder="0.00"
              style={{ width: "100%", padding: "9px 11px", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 15, fontWeight: 600, color: INK, outline: "none", boxSizing: "border-box" }}
            />
            <div style={{ display: "flex", gap: 6, margin: "8px 0 12px" }}>
              {[0.25, 0.5, 0.75, 1].map((p) => (
                <button key={p} type="button"
                  onClick={() => setBuyAmount((cashGBP * p).toFixed(2))}
                  style={{ flex: 1, padding: "6px 0", fontSize: 12, fontWeight: 600, border: "1px solid #E2E8F0", borderRadius: 6, background: "#F8FAFC", color: INK, cursor: "pointer" }}>
                  {p === 1 ? tx("Max") : `${Math.round(p * 100)}%`}
                </button>
              ))}
            </div>
            <button type="button" disabled={!canBuy || isSubmitting} onClick={handleBuyClick}
              style={{ width: "100%", padding: "11px 0", background: canBuy && !isSubmitting ? BLUE : "#E2E8F0", color: canBuy && !isSubmitting ? "white" : MUTED, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: canBuy && !isSubmitting ? "pointer" : "not-allowed" }}>
              {isSubmitting ? tx("Placing order…") : `🛒 ${tx("Buy {asset}", { asset: assetSymbol })}`}
            </button>
          </>
        ) : (
          <>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{tx("Sell {asset}", { asset: assetSymbol })}</span>
              <span style={{ fontSize: 11.5, color: MUTED }}>{tx("Held:")} {formatAsset(state.btc_held_satoshis, assetSymbol)}</span>
            </div>
            <label style={{ fontSize: 11, fontWeight: 600, color: MUTED, display: "block", marginBottom: 6 }}>{tx("Sell amount")}</label>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {[0.25, 0.5, 0.75, 1].map((p) => (
                <button key={p} type="button" onClick={() => setSellPct(p)}
                  style={{ flex: 1, padding: "9px 0", fontSize: 12, fontWeight: 600, border: `1px solid ${sellPct === p ? BLUE : "#E2E8F0"}`, borderRadius: 6, background: sellPct === p ? "#EFF6FF" : "#F8FAFC", color: sellPct === p ? BLUE : INK, cursor: "pointer" }}>
                  {p === 1 ? tx("All") : `${Math.round(p * 100)}%`}
                </button>
              ))}
            </div>
            {sellPct !== null && state.btc_held_satoshis > 0 && (
              <p style={{ fontSize: 12, color: MUTED, marginBottom: 8 }}>
                ≈ {formatGBP(Math.round(sellSats * pricePence / 100_000_000))} {tx("at current price")}
              </p>
            )}
            {(positionValueIsDust || positionIsMinuscule) && (
              <p style={{ fontSize: 12, color: "#F59E0B", marginBottom: 8 }}>
                ⚠ {tx("Position nearly worthless — sell all to recover remaining dust.")}
              </p>
            )}
            <button type="button" disabled={!canSell || isSubmitting} onClick={handleSellClick}
              style={{ width: "100%", padding: "11px 0", background: canSell && !isSubmitting ? "#EF4444" : "#E2E8F0", color: canSell && !isSubmitting ? "white" : MUTED, border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: canSell && !isSubmitting ? "pointer" : "not-allowed" }}>
              {isSubmitting ? tx("Placing order…") : tx("Sell {asset}", { asset: assetSymbol })}
            </button>
          </>
        )}

        <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 8, background: "#F8FAFC", border: "1px solid #E2E8F0", display: "flex", alignItems: "flex-start", gap: 8 }}>
          <span style={{ fontSize: 15, flexShrink: 0 }}>🛡️</span>
          <div>
            <p style={{ fontSize: 11, fontWeight: 700, color: INK, margin: "0 0 2px" }}>{tx("This is a simulation")}</p>
            <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{tx("You're practising with virtual funds. No real money is at risk.")}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Insight cards ─────────────────────────────────────────────────────────────

function InsightCards({ scenario }: { scenario: ReplayScenario }) {
  const { tx } = useI18n();
  const isLuna = scenario.asset_symbol === "LUNA";
  const cards  = isLuna
    ? [
        { icon: "📉", title: "What happened?",   body: "TerraUSD's algorithmic peg broke, triggering a hyperinflationary death spiral that wiped out $40B in value within days." },
        { icon: "💡", title: "Why it mattered",  body: "It exposed the fragility of algorithmic stablecoins and showed how quickly confidence can collapse in crypto markets." },
        { icon: "🎓", title: "What we can learn", body: "Diversification and risk management are essential. Never invest more than you can afford to lose in high-risk assets." },
      ]
    : [
        { icon: "📉", title: "What happened?",   body: "COVID-19 spread globally, causing panic sell-offs across all asset classes. Bitcoin fell over 50% in days before rebounding sharply." },
        { icon: "💡", title: "Why it mattered",  body: "The event showed how quickly markets can move and the impact of global uncertainty — and that crypto can recover fast from macro shocks." },
        { icon: "🎓", title: "What we can learn", body: "Volatility is normal. Staying informed and having a plan helps you make better decisions under pressure rather than panic selling." },
      ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
      {cards.map((c) => (
        <div key={c.title} style={{ ...CARD, padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <span style={{ fontSize: 20 }}>{c.icon}</span>
            <p style={{ fontWeight: 700, fontSize: 13, color: INK, margin: 0 }}>{tx(c.title)}</p>
          </div>
          <p style={{ fontSize: 12.5, color: MUTED, margin: 0, lineHeight: 1.65 }}>{tx(c.body)}</p>
        </div>
      ))}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// STRUCTURAL SIGNAL BANNER (LUNA-specific)
// ═══════════════════════════════════════════════════════════════════════════════

function StructuralSignalBanner({ simulatedDatetime }: { simulatedDatetime: string }) {
  const { tx } = useI18n();
  const d = simulatedDatetime.slice(0, 10);
  let level: "warning" | "critical" | "terminal" | null = null;
  let title = "";
  let body  = "";

  if (d >= "2022-05-13") {
    level = "terminal";
    title = "TERMINAL: Blockchain halted. Algorithm failed.";
    body  = "The Terra blockchain has been halted. The LUNA supply has hyperinflated past 6.9 trillion tokens. UST has lost its peg permanently. LUNA is effectively worthless. This is what a complete algorithmic stablecoin death spiral looks like.";
  } else if (d >= "2022-05-11") {
    level = "critical";
    title = "CRITICAL: Death spiral confirmed. Supply hyperinflating.";
    body  = "The LUNA supply has increased over 10,000x in 72 hours as the algorithm mints tokens to defend UST. Each new LUNA is worth less, which mints more LUNA, which is worth even less. The math is irreversible. UST will not recover. Exit is the only rational action.";
  } else if (d >= "2022-05-09") {
    level = "warning";
    title = "WARNING: UST losing peg — LUNA inflation mechanism activating.";
    body  = "UST has fallen below $0.97. To restore the peg, the protocol is minting new LUNA to buy UST. If selling pressure continues, this mint mechanism will accelerate — expanding LUNA supply, driving down LUNA price, and requiring even more minting. A death spiral is possible.";
  }

  if (!level) return null;

  const colors = {
    warning:  { bg: "#7B3500", border: "#F5A623", text: "#F5A623" },
    critical: { bg: "#5C0008", border: "#E8354A", text: "#FF6B7A" },
    terminal: { bg: "#1A0000", border: "#8B0000", text: "#FF4444" },
  };
  const c = colors[level];

  return (
    <div role="alert" style={{ background: c.bg, border: `1.5px solid ${c.border}`, borderRadius: 8, padding: "12px 16px", marginBottom: 12 }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: c.text, letterSpacing: "0.04em", textTransform: "uppercase", margin: "0 0 5px" }}>
        ⚠ {tx(title)}
      </p>
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.80)", margin: 0, lineHeight: 1.55 }}>{tx(body)}</p>
    </div>
  );
}

// ─── Log scale helper ─────────────────────────────────────────────────────────

function shouldUseLogScale(candles: MinuteCandle[]): boolean {
  if (candles.length < 2) return false;
  let max = 0, min = Infinity;
  for (const c of candles) {
    if (c.close > 0) {
      if (c.close > max) max = c.close;
      if (c.close < min) min = c.close;
    }
  }
  return min < Infinity && min > 0 && max / min > 100;
}

// ═══════════════════════════════════════════════════════════════════════════════
// PLAYER
// ═══════════════════════════════════════════════════════════════════════════════

// Real milliseconds per minute candle at 1× speed.
const MS_PER_CANDLE = 8_000;

const SPEED_OPTIONS = [
  { label: "0.5×", value: 0.5 },
  { label: "1×",   value: 1   },
  { label: "2×",   value: 2   },
  { label: "4×",   value: 4   },
];

interface PlayerProps {
  initialPayload: ReplayAttemptPayload;
  onBack: () => void;
}

function ReplayPlayer({ initialPayload, onBack }: PlayerProps) {
  const { tx, formatDate } = useI18n();
  const [payload, setPayload]           = useState(initialPayload);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeError, setTradeError]     = useState<string | null>(null);
  const [activeTab, setActiveTab]       = useState<"buy" | "sell">("buy");

  // ── Animation state ────────────────────────────────────────────────────────
  const [allMinuteCandles, setAllMinuteCandles]   = useState<MinuteCandle[]>([]);
  const [visibleCandles, setVisibleCandles]         = useState<MinuteCandle[]>([]);
  const [allNewsEvents, setAllNewsEvents]           = useState<ReplayNewsEvent[]>([]);
  const [progressFraction, setProgressFraction]     = useState(initialPayload.progress_fraction);
  const [secondsRemaining, setSecondsRemaining]     = useState(initialPayload.seconds_remaining);
  const [flashKey, setFlashKey]                     = useState(0);
  const [isLoadingAllCandles, setIsLoadingAllCandles] = useState(true);
  const translatedPayload = useMemo(() => translateReplayPayload(payload, tx), [payload, tx]);

  // ── Playback controls ─────────────────────────────────────────────────────
  const [isPaused, setIsPaused]         = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);

  const startedAtRef           = useRef<number | null>(null);
  const animFrameRef           = useRef<number | null>(null);
  const prevLatestEventDateRef = useRef<string | null>(null);
  const prevVisibleCountRef    = useRef(0);
  const lastUiUpdateRef        = useRef(0);
  const isPausedRef            = useRef(false);
  const playbackSpeedRef       = useRef(1);

  // ── Pre-load full scenario candles once ───────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const fullState = await fetchReplayAttemptState(payload.attempt_id, undefined, true);
        if (cancelled) return;
        const allMins   = expandAllToMinutes(fullState.candles);
        const initCount = Math.max(1, getVisibleMinuteCount(allMins, fullState.progress_fraction));
        prevVisibleCountRef.current = initCount;
        lastUiUpdateRef.current     = 0;
        startedAtRef.current = Date.now() - initCount * (MS_PER_CANDLE / playbackSpeedRef.current);
        setAllMinuteCandles(allMins);
        setAllNewsEvents(fullState.news_events);
        setVisibleCandles(allMins.slice(0, initCount));
        setProgressFraction(fullState.progress_fraction);
        setSecondsRemaining(Math.floor((allMins.length - initCount) * MS_PER_CANDLE / 1000));
        setIsLoadingAllCandles(false);
      } catch {
        if (!cancelled) setIsLoadingAllCandles(false);
      }
    };
    void load();
    return () => { cancelled = true; };
  }, [payload.attempt_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── requestAnimationFrame animation loop ──────────────────────────────────
  useEffect(() => {
    if (allMinuteCandles.length === 0 || startedAtRef.current === null) return;

    const tick = () => {
      const now = Date.now();

      if (isPausedRef.current) {
        // Keep anchor fresh so we don't jump when resuming
        startedAtRef.current = now - prevVisibleCountRef.current * (MS_PER_CANDLE / playbackSpeedRef.current);
        animFrameRef.current = requestAnimationFrame(tick);
        return;
      }

      const effectiveMsPerCandle = MS_PER_CANDLE / playbackSpeedRef.current;
      const elapsedMs    = now - startedAtRef.current!;
      const visibleCount = Math.min(Math.floor(elapsedMs / effectiveMsPerCandle), allMinuteCandles.length);

      if (visibleCount > prevVisibleCountRef.current) {
        prevVisibleCountRef.current = visibleCount;
        setVisibleCandles(allMinuteCandles.slice(0, visibleCount));
      }

      if (now - lastUiUpdateRef.current >= 1000) {
        lastUiUpdateRef.current = now;
        setProgressFraction(visibleCount / allMinuteCandles.length);
        setSecondsRemaining(Math.floor((allMinuteCandles.length - visibleCount) * effectiveMsPerCandle / 1000));
      }

      if (visibleCount < allMinuteCandles.length) {
        animFrameRef.current = requestAnimationFrame(tick);
      }
    };
    animFrameRef.current = requestAnimationFrame(tick);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
    };
  }, [allMinuteCandles]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Playback controls handlers ────────────────────────────────────────────

  const handleTogglePause = useCallback(() => {
    const next = !isPausedRef.current;
    isPausedRef.current = next;
    if (!next) {
      // Resume: re-anchor so no jump
      startedAtRef.current = Date.now() - prevVisibleCountRef.current * (MS_PER_CANDLE / playbackSpeedRef.current);
    }
    setIsPaused(next);
  }, []);

  const handleSpeedChange = useCallback((newSpeed: number) => {
    playbackSpeedRef.current = newSpeed;
    // Re-anchor to preserve current position at new speed
    startedAtRef.current = Date.now() - prevVisibleCountRef.current * (MS_PER_CANDLE / newSpeed);
    setPlaybackSpeed(newSpeed);
  }, []);

  // ── Derived simulated date ────────────────────────────────────────────────
  const currentSimulatedDate = useMemo(() => {
    const s      = payload.scenario;
    const startMs = new Date(s.historical_start_date + "T00:00:00Z").getTime();
    const endMs   = new Date(s.historical_end_date   + "T23:59:59Z").getTime();
    return new Date(Math.min(startMs + progressFraction * (endMs - startMs), endMs));
  }, [progressFraction, payload.scenario]);

  const currentSimulatedIso = currentSimulatedDate.toISOString();

  // ── Client-side news revelation ───────────────────────────────────────────
  const revealedNewsEvents = useMemo(
    () => allNewsEvents.filter((e) => new Date(e.date) <= currentSimulatedDate),
    [allNewsEvents, currentSimulatedDate],
  );

  const latestNewsEvent = revealedNewsEvents.length > 0 ? revealedNewsEvents[revealedNewsEvents.length - 1] : null;

  const latestEventDate = latestNewsEvent?.date ?? null;
  useEffect(() => {
    if (!latestEventDate) return;
    if (prevLatestEventDateRef.current === null) { prevLatestEventDateRef.current = latestEventDate; return; }
    if (latestEventDate !== prevLatestEventDateRef.current) {
      prevLatestEventDateRef.current = latestEventDate;
      setFlashKey((k) => k + 1);
    }
  }, [latestEventDate]);

  const logScale = useMemo(() => shouldUseLogScale(allMinuteCandles), [allMinuteCandles]);

  // ── Portfolio poll ────────────────────────────────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const fresh = await fetchReplayAttemptState(payload.attempt_id);
        setPayload({ ...fresh, candles: [], news_events: [] });
      } catch { /* silently swallow */ }
    };
    const id = setInterval(() => void poll(), 60_000);
    return () => clearInterval(id);
  }, [payload.attempt_id]);

  // ── Trade handlers ────────────────────────────────────────────────────────
  const handleBuy = useCallback(async (amountPence: number) => {
    setIsSubmitting(true); setTradeError(null);
    try {
      const result = await buyReplay(payload.attempt_id, amountPence);
      setPayload((prev) => ({ ...prev, state: result.state, current_price_pence: result.current_price_pence }));
    } catch (err: unknown) {
      setTradeError(err instanceof Error ? err.message : tx("Buy failed."));
    } finally { setIsSubmitting(false); }
  }, [payload.attempt_id]);

  const handleSell = useCallback(async (satoshis: number) => {
    setIsSubmitting(true); setTradeError(null);
    try {
      const result = await sellReplay(payload.attempt_id, satoshis);
      setPayload((prev) => ({ ...prev, state: result.state, current_price_pence: result.current_price_pence }));
    } catch (err: unknown) {
      setTradeError(err instanceof Error ? err.message : tx("Sell failed."));
    } finally { setIsSubmitting(false); }
  }, [payload.attempt_id]);

  const { state }   = translatedPayload;
  const pricePence  = translatedPayload.current_price_pence;
  const isCompleteForToday = payload.is_complete_for_today || progressFraction >= 1.0;
  const positionValueIsDust   = state.btc_held_satoshis > 0 && Math.round((state.btc_held_satoshis * pricePence) / 100_000_000) === 0;
  const positionIsMinuscule   = state.btc_held_satoshis > 0 && state.position_value_pence < Math.max(1, Math.floor(state.starting_balance_pence / 100));
  const isLunaScenario        = translatedPayload.scenario.asset_symbol === "LUNA";
  const assetSymbol           = translatedPayload.scenario.asset_symbol;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ background: "#F8FAFC", minHeight: "100vh", paddingBottom: 48 }}>

      {/* ── Header ── */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "14px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={onBack} type="button" style={{ background: "none", border: "none", color: MUTED, fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", gap: 4, padding: 0 }}>
            ← {tx("Back to Time Machine")}
          </button>
          <div style={{ width: 1, height: 28, background: "#E2E8F0" }} />
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 800, color: INK, margin: 0, lineHeight: 1.2 }}>
              {translatedPayload.scenario.title}
            </h1>
            <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>
              {tx("Market Replay")} · {assetSymbol}/GBP
            </p>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button type="button" style={{ padding: "7px 14px", border: "1px solid #E2E8F0", borderRadius: 8, background: "white", fontSize: 12, fontWeight: 600, color: INK, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
            🔖 {tx("Save Replay")}
          </button>
          <button type="button" style={{ width: 34, height: 34, border: "1px solid #E2E8F0", borderRadius: 8, background: "white", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            ⚙️
          </button>
        </div>
      </div>

      {/* ── Timeline scrubber ── */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "12px 24px" }}>
        <p style={{ fontSize: 10, fontWeight: 700, color: MUTED, letterSpacing: "0.08em", textTransform: "uppercase", textAlign: "center", margin: "0 0 2px" }}>
          {tx("CURRENT TIME")}
        </p>
        <p style={{ fontSize: 16, fontWeight: 700, color: INK, textAlign: "center", margin: "0 0 10px" }}>
          {formatDate(currentSimulatedIso)}
        </p>
        <div style={{ position: "relative", height: 4, background: "#E2E8F0", borderRadius: 2, margin: "0 4px" }}>
          <div style={{ width: `${Math.min(progressFraction * 100, 100)}%`, height: "100%", background: BLUE, borderRadius: 2, transition: "width 1s linear" }} />
          <div style={{ position: "absolute", left: `${Math.min(progressFraction * 100, 100)}%`, top: "50%", transform: "translate(-50%,-50%)", width: 14, height: 14, background: BLUE, borderRadius: "50%", border: "2px solid white", boxShadow: "0 1px 4px rgba(37,99,235,0.4)" }} />
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: MUTED, marginTop: 8 }}>
          <span>{formatDate(new Date(`${translatedPayload.scenario.historical_start_date}T00:00:00Z`))}</span>
          <span>{formatDate(new Date(`${translatedPayload.scenario.historical_end_date}T00:00:00Z`))}</span>
        </div>
      </div>

      {/* ── Playback controls ── */}
      <div style={{ background: "white", borderBottom: "1px solid #E2E8F0", padding: "10px 24px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        {/* Speed selector */}
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ fontSize: 12, color: MUTED, whiteSpace: "nowrap" }}>{tx("Playback speed:")}</span>
          <div style={{ display: "flex", gap: 4 }}>
            {SPEED_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSpeedChange(opt.value)}
                style={{
                  padding: "4px 10px", fontSize: 12, fontWeight: 600, borderRadius: 6,
                  border: `1px solid ${playbackSpeed === opt.value ? BLUE : "#E2E8F0"}`,
                  background: playbackSpeed === opt.value ? "#EFF6FF" : "white",
                  color: playbackSpeed === opt.value ? BLUE : MUTED,
                  cursor: "pointer",
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Countdown */}
        <p style={{ fontSize: 13, color: MUTED, margin: 0, textAlign: "center", flex: 1 }}>
          {isCompleteForToday
            ? tx("Scenario complete for today — return tomorrow for a fresh start.")
            : isPaused
            ? tx("Replay paused")
            : tx("Chart advances further in {time}", { time: formatSecondsRemaining(secondsRemaining) })}
        </p>

        {/* Pause / Play */}
        <button
          type="button"
          onClick={handleTogglePause}
          style={{ padding: "7px 16px", border: "1px solid #E2E8F0", borderRadius: 8, background: "white", fontSize: 12, fontWeight: 700, color: INK, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}
        >
          {isPaused ? `▶ ${tx("Play")}` : `⏸ ${tx("Pause")}`}
        </button>
      </div>

      {/* ── Main content ── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 320px", gap: 20, padding: "20px 24px" }}>

        {/* Left column */}
        <div style={{ minWidth: 0 }}>
          {/* LUNA warning */}
          {isLunaScenario && <StructuralSignalBanner simulatedDatetime={currentSimulatedIso} />}

          {/* Featured event card */}
          {latestNewsEvent && <FeaturedEventCard key={flashKey} event={translatedPayload.latest_news_flash ?? latestNewsEvent} flashKey={flashKey} />}

          {/* Loading */}
          {isLoadingAllCandles && (
            <div style={{ textAlign: "center", padding: "32px 0", color: MUTED, fontSize: 13 }}>
              {tx("Loading historical data…")}
            </div>
          )}

          {/* Chart card */}
          <div style={{ ...CARD, overflow: "hidden" }}>
            <div style={{ padding: "14px 18px 0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: INK }}>{tx("{asset}/GBP Price", { asset: assetSymbol })}</span>
              <div style={{ display: "flex", gap: 3 }}>
                {["1H","1D","1W","1M","1Y","All"].map((t) => (
                  <button key={t} type="button" style={{ padding: "3px 9px", fontSize: 11, fontWeight: 600, borderRadius: 5, border: "none", background: t === "1D" ? BLUE : "transparent", color: t === "1D" ? "white" : MUTED, cursor: "pointer" }}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <ReplayPriceChart
              minuteCandles={visibleCandles}
              actionLog={payload.action_log}
              logScale={logScale}
              assetName={assetSymbol}
            />
            <p style={{ fontSize: 10.5, color: MUTED, margin: 0, padding: "6px 18px 12px" }}>
              {tx("All prices shown in GBP · Source: CryptoCompare")}
            </p>
          </div>

          <p style={{ fontSize: 11, color: MUTED, textAlign: "right", margin: "6px 0 0" }}>
            {tx("{anchors} hourly anchors · {candles} minute candles", {
              anchors: Math.ceil(allMinuteCandles.length / 60),
              candles: visibleCandles.length,
            })}
          </p>
        </div>

        {/* Right column — News & Events */}
        <div style={{ minWidth: 0 }}>
          <NewsEventsPanel events={translatedPayload.news_events.filter((event) => revealedNewsEvents.some((revealed) => revealed.id === event.id))} />
        </div>
      </div>

      {/* ── Bottom row: price · portfolio · buy/sell ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, padding: "0 24px 20px" }}>
        <PriceSummaryCard pricePence={pricePence} assetSymbol={assetSymbol} currentSimulatedIso={currentSimulatedIso} />
        <PortfolioCard state={state} assetSymbol={assetSymbol} pricePence={pricePence} />
        <BuySellCard
          state={state} pricePence={pricePence} isCompleteForToday={isCompleteForToday}
          isSubmitting={isSubmitting} tradeError={tradeError}
          activeTab={activeTab} setActiveTab={setActiveTab}
          onBuy={handleBuy} onSell={handleSell}
          positionValueIsDust={positionValueIsDust} positionIsMinuscule={positionIsMinuscule}
          assetSymbol={assetSymbol}
        />
      </div>

      {/* ── Insight cards ── */}
      <div style={{ padding: "0 24px" }}>
        <InsightCards scenario={translatedPayload.scenario} />
      </div>

      {/* ── Trade history ── */}
      {translatedPayload.action_log.length > 0 && (
        <div style={{ padding: "20px 24px 0" }}>
          <div style={{ ...CARD, padding: 20 }}>
            <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: MUTED, margin: "0 0 12px" }}>
              {tx("Trade history")}
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[...translatedPayload.action_log].reverse().map((entry, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12.5, paddingBottom: 8, borderBottom: "1px solid #F1F5F9" }}>
                  <div>
                    <span style={{ fontWeight: 700, color: entry.action === "buy" ? "#10B981" : "#EF4444", marginRight: 6 }}>
                      {entry.action === "buy" ? `↑ ${tx("BUY")}` : `↓ ${tx("SELL")}`}
                    </span>
                    <span style={{ color: MUTED, fontSize: 11 }}>{formatDate(entry.simulated_date)}</span>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontWeight: 600, color: INK }}>{formatGBP(entry.amount_pence)}</div>
                    <div style={{ fontSize: 11, color: MUTED }}>{formatAsset(entry.btc_quantity_satoshis, assetSymbol)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Footer disclaimer ── */}
      <p style={{ fontSize: 11, color: MUTED, textAlign: "center", padding: "20px 24px 0", opacity: 0.7 }}>
        {tx("The data shown is historical and for educational purposes only. Past performance is not indicative of future results.")}
      </p>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT PAGE (lobby → player)
// ═══════════════════════════════════════════════════════════════════════════════

type PageView =
  | { view: "lobby" }
  | { view: "playing"; payload: ReplayAttemptPayload };

export function MarketReplayPage() {
  const { tx } = useI18n();
  const [scenarios, setScenarios]   = useState<ReplayScenario[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [loadingId, setLoadingId]   = useState<number | null>(null);
  const [loadError, setLoadError]   = useState<string | null>(null);
  const [pageView, setPageView]     = useState<PageView>({ view: "lobby" });
  // Pre-translate lobby cards so locale switches update immediately without mutating the fetched scenario source array.
  const translatedScenarios = useMemo(() => scenarios.map((scenario) => translateReplayScenario(scenario, tx)), [scenarios, tx]);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    fetchReplayScenarios()
      .then((list) => { if (!cancelled) { setScenarios(list); setIsLoading(false); } })
      .catch(() => { if (!cancelled) setIsLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const handlePlay = useCallback(async (scenarioId: number) => {
    setLoadingId(scenarioId); setLoadError(null);
    try {
      const payload = await startReplayAttempt(scenarioId);
      setPageView({ view: "playing", payload });
    } catch (err: unknown) {
      setLoadError(err instanceof Error ? err.message : tx("Failed to start scenario."));
    } finally { setLoadingId(null); }
  }, []);

  useEffect(() => {
    if (isLoading || scenarios.length === 0) return;
    const keyword = sessionStorage.getItem("mr_scenario");
    if (!keyword) return;
    sessionStorage.removeItem("mr_scenario");
    const match = scenarios.find((s) => s.title.toLowerCase().includes(keyword.toLowerCase()));
    if (match) {
      void handlePlay(match.id);
    }
  }, [isLoading, scenarios, handlePlay]);

  const handleBack = useCallback(() => {
    setPageView({ view: "lobby" });
    setLoadError(null);
  }, []);

  if (pageView.view === "playing") {
    return (
      <ReplayPlayer initialPayload={pageView.payload} onBack={handleBack} />
    );
  }

  return (
    <div className="cc-page ds-page ds-page-enter">
        <ReplayLobby
        scenarios={translatedScenarios}
        isLoading={isLoading}
        loadingId={loadingId}
        error={loadError}
        onPlay={(id) => void handlePlay(id)}
      />
    </div>
  );
}
