/**
 * ConfirmModal.tsx — Shared order-confirmation dialog for Buy and Sell.
 *
 * Shows a structured order summary and asks the user to confirm before
 * the API call fires. Also warns when a trade commits all available cash
 * or all BTC.
 */

import { formatGBP, formatBTC } from "../lib/format";

export interface ConfirmModalProps {
  type: "buy" | "sell";
  /** GBP value being committed (buy: cash spent; sell: proceeds received). */
  amountGbp: number;
  /** BTC quantity involved (buy: received; sell: sent). */
  btcSatoshis: number;
  /** Current round price in pence — shown for reference. */
  pricePence: number;
  /** True if buying the entire cash balance or selling the entire BTC position. */
  isAllIn: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  type,
  amountGbp,
  btcSatoshis,
  pricePence,
  isAllIn,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  const isBuy = type === "buy";

  return (
    <div className="cc-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="cc-confirm-title">
      <div className="cc-confirm-card">
        <h3 id="cc-confirm-title" className="cc-confirm-title">
          Confirm {isBuy ? "Buy" : "Sell"} Order
        </h3>

        <div className="cc-confirm-order">
          <div className="cc-confirm-order-row">
            <span className="cc-confirm-order-key">Action</span>
            <span className={`cc-confirm-order-val cc-confirm-order-val--${type}`}>
              {isBuy ? "BUY Bitcoin" : "SELL Bitcoin"}
            </span>
          </div>
          <div className="cc-confirm-order-row">
            <span className="cc-confirm-order-key">{isBuy ? "You spend" : "You sell"}</span>
            <span className="cc-confirm-order-val">
              {isBuy ? formatGBP(Math.round(amountGbp * 100)) : formatBTC(btcSatoshis)}
            </span>
          </div>
          <div className="cc-confirm-order-row">
            <span className="cc-confirm-order-key">{isBuy ? "You receive" : "You receive"}</span>
            <span className="cc-confirm-order-val">
              {isBuy ? formatBTC(btcSatoshis) : formatGBP(Math.round(amountGbp * 100))}
            </span>
          </div>
          <div className="cc-confirm-order-row">
            <span className="cc-confirm-order-key">At price</span>
            <span className="cc-confirm-order-val">{formatGBP(pricePence)}</span>
          </div>
        </div>

        {isAllIn && (
          <div className="cc-confirm-warning" role="alert">
            ⚠ {isBuy
              ? "This commits your entire cash balance."
              : "This sells your entire BTC position."}
          </div>
        )}

        <p className="cc-confirm-hint">This trade cannot be undone.</p>

        <div className="cc-confirm-actions">
          <button className="cc-btn cc-btn--primary" onClick={onConfirm} type="button">
            Confirm
          </button>
          <button className="cc-btn cc-btn--ghost" onClick={onCancel} type="button">
            Reconsider
          </button>
        </div>
      </div>
    </div>
  );
}
