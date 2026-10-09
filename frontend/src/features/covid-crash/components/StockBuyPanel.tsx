import { useState } from "react";
import { formatGBP } from "../lib/format";
import { useI18n } from "../../../i18n/provider";

const COMMISSION_PENCE = 1_195; // £11.95

interface StockBuyPanelProps {
  cashPence: number;
  pricePence: number;
  broker: "trading_forge" | "highford_latham";
  marginBorrowedPence: number;
  isSubmitting: boolean;
  /** PCO active: buy button is blocked entirely for Trading Forge users. */
  pcoBocked?: boolean;
  onBuy: (amountPence: number, useMargin: boolean) => void;
}

export function StockBuyPanel({
  cashPence,
  pricePence,
  broker,
  marginBorrowedPence,
  isSubmitting,
  pcoBocked = false,
  onBuy,
}: StockBuyPanelProps) {
  const { tx } = useI18n();
  const [inputGBP, setInputGBP] = useState("");
  const [useMargin, setUseMargin] = useState(false);

  const isTradingForge = broker === "trading_forge";
  const isHighford = broker === "highford_latham";
  const commission = isHighford ? COMMISSION_PENCE : 0;

  // Buying power
  const cashForBuy = Math.max(0, cashPence - commission); // for HL, reserve commission
  const marginAvailable = isTradingForge && !pcoBocked ? cashPence : 0; // 2x leverage
  const maxCashBuy = isTradingForge ? cashPence : cashForBuy;
  const maxWithMargin = maxCashBuy + marginAvailable;

  const amountPence = Math.round(parseFloat(inputGBP || "0") * 100);
  const isUsingMarginFunds = isTradingForge && useMargin && amountPence > cashPence;
  const sharesPreview = pricePence > 0 ? Math.floor(amountPence / pricePence) : 0;
  const totalCost = amountPence + commission;
  const canAfford = isTradingForge && useMargin
    ? amountPence <= maxWithMargin
    : totalCost <= cashPence;
  const canSubmit =
    !isSubmitting &&
    !pcoBocked &&
    amountPence > 0 &&
    canAfford &&
    sharesPreview > 0 &&
    pricePence > 0;

  function fillQuick(fraction: number, withMargin = false) {
    const max = withMargin ? maxWithMargin : maxCashBuy;
    const pence = Math.floor((max * fraction) / 100) * 100;
    setInputGBP((pence / 100).toFixed(2));
    if (withMargin) setUseMargin(true);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onBuy(amountPence, isTradingForge && useMargin);
    setInputGBP("");
    setUseMargin(false);
  }

  if (pcoBocked) {
    return (
      <div className="cc-panel cc-panel--locked">
        <p className="cc-panel-lock-icon" aria-hidden="true">🔒</p>
        <p className="cc-panel-lock-text">{tx("Trading Forge — PCO Active")}</p>
        <p className="cc-panel-lock-sub">{tx("Cannot open new positions. You can still sell.")}</p>
      </div>
    );
  }

  return (
    <div className="cc-panel cc-panel--buy">
      <p className="cc-panel-title">{tx("BUY GME")}</p>

      {/* Buying power summary */}
      <div className="cc-stock-power">
        <div className="cc-stock-power-row">
          <span>{tx("Cash available")}</span>
          <span>{formatGBP(cashPence)}</span>
        </div>
        {isTradingForge && (
          <>
            <div className="cc-stock-power-row">
              <span>{tx("Margin available")}</span>
              <span>{formatGBP(marginAvailable)}</span>
            </div>
            {marginBorrowedPence > 0 && (
              <div className="cc-stock-power-row cc-stock-power-row--borrowed">
                <span>{tx("Currently borrowed")}</span>
                <span>{formatGBP(marginBorrowedPence)}</span>
              </div>
            )}
            <div className="cc-stock-power-row cc-stock-power-row--total">
              <span>{tx("Max buying power (2×)")}</span>
              <span>{formatGBP(maxWithMargin)}</span>
            </div>
          </>
        )}
      </div>

      {/* Amount input */}
      <div className="cc-panel-input-wrap">
        <span className="cc-panel-currency">£</span>
        <input
          className="cc-panel-input"
          type="number"
          min="0"
          step="1"
          placeholder="0.00"
          value={inputGBP}
          onChange={(e) => setInputGBP(e.target.value)}
          disabled={isSubmitting}
        />
      </div>

      {/* Quick pills */}
      <div className="cc-panel-pills">
        <button className="cc-panel-pill" onClick={() => fillQuick(25)} type="button" disabled={isSubmitting}>25%</button>
        <button className="cc-panel-pill" onClick={() => fillQuick(50)} type="button" disabled={isSubmitting}>50%</button>
        <button className="cc-panel-pill" onClick={() => fillQuick(75)} type="button" disabled={isSubmitting}>75%</button>
        <button className="cc-panel-pill" onClick={() => fillQuick(100)} type="button" disabled={isSubmitting}>{tx("Max cash")}</button>
        {isTradingForge && (
          <button
            className="cc-panel-pill cc-panel-pill--margin"
            onClick={() => fillQuick(100, true)}
            type="button"
            disabled={isSubmitting}
          >
            {tx("Max 2×")}
          </button>
        )}
      </div>

      {/* Margin checkbox (Trading Forge only) */}
      {isTradingForge && (
        <label className="cc-margin-toggle">
          <input
            type="checkbox"
            checked={useMargin}
            onChange={(e) => setUseMargin(e.target.checked)}
            disabled={isSubmitting}
          />
          <span>{tx("Use 2× margin (borrow {amount} extra)", { amount: formatGBP(Math.max(0, amountPence - cashPence)) })}</span>
        </label>
      )}

      {/* Preview */}
      {amountPence > 0 && pricePence > 0 && (
        <p className="cc-panel-preview">
          {tx("You will buy")}{" "}
          <strong>{sharesPreview} {sharesPreview !== 1 ? tx("shares") : tx("share")}</strong>
          {" "}{tx("of GME at {price} per share", { price: formatGBP(pricePence) })}
          {isUsingMarginFunds && (
            <span className="cc-margin-label"> {tx("(includes margin)")}</span>
          )}
        </p>
      )}

      {/* Commission info */}
      {isHighford && (
        <p className="cc-panel-fee-note">
          {tx("+ £11.95 Highford & Latham commission per trade")}
          {amountPence > 0 && ` ${tx("(total: {amount})", { amount: formatGBP(totalCost) })}`}
        </p>
      )}
      {isTradingForge && (
        <p className="cc-panel-fee-note cc-panel-fee-note--zero">{tx("£0 commission")}</p>
      )}

      <button
        className="cc-panel-submit cc-panel-submit--buy"
        onClick={handleSubmit}
        disabled={!canSubmit}
        type="button"
      >
        {isSubmitting ? tx("Placing order…") : tx("Place Buy Order")}
      </button>

      {amountPence > 0 && !canAfford && (
        <p className="cc-panel-insufficient">{useMargin ? tx("Insufficient buying power") : tx("Insufficient cash")}</p>
      )}
    </div>
  );
}
