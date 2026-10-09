/**
 * BuyPanel.tsx — GBP buy input with quick-fill buttons and a confirm step.
 *
 * Data contract:
 *   - User enters a GBP amount (e.g. "2500.00").
 *   - Quick-fill buttons set 25 / 50 / 75 / 100 % of available cash.
 *   - "Buy BTC" opens the ConfirmModal; confirming calls onBuy(amountPence).
 *   - onBuy receives the exact integer pence amount — no rounding beyond 2 dp.
 */

import { useCallback, useState } from "react";
import { formatGBP, formatBTC } from "../lib/format";
import { ConfirmModal } from "./ConfirmModal";
import { useI18n } from "../../../i18n/provider";

interface BuyPanelProps {
  /** Available cash in pence. */
  cashPence: number;
  /** Current BTC/GBP price in pence. */
  pricePence: number;
  /** True while the parent is awaiting the API response. */
  isSubmitting: boolean;
  /** Called with the exact pence amount after the user confirms the order. */
  onBuy: (amountPence: number) => void;
  /** If true, the panel shows a disabled state regardless of cash balance. */
  disabled?: boolean;
  /** Reason shown in the disabled state (defaults to "Unavailable"). */
  disabledReason?: string;
}

// Convert a GBP float string → integer pence (2 dp, no banker's rounding).
function gbpToPence(gbp: number): number {
  return Math.round(gbp * 100);
}

// Convert pence + current price (pence/BTC) → satoshis.
function penceToBtcSatoshis(pence: number, pricePence: number): number {
  if (pricePence <= 0) return 0;
  return Math.round((pence * 100_000_000) / pricePence);
}

export function BuyPanel({
  cashPence,
  pricePence,
  isSubmitting,
  onBuy,
  disabled = false,
  disabledReason,
}: BuyPanelProps) {
  const { tx } = useI18n();
  const [rawAmount, setRawAmount] = useState("");
  const [confirming, setConfirming] = useState(false);

  const cashGbp   = cashPence / 100;
  const amountGbp = parseFloat(rawAmount) || 0;
  const amountPence = gbpToPence(amountGbp);
  const btcSatoshis = penceToBtcSatoshis(amountPence, pricePence);
  const isAllIn     = amountPence >= cashPence && cashPence > 0;

  const handleQuick = useCallback(
    (pct: number) => {
      const val = (cashGbp * pct) / 100;
      setRawAmount(val.toFixed(2));
    },
    [cashGbp],
  );

  const canSubmit =
    !isSubmitting &&
    amountPence > 0 &&
    amountPence <= cashPence &&
    pricePence > 0 &&
    cashPence > 0;

  if (disabled) {
    return (
      <div className="cc-panel cc-panel--buy cc-panel--disabled cc-panel--locked">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--buy">BUY</span>
        </div>
        <div className="cc-panel-empty cc-panel-empty--locked">
          🔒 {disabledReason ?? "Unavailable"}
        </div>
      </div>
    );
  }

  if (cashPence <= 0) {
    return (
      <div className="cc-panel cc-panel--buy cc-panel--disabled">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--buy">BUY</span>
        </div>
        <div className="cc-panel-empty">No cash available.</div>
      </div>
    );
  }

  return (
    <>
      <div className="cc-panel cc-panel--buy">
        <div className="cc-panel-header">
          <span className="cc-panel-title cc-panel-title--buy">BUY</span>
          <span className="cc-panel-avail">
            Available: {formatGBP(cashPence)}
          </span>
        </div>

        <label className="cc-panel-label" htmlFor="cc-buy-amount">
          Amount (GBP)
        </label>
        <input
          id="cc-buy-amount"
          className="cc-panel-input cc-panel-input--buy"
          type="number"
          min="0"
          max={cashGbp}
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
            Max
          </button>
        </div>

        {btcSatoshis > 0 && (
          <p className="cc-panel-estimate">
            ≈ {formatBTC(btcSatoshis)}
          </p>
        )}

        <button
          className="cc-panel-submit cc-panel-submit--buy"
          onClick={() => setConfirming(true)}
          disabled={!canSubmit}
          type="button"
        >
          <span className="cc-panel-submit-icon" aria-hidden="true">📈</span>
          {tx("Buy BTC")}
        </button>
      </div>

      {confirming && (
        <ConfirmModal
          type="buy"
          amountGbp={amountGbp}
          btcSatoshis={btcSatoshis}
          pricePence={pricePence}
          isAllIn={isAllIn}
          onConfirm={() => {
            setConfirming(false);
            setRawAmount("");
            onBuy(amountPence);
          }}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
