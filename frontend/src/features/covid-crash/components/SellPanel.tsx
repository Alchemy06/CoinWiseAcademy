/**
 * SellPanel.tsx — GBP-denominated sell input with quick-fill buttons and a confirm step.
 *
 * Data contract:
 *   - User enters a GBP amount representing the value of the asset to sell.
 *   - Quick-fill buttons (25 / 50 / 75 / All) set % of the current position value.
 *   - "Sell" opens the ConfirmModal; confirming calls onSell(satoshis).
 *   - Satoshi quantity is computed as: round(amountPence × 1e8 / pricePence),
 *     capped at btcHeldSatoshis to prevent overshoot from floating-point rounding.
 *   - When positionValueIsDust is true, a prominent "Sell All Remaining" button
 *     appears to let the user liquidate a position that rounds to £0 at current price.
 */

import { useCallback, useState } from "react";
import { formatGBP, formatAsset } from "../lib/format";
import { ConfirmModal } from "./ConfirmModal";

interface SellPanelProps {
  /** Asset quantity the user currently holds, in the smallest unit (satoshis for BTC, equivalent for others). */
  btcHeldSatoshis: number;
  /** Current asset/GBP price in pence. */
  pricePence: number;
  /** True while the parent is awaiting the API response. */
  isSubmitting: boolean;
  /** Called with the quantity after the user confirms the order. */
  onSell: (satoshis: number) => void;
  /**
   * Asset symbol shown next to quantities (e.g. "BTC", "LUNA").
   * Defaults to "BTC".
   */
  assetSymbol?: string;
  /**
   * True when the position value rounds to £0 at current price (dust).
   * Shows a prominent "Sell All Remaining" emergency button.
   */
  positionValueIsDust?: boolean;
  /** Override the panel title (e.g. "SELL (FTX)", "SELL (WALLET)"). Defaults to "SELL". */
  label?: string;
  /** If true, the panel shows a disabled state. */
  disabled?: boolean;
  /** Reason shown in the disabled state. */
  disabledReason?: string;
}

// Current GBP value of a satoshi quantity at a given price.
function satoshisToGbp(satoshis: number, pricePence: number): number {
  return (satoshis * pricePence) / 100_000_000 / 100;
}

// GBP amount → satoshi quantity, capped at the user's holding.
function gbpToSatoshis(gbp: number, pricePence: number, maxSatoshis: number): number {
  if (pricePence <= 0 || gbp <= 0) return 0;
  const pence = Math.round(gbp * 100);
  const sats  = Math.round((pence * 100_000_000) / pricePence);
  return Math.min(sats, maxSatoshis);
}

export function SellPanel({
  btcHeldSatoshis,
  pricePence,
  isSubmitting,
  onSell,
  assetSymbol = "BTC",
  positionValueIsDust = false,
  label = "SELL",
  disabled = false,
  disabledReason,
}: SellPanelProps) {
  const [rawAmount, setRawAmount] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [dustConfirming, setDustConfirming] = useState(false);

  const positionGbp = satoshisToGbp(btcHeldSatoshis, pricePence);
  const amountGbp   = parseFloat(rawAmount) || 0;
  const satoshis    = gbpToSatoshis(amountGbp, pricePence, btcHeldSatoshis);
  const isAllIn     = satoshis >= btcHeldSatoshis && btcHeldSatoshis > 0;

  // Quick-fill: % of current position value
  const handleQuick = useCallback(
    (pct: number) => {
      const val = (positionGbp * pct) / 100;
      setRawAmount(val.toFixed(2));
    },
    [positionGbp],
  );

  const canSubmit =
    !isSubmitting &&
    satoshis > 0 &&
    satoshis <= btcHeldSatoshis &&
    pricePence > 0;

  if (disabled) {
    return (
      <div className="cc-panel cc-panel--sell cc-panel--disabled cc-panel--locked">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--sell">{label}</span>
        </div>
        <div className="cc-panel-empty cc-panel-empty--locked">
          🔒 {disabledReason ?? "Unavailable"}
        </div>
      </div>
    );
  }

  if (btcHeldSatoshis <= 0) {
    return (
      <div className="cc-panel cc-panel--sell cc-panel--disabled">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--sell">{label}</span>
        </div>
        <div className="cc-panel-empty">Buy first to enable selling.</div>
      </div>
    );
  }

  // Dust position — show emergency sell-all button instead of the normal panel
  if (positionValueIsDust) {
    return (
      <>
        <div className="cc-panel cc-panel--sell">
          <div className="cc-panel-header">
            <span className="cc-panel-title cc-panel-title--sell">{label}</span>
            <span className="cc-panel-avail">
              Position: {formatAsset(btcHeldSatoshis, assetSymbol)}
            </span>
          </div>
          <p className="cc-panel-dust-hint">
            Your position is worth less than £0.01 at the current price.
          </p>
          <button
            className="cc-panel-submit cc-panel-submit--sell cc-panel-submit--dust"
            onClick={() => setDustConfirming(true)}
            disabled={isSubmitting}
            type="button"
          >
            <span className="cc-panel-submit-icon" aria-hidden="true">📉</span>
            Sell All Remaining {assetSymbol}
          </button>
        </div>

        {dustConfirming && (
          <ConfirmModal
            type="sell"
            amountGbp={positionGbp}
            btcSatoshis={btcHeldSatoshis}
            pricePence={pricePence}
            isAllIn={true}
            onConfirm={() => {
              setDustConfirming(false);
              onSell(btcHeldSatoshis);
            }}
            onCancel={() => setDustConfirming(false)}
          />
        )}
      </>
    );
  }

  return (
    <>
      <div className="cc-panel cc-panel--sell">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--sell">{label}</span>
          <span className="cc-panel-avail">
            Position: {formatGBP(Math.round(positionGbp * 100))}
          </span>
        </div>

        <label className="cc-panel-label" htmlFor="cc-sell-amount">
          Amount (GBP)
        </label>
        <input
          id="cc-sell-amount"
          className="cc-panel-input cc-panel-input--sell"
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
          <p className="cc-panel-estimate">
            ≈ {formatAsset(satoshis, assetSymbol)}
          </p>
        )}

        <button
          className="cc-panel-submit cc-panel-submit--sell"
          onClick={() => setConfirming(true)}
          disabled={!canSubmit}
          type="button"
        >
          <span className="cc-panel-submit-icon" aria-hidden="true">📉</span>
          Sell {assetSymbol}
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          type="sell"
          amountGbp={amountGbp}
          btcSatoshis={satoshis}
          pricePence={pricePence}
          isAllIn={isAllIn}
          onConfirm={() => {
            setConfirming(false);
            setRawAmount("");
            onSell(satoshis);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
