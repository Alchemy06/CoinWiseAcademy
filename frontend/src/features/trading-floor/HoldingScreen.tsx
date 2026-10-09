/**
 * HoldingScreen.tsx
 *
 * Shown between rounds in the Trading Floor scenario player.
 * Simulates an open market position by:
 *   - Ticking the last-seen asset price ±0.3% every 400 ms
 *   - Displaying an unrealised P&L based on price drift vs entry
 *   - Running a 3-second animated countdown, then calling onDone()
 *
 * The component is purely cosmetic — no real market data is fetched.
 * Its only job is to make the "holding a position" moment feel real
 * before the next scenario decision appears.
 */

import { useEffect, useRef, useState } from "react";

interface HoldingScreenProps {
  /** Base price from the completed node's market_context */
  basePrice: number;
  /** Ticker symbol, e.g. "BTC" */
  asset: string;
  /** Current portfolio balance (used for unrealised P&L scale) */
  currentBalance: number;
  /** ISO 4217 code, e.g. "USD" */
  currency: string;
  /**
   * Net balance effect from the last choice.
   * Positive  → user went long (benefits when price rises).
   * Negative  → user went short / lost money (benefits when price falls).
   */
  balanceEffect: number;
  /** Called when the countdown hits 0 */
  onDone: () => void;
}

const COUNTDOWN_SECONDS = 3;
const TICK_INTERVAL_MS  = 400;
const VOLATILITY_PCT    = 0.003; // ±0.3 %

function fmtPrice(n: number, currency: string): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: n >= 1_000 ? 0 : 2,
  });
}

function fmtPnl(n: number, currency: string): string {
  const abs = Math.abs(n).toLocaleString("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
  return (n >= 0 ? "+" : "−") + abs;
}

export function HoldingScreen({
  basePrice,
  asset,
  currentBalance,
  currency,
  balanceEffect,
  onDone,
}: HoldingScreenProps) {
  const [tickPrice, setTickPrice] = useState(basePrice);
  const [countdown, setCountdown]   = useState(COUNTDOWN_SECONDS);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  // ── Price ticker ────────────────────────────────────────────────────────────
  useEffect(() => {
    const id = setInterval(() => {
      setTickPrice(prev => {
        const delta = (Math.random() - 0.5) * 2 * VOLATILITY_PCT;
        return prev * (1 + delta);
      });
    }, TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // ── Countdown → call onDone when it hits 0 ──────────────────────────────────
  useEffect(() => {
    if (countdown <= 0) {
      onDoneRef.current();
      return;
    }
    const id = setTimeout(() => setCountdown(c => c - 1), 1_000);
    return () => clearTimeout(id);
  }, [countdown]);

  // ── Derived values ──────────────────────────────────────────────────────────
  const isLong          = balanceEffect >= 0;
  const priceChangePct  = (tickPrice - basePrice) / basePrice;
  // Unrealised P&L: position direction × price move × 30% of balance as notional
  const unrealisedPnl   = (isLong ? 1 : -1) * priceChangePct * currentBalance * 0.30;
  const pnlPositive     = unrealisedPnl >= 0;
  const priceUp         = tickPrice >= basePrice;

  const progressWidth = `${((COUNTDOWN_SECONDS - countdown) / COUNTDOWN_SECONDS) * 100}%`;

  return (
    <div className="tf-holding-screen" aria-live="polite">
      {/* Header */}
      <div className="tf-holding-header">
        <span className="tf-holding-badge">⏳ Position Open</span>
        <span className="tf-holding-sub">Market is moving while you hold</span>
      </div>

      {/* Live price ticker */}
      <div className="tf-holding-ticker">
        <span className="tf-holding-asset">{asset}</span>
        <span className={`tf-holding-price ${priceUp ? "is-up" : "is-down"}`}>
          {fmtPrice(tickPrice, currency)}
        </span>
        <span className={`tf-holding-change ${priceUp ? "is-up" : "is-down"}`}>
          {priceUp ? "▲" : "▼"}{" "}
          {Math.abs(priceChangePct * 100).toFixed(3)}%
        </span>
      </div>

      {/* Position info */}
      <div className="tf-holding-position">
        <div className="tf-holding-pos-row">
          <span className="tf-holding-pos-label">Direction</span>
          <span className={`tf-holding-pos-value ${isLong ? "is-up" : "is-down"}`}>
            {isLong ? "▲ Long" : "▼ Short"}
          </span>
        </div>
        <div className="tf-holding-pos-row">
          <span className="tf-holding-pos-label">Unrealised P&L</span>
          <span className={`tf-holding-pos-value ${pnlPositive ? "is-up" : "is-down"}`}>
            {fmtPnl(unrealisedPnl, currency)}
          </span>
        </div>
      </div>

      {/* Countdown */}
      <div className="tf-holding-countdown">
        <span className="tf-holding-countdown-label">
          Next round in <strong>{countdown}s</strong>
        </span>
        <div className="tf-holding-bar-track" role="progressbar" aria-valuenow={COUNTDOWN_SECONDS - countdown} aria-valuemin={0} aria-valuemax={COUNTDOWN_SECONDS}>
          <div
            className="tf-holding-bar-fill"
            style={{ width: progressWidth }}
          />
        </div>
      </div>
    </div>
  );
}
