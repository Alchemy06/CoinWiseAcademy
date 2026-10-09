import { useState } from "react";
import { formatGBP } from "../lib/format";
import { useI18n } from "../../../i18n/provider";

const COMMISSION_PENCE = 1_195; // £11.95

interface StockSellPanelProps {
  sharesHeld: number;
  pricePence: number;
  broker: "trading_forge" | "highford_latham";
  isSubmitting: boolean;
  onSell: (shares: number) => void;
}

export function StockSellPanel({
  sharesHeld,
  pricePence,
  broker,
  isSubmitting,
  onSell,
}: StockSellPanelProps) {
  const { tx } = useI18n();
  const [inputShares, setInputShares] = useState("");

  const isHighford = broker === "highford_latham";
  const commission = isHighford ? COMMISSION_PENCE : 0;

  const sharesToSell = parseInt(inputShares || "0", 10);
  const grossProceeds = sharesToSell * pricePence;
  const netProceeds = Math.max(0, grossProceeds - commission);

  const canSubmit =
    !isSubmitting &&
    sharesToSell > 0 &&
    sharesToSell <= sharesHeld &&
    pricePence > 0;

  function fillQuick(fraction: number) {
    const shares = Math.floor(sharesHeld * fraction);
    setInputShares(shares.toString());
  }

  function handleSubmit() {
    if (!canSubmit) return;
    onSell(sharesToSell);
    setInputShares("");
  }

  if (sharesHeld === 0) {
    return (
      <div className="cc-panel cc-panel--sell cc-panel--empty">
        <p className="cc-panel-title">{tx("SELL GME")}</p>
        <p className="cc-panel-empty-msg">{tx("No shares held.")}</p>
      </div>
    );
  }

  return (
    <div className="cc-panel cc-panel--sell">
      <p className="cc-panel-title">{tx("SELL GME")}</p>

      <div className="cc-stock-holding">
        <span className="cc-stock-holding-label">{tx("You hold")}</span>
        <span className="cc-stock-holding-value">
          {sharesHeld} {sharesHeld !== 1 ? tx("shares") : tx("share")}
        </span>
        <span className="cc-stock-holding-value-gbp">
          ({formatGBP(sharesHeld * pricePence)})
        </span>
      </div>

      {/* Shares input */}
      <div className="cc-panel-input-wrap">
        <input
          className="cc-panel-input cc-panel-input--shares"
          type="number"
          min="0"
          step="1"
          placeholder="0"
          value={inputShares}
          onChange={(e) => setInputShares(e.target.value)}
          disabled={isSubmitting}
        />
        <span className="cc-panel-unit">{tx("shares")}</span>
      </div>

      {/* Quick pills */}
      <div className="cc-panel-pills">
        <button className="cc-panel-pill" onClick={() => fillQuick(0.25)} type="button" disabled={isSubmitting}>25%</button>
        <button className="cc-panel-pill" onClick={() => fillQuick(0.50)} type="button" disabled={isSubmitting}>50%</button>
        <button className="cc-panel-pill" onClick={() => fillQuick(0.75)} type="button" disabled={isSubmitting}>75%</button>
        <button className="cc-panel-pill" onClick={() => fillQuick(1)} type="button" disabled={isSubmitting}>{tx("All")}</button>
      </div>

      {/* Preview */}
      {sharesToSell > 0 && pricePence > 0 && (
        <p className="cc-panel-preview">
          {tx("Sell")} <strong>{sharesToSell} {sharesToSell !== 1 ? tx("shares") : tx("share")}</strong> {tx("at")}{" "}
          {formatGBP(pricePence)} → <strong>{formatGBP(netProceeds)}</strong>
          {commission > 0 && (
            <span className="cc-sell-commission"> {tx("(after £11.95 commission)")}</span>
          )}
        </p>
      )}

      {/* Commission notice */}
      {isHighford && (
        <p className="cc-panel-fee-note">{tx("Highford & Latham: £11.95 commission per trade")}</p>
      )}

      <button
        className="cc-panel-submit cc-panel-submit--sell"
        onClick={handleSubmit}
        disabled={!canSubmit}
        type="button"
      >
        {isSubmitting ? tx("Placing order…") : tx("Place Sell Order")}
      </button>

      {sharesToSell > sharesHeld && sharesToSell > 0 && (
        <p className="cc-panel-insufficient">{tx("You only hold {count} shares", { count: sharesHeld })}</p>
      )}
    </div>
  );
}
