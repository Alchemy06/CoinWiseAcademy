/**
 * FTXEventModal.tsx — Non-dismissable modals for FTX lifecycle events.
 *
 * Two variants:
 *   'halt'       — FTX withdrawals halted (Round 3 entry). Shows locked BTC.
 *   'bankruptcy' — FTX bankruptcy (Round 4 entry). Shows BTC lost.
 *
 * Dismissed only via the single confirm button.
 */

import { formatGBP, formatBTC } from "../lib/format";

interface FTXEventModalProps {
  variant: "halt" | "bankruptcy";
  /** BTC locked on FTX at halt time (satoshis). */
  btcOnFtxSatoshis?: number;
  /** BTC wiped at bankruptcy (satoshis). */
  btcLostSatoshis?: number;
  /** GBP value of the wiped BTC at bankruptcy price. */
  lossValuePence?: number;
  /** Called when the user clicks the confirm button. */
  onConfirm: () => void;
}

export function FTXEventModal({
  variant,
  btcOnFtxSatoshis = 0,
  btcLostSatoshis = 0,
  lossValuePence = 0,
  onConfirm,
}: FTXEventModalProps) {
  const isHalt = variant === "halt";

  return (
    <div className="cc-ftx-modal-backdrop" role="dialog" aria-modal="true">
      <div className={`cc-ftx-modal cc-ftx-modal--${variant}`}>
        {/* Icon */}
        <div className="cc-ftx-modal-icon" aria-hidden="true">
          {isHalt ? "🔒" : "💀"}
        </div>

        {/* Title */}
        <h2 className="cc-ftx-modal-title">
          {isHalt ? "FTX Has Halted Withdrawals" : "FTX Has Filed for Bankruptcy"}
        </h2>

        {/* Body */}
        {isHalt ? (
          <div className="cc-ftx-modal-body">
            <p>
              FTX announced a "significant liquidity crunch" and has suspended all
              customer withdrawals, effective immediately.
            </p>
            {btcOnFtxSatoshis > 0 && (
              <div className="cc-ftx-modal-stat">
                <span className="cc-ftx-modal-stat-label">Your BTC on FTX</span>
                <span className="cc-ftx-modal-stat-value cc-ftx-modal-stat-value--locked">
                  {formatBTC(btcOnFtxSatoshis)} 🔒 Locked
                </span>
              </div>
            )}
            <div className="cc-ftx-modal-rules">
              <p className="cc-ftx-modal-rules-heading">What this means:</p>
              <ul>
                <li>❌ You cannot move BTC off FTX</li>
                <li>❌ You cannot sell BTC held on FTX</li>
                <li>✅ You can still sell BTC held in self-custody</li>
                <li>✅ You can still hold your position and wait</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="cc-ftx-modal-body">
            <p>
              FTX, Alameda Research, and 130 affiliated companies have filed for
              Chapter 11 bankruptcy in the United States. Sam Bankman-Fried has
              resigned as CEO. Customer assets on FTX are presumed lost.
            </p>
            {btcLostSatoshis > 0 ? (
              <div className="cc-ftx-modal-stat cc-ftx-modal-stat--loss">
                <span className="cc-ftx-modal-stat-label">BTC lost on FTX</span>
                <span className="cc-ftx-modal-stat-value cc-ftx-modal-stat-value--lost">
                  {formatBTC(btcLostSatoshis)}
                </span>
                <span className="cc-ftx-modal-stat-sublabel">
                  Worth {formatGBP(lossValuePence)} at today's price
                </span>
              </div>
            ) : (
              <div className="cc-ftx-modal-stat cc-ftx-modal-stat--safe">
                <span className="cc-ftx-modal-stat-label">Your FTX balance</span>
                <span className="cc-ftx-modal-stat-value cc-ftx-modal-stat-value--zero">
                  £0 — you had already moved everything to self-custody
                </span>
              </div>
            )}
          </div>
        )}

        {/* Confirm button */}
        <button
          className="cc-ftx-modal-confirm"
          onClick={onConfirm}
          type="button"
        >
          {isHalt
            ? "Understood — Continue to Round 3 →"
            : "Understood — See Final Results →"}
        </button>
      </div>
    </div>
  );
}
