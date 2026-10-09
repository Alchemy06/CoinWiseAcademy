import type { MarginCallDetails } from "../../../types/covidCrash";
import { formatGBP } from "../lib/format";
import { useI18n } from "../../../i18n/provider";

// ── PCO Restriction modal ─────────────────────────────────────────────────────

interface PCOModalProps {
  broker: "trading_forge" | "highford_latham";
  onConfirm: () => void;
}

export function PCOModal({ broker, onConfirm }: PCOModalProps) {
  const { tx } = useI18n();
  const isTradingForge = broker === "trading_forge";

  return (
    <div className="cc-broker-modal-backdrop" role="dialog" aria-modal="true">
      <div
        className={`cc-broker-modal ${
          isTradingForge ? "cc-broker-modal--pco" : "cc-broker-modal--info"
        }`}
      >
        {isTradingForge ? (
          <>
            <div className="cc-broker-modal-icon" aria-hidden="true">⚠️</div>
            <h2 className="cc-broker-modal-title">{tx("Trading Restriction Imposed")}</h2>
            <div className="cc-broker-modal-body">
              <p className="cc-broker-modal-lead">
                {tx("Trading Forge has imposed")}{" "}
                <strong>{tx("Position Close Only (PCO)")}</strong> {tx("on GME.")}
              </p>
              <div className="cc-broker-modal-rules">
                <div className="cc-broker-modal-allowed">
                  <p className="cc-broker-modal-rules-heading">✓ {tx("You can:")}</p>
                  <ul>
                    <li>{tx("Sell your existing GME shares")}</li>
                  </ul>
                </div>
                <div className="cc-broker-modal-blocked">
                  <p className="cc-broker-modal-rules-heading">✗ {tx("You cannot:")}</p>
                  <ul>
                    <li>{tx("Buy more GME shares")}</li>
                    <li>{tx("Open new positions")}</li>
                    <li>{tx("Use margin for GME")}</li>
                  </ul>
                </div>
              </div>
              <p className="cc-broker-modal-note">
                {tx("This restriction was imposed without notice. Class-action lawsuits are already being filed.")}
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="cc-broker-modal-icon" aria-hidden="true">ℹ️</div>
            <h2 className="cc-broker-modal-title">{tx("Trading Restrictions on Other Brokers")}</h2>
            <div className="cc-broker-modal-body">
              <p className="cc-broker-modal-lead">
                {tx("Several major brokers (Trading Forge, Robinhood, others) have imposed")}{" "}
                <strong>{tx("Position Close Only (PCO)")}</strong> {tx("on GME today.")}
              </p>
              <p>
                <strong>{tx("Highford & Latham is NOT imposing restrictions.")}</strong>{" "}
                {tx("You can continue to buy and sell GME freely — though prices are extremely volatile.")}
              </p>
            </div>
          </>
        )}

        <button
          className="cc-broker-modal-btn"
          onClick={onConfirm}
          type="button"
          autoFocus
        >
          {tx("I understand")}
        </button>
      </div>
    </div>
  );
}

// ── Margin Call modal ─────────────────────────────────────────────────────────

interface MarginCallModalProps {
  details: MarginCallDetails;
  onConfirm: () => void;
}

export function MarginCallModal({ details, onConfirm }: MarginCallModalProps) {
  const { tx } = useI18n();
  const {
    shares_liquidated,
    liquidation_price_pence,
    proceeds_pence,
    margin_repaid_pence,
    leftover_pence,
  } = details;

  return (
    <div className="cc-broker-modal-backdrop" role="dialog" aria-modal="true">
      <div className="cc-broker-modal cc-broker-modal--margin-call">
        <div className="cc-broker-modal-icon" aria-hidden="true">📉</div>
        <h2 className="cc-broker-modal-title">{tx("Margin Call — Position Liquidated")}</h2>

        <div className="cc-broker-modal-body">
          <p className="cc-broker-modal-lead">
            {tx("GME has fallen below your maintenance margin requirement. Trading Forge has automatically sold your full GME position at current market price to cover your borrowed amount.")}
          </p>

          <div className="cc-mc-details">
            <div className="cc-mc-row">
              <span className="cc-mc-label">{tx("Position liquidated")}</span>
              <span className="cc-mc-value">{shares_liquidated} {tx("shares")}</span>
            </div>
            <div className="cc-mc-row">
              <span className="cc-mc-label">{tx("Liquidation price")}</span>
              <span className="cc-mc-value">{tx("{price} per share", { price: formatGBP(liquidation_price_pence) })}</span>
            </div>
            <div className="cc-mc-row">
              <span className="cc-mc-label">{tx("Gross proceeds")}</span>
              <span className="cc-mc-value">{formatGBP(proceeds_pence)}</span>
            </div>
            <div className="cc-mc-row cc-mc-row--deduction">
              <span className="cc-mc-label">{tx("Margin repayment")}</span>
              <span className="cc-mc-value">−{formatGBP(margin_repaid_pence)}</span>
            </div>
            <div className="cc-mc-row cc-mc-row--total">
              <span className="cc-mc-label">{tx("Net to your cash")}</span>
              <span className="cc-mc-value">{formatGBP(leftover_pence)}</span>
            </div>
          </div>

          <p className="cc-broker-modal-note">
            {tx("The price may recover after your liquidation. This is the inherent risk of margin: you cannot wait out a drawdown if your broker forces the exit.")}
          </p>
        </div>

        <button
          className="cc-broker-modal-btn"
          onClick={onConfirm}
          type="button"
          autoFocus
        >
          {tx("Continue")}
        </button>
      </div>
    </div>
  );
}
