/**
 * MoveCustodyPanel.tsx — Move BTC between FTX and self-custody.
 *
 * Data contract:
 *   - User enters a GBP amount (value of BTC to move).
 *   - Quick pills (25 / 50 / 75 / All) set % of the source location's position value.
 *   - A £15 transfer fee is deducted from cash on every move.
 *   - onMove(satoshis, direction) is called after the user confirms.
 *
 * Used for both directions:
 *   direction='to_self_custody' — withdraw from FTX to hardware wallet
 *   direction='to_ftx'          — deposit from hardware wallet to FTX
 */

import { useCallback, useState } from "react";
import { formatGBP, formatBTC } from "../lib/format";

const TRANSFER_FEE_PENCE = 1_500; // £15

interface MoveCustodyPanelProps {
  direction: "to_self_custody" | "to_ftx";
  /** BTC on the source side (satoshis). */
  sourceSatoshis: number;
  /** Current BTC/GBP price (pence). */
  pricePence: number;
  /** Available cash pence — needed to check if user can afford the fee. */
  cashPence: number;
  /** True while the parent is awaiting an API response. */
  isSubmitting: boolean;
  /** True when FTX is halted or bankrupt — disables this panel. */
  isLocked: boolean;
  /** Called with (satoshis, direction) after the user confirms. */
  onMove: (satoshis: number, direction: "to_self_custody" | "to_ftx") => void;
}

function satoshisToGbp(satoshis: number, pricePence: number): number {
  return (satoshis * pricePence) / 100_000_000 / 100;
}

function gbpToSatoshis(gbp: number, pricePence: number, maxSatoshis: number): number {
  if (pricePence <= 0 || gbp <= 0) return 0;
  const pence = Math.round(gbp * 100);
  const sats  = Math.round((pence * 100_000_000) / pricePence);
  return Math.min(sats, maxSatoshis);
}

export function MoveCustodyPanel({
  direction,
  sourceSatoshis,
  pricePence,
  cashPence,
  isSubmitting,
  isLocked,
  onMove,
}: MoveCustodyPanelProps) {
  const [rawAmount, setRawAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  const isToCold      = direction === "to_self_custody";
  const label         = isToCold ? "MOVE TO COLD" : "MOVE TO FTX";
  const icon          = isToCold ? "🔐" : "🏦";
  const submitLabel   = isToCold ? "Move to Self-Custody" : "Move to FTX";
  const sourceLabel   = isToCold ? "FTX Balance" : "Self-Custody Balance";

  const positionGbp = satoshisToGbp(sourceSatoshis, pricePence);
  const amountGbp   = parseFloat(rawAmount) || 0;
  const satoshis    = gbpToSatoshis(amountGbp, pricePence, sourceSatoshis);
  const canAffordFee = cashPence >= TRANSFER_FEE_PENCE;

  const handleQuick = useCallback(
    (pct: number) => {
      const val = (positionGbp * pct) / 100;
      setRawAmount(val.toFixed(2));
    },
    [positionGbp],
  );

  const canSubmit =
    !isSubmitting &&
    !isLocked &&
    satoshis > 0 &&
    satoshis <= sourceSatoshis &&
    canAffordFee;

  // Empty state
  if (sourceSatoshis <= 0) {
    return (
      <div className="cc-panel cc-panel--move cc-panel--disabled">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--move">{label}</span>
        </div>
        <div className="cc-panel-empty">
          {isToCold ? "No BTC on FTX to move." : "No BTC in self-custody to move."}
        </div>
      </div>
    );
  }

  // Locked (halted or bankrupt)
  if (isLocked) {
    return (
      <div className="cc-panel cc-panel--move cc-panel--disabled cc-panel--locked">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--move">{label}</span>
        </div>
        <div className="cc-panel-empty cc-panel-empty--locked">
          🔒 FTX withdrawals halted — transfers unavailable
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="cc-panel cc-panel--move">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--move">{label}</span>
          <span className="cc-panel-avail">
            {sourceLabel}: {formatGBP(Math.round(positionGbp * 100))}
          </span>
        </div>

        <label className="cc-panel-label" htmlFor={`cc-move-${direction}-amount`}>
          Amount (GBP)
        </label>
        <input
          id={`cc-move-${direction}-amount`}
          className="cc-panel-input cc-panel-input--move"
          type="number"
          min="0"
          max={positionGbp}
          step="100"
          value={rawAmount}
          onChange={(e) => setRawAmount(e.target.value)}
          placeholder="0.00"
          disabled={isSubmitting}
          autoComplete="off"
        />

        <div className="cc-quick-pills">
          {([25, 50, 75] as const).map((pct) => (
            <button
              key={pct}
              className="cc-quick-pill"
              onClick={() => handleQuick(pct)}
              disabled={isSubmitting}
              type="button"
            >
              {pct}%
            </button>
          ))}
          <button
            className="cc-quick-pill cc-quick-pill--max"
            onClick={() => handleQuick(100)}
            disabled={isSubmitting}
            type="button"
          >
            All
          </button>
        </div>

        {satoshis > 0 && (
          <p className="cc-panel-estimate">≈ {formatBTC(satoshis)}</p>
        )}

        <p className="cc-panel-fee-note">
          Transfer fee: {formatGBP(TRANSFER_FEE_PENCE)}
          {!canAffordFee && (
            <span className="cc-panel-fee-warn"> — insufficient cash</span>
          )}
        </p>

        <button
          className="cc-panel-submit cc-panel-submit--move"
          onClick={() => setConfirming(true)}
          disabled={!canSubmit}
          type="button"
        >
          <span className="cc-panel-submit-icon" aria-hidden="true">{icon}</span>
          {submitLabel}
        </button>
      </div>

      {confirming && (
        <div className="cc-confirm-backdrop" role="dialog" aria-modal="true">
          <div className="cc-confirm-card">
            <h3 className="cc-confirm-title">{submitLabel}</h3>
            <div className="cc-confirm-details">
              <div className="cc-confirm-row">
                <span>Moving</span>
                <span className="cc-confirm-val">{formatBTC(satoshis)}</span>
              </div>
              <div className="cc-confirm-row">
                <span>Value</span>
                <span className="cc-confirm-val">{formatGBP(Math.round(amountGbp * 100))}</span>
              </div>
              <div className="cc-confirm-row cc-confirm-row--fee">
                <span>Transfer fee</span>
                <span className="cc-confirm-val">−{formatGBP(TRANSFER_FEE_PENCE)}</span>
              </div>
            </div>
            <div className="cc-confirm-actions">
              <button
                className="cc-btn cc-btn--primary"
                onClick={() => {
                  setConfirming(false);
                  setRawAmount("");
                  onMove(satoshis, direction);
                }}
                type="button"
              >
                Confirm
              </button>
              <button
                className="cc-btn cc-btn--ghost"
                onClick={() => setConfirming(false)}
                type="button"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
