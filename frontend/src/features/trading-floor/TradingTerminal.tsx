import { useCallback, useState } from "react";
import type { ScenarioChoice, ScenarioNode, TradingAttempt } from "../../types/trading";
import { PriceStrip, getCurrentPrice } from "./PriceStrip";

interface TradingTerminalProps {
  node: ScenarioNode;
  attempt: TradingAttempt;
  volatilityProfile?: string;
  /** Called with the chosen choice ID and the optional GBP amount (buy/sell only). */
  onSubmitChoice: (choiceId: number, amount?: number) => void;
  isSubmitting: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(n: number, currency: string, decimals = 2) {
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Map a GBP amount to the appropriate buy choice.
 * sort_order=0 → all-in (≥80 % of balance)
 * sort_order=1 → partial  (20–79 %)
 * last          → small   (< 20 %)
 */
function mapBuyAmountToChoice(
  amount: number,
  balance: number,
  buyChoices: ScenarioChoice[],
): ScenarioChoice | null {
  if (!buyChoices.length || amount <= 0) return null;
  const pct = (amount / balance) * 100;
  const sorted = [...buyChoices].sort((a, b) => a.sort_order - b.sort_order);
  if (pct >= 80) return sorted[0];
  if (pct >= 20) return sorted[1] ?? sorted[0];
  return sorted[sorted.length - 1] ?? sorted[0];
}

// ── Confirmation modal ────────────────────────────────────────────────────────

interface ConfirmData {
  choice: ScenarioChoice;
  amount?: number;        // GBP entered (buy/sell only)
  btcAmount?: number;
  currentPrice?: number;
}

function ConfirmModal({
  data,
  currency,
  onConfirm,
  onCancel,
}: {
  data: ConfirmData;
  currency: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const c = data.choice;
  const isAllIn = c.action_type === "buy" && c.sort_order === 0;

  return (
    <div className="tf-confirm-backdrop" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <div className="tf-confirm-card">
        <h3 id="confirm-title" className="tf-confirm-title">Confirm your decision</h3>

        <div className="tf-confirm-order">
          <div className="tf-confirm-order-row">
            <span className="tf-confirm-order-key">Action</span>
            <span className="tf-confirm-order-val">{c.label}</span>
          </div>
          {data.amount != null && (
            <div className="tf-confirm-order-row">
              <span className="tf-confirm-order-key">Amount</span>
              <span className="tf-confirm-order-val">{fmt(data.amount, currency)}</span>
            </div>
          )}
          {data.btcAmount != null && (
            <div className="tf-confirm-order-row">
              <span className="tf-confirm-order-key">Est. BTC</span>
              <span className="tf-confirm-order-val">{data.btcAmount.toFixed(6)} BTC</span>
            </div>
          )}
          {data.currentPrice != null && (
            <div className="tf-confirm-order-row">
              <span className="tf-confirm-order-key">Price</span>
              <span className="tf-confirm-order-val">{fmt(data.currentPrice, currency)}</span>
            </div>
          )}
        </div>

        {c.emotional_framing && (
          <p className="tf-confirm-framing">{c.emotional_framing}</p>
        )}

        {isAllIn && (
          <div className="tf-confirm-warning" role="alert">
            ⚠ This commits your entire balance.
          </div>
        )}

        <p className="tf-confirm-hint">This choice cannot be undone.</p>

        <div className="tf-confirm-actions">
          <button className="tf-btn tf-btn--primary" onClick={onConfirm} type="button">
            Confirm
          </button>
          <button className="tf-btn tf-btn--ghost" onClick={onCancel} type="button">
            Reconsider
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Quick-select pill ─────────────────────────────────────────────────────────

function QuickPill({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button className="tf-quick-pill" onClick={onClick} disabled={disabled} type="button">
      {label}
    </button>
  );
}

// ── Buy panel ─────────────────────────────────────────────────────────────────

function BuyPanel({
  buyChoices,
  balance,
  currentPrice,
  currency,
  onConfirmBuy,
  disabled,
}: {
  buyChoices: ScenarioChoice[];
  balance: number;
  currentPrice: number;
  currency: string;
  onConfirmBuy: (choice: ScenarioChoice, amount: number) => void;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState("");
  const amountNum = parseFloat(amount) || 0;
  const btcEstimate = currentPrice > 0 && amountNum > 0 ? amountNum / currentPrice : 0;

  const handleQuick = useCallback(
    (pct: number) => setAmount((Math.round(balance * pct) / 100).toFixed(2)),
    [balance],
  );

  const handleSubmit = useCallback(() => {
    const choice = mapBuyAmountToChoice(amountNum, balance, buyChoices);
    if (!choice) return;
    onConfirmBuy(choice, amountNum);
  }, [amountNum, balance, buyChoices, onConfirmBuy]);

  const canSubmit = amountNum > 0 && amountNum <= balance && buyChoices.length > 0 && !disabled;

  return (
    <div className="tf-panel tf-panel--buy">
      <div className="tf-panel-header">
        <span className="tf-panel-title tf-panel-title--buy">BUY</span>
        <span className="tf-panel-avail">Available: {fmt(balance, currency)}</span>
      </div>

      <label className="tf-panel-label" htmlFor="buy-amount">Amount ({currency})</label>
      <input
        id="buy-amount"
        className="tf-panel-input tf-panel-input--buy"
        type="number"
        min="0"
        max={balance}
        step="100"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        disabled={disabled}
      />

      <div className="tf-quick-pills">
        <QuickPill label="25%" onClick={() => handleQuick(25)} disabled={disabled} />
        <QuickPill label="50%" onClick={() => handleQuick(50)} disabled={disabled} />
        <QuickPill label="75%" onClick={() => handleQuick(75)} disabled={disabled} />
        <QuickPill label="Max" onClick={() => handleQuick(100)} disabled={disabled} />
      </div>

      {btcEstimate > 0 && (
        <p className="tf-panel-estimate">≈ {btcEstimate.toFixed(6)} BTC</p>
      )}

      <button
        className="tf-panel-submit tf-panel-submit--buy"
        onClick={handleSubmit}
        disabled={!canSubmit}
        type="button"
      >
        <span className="tf-panel-submit-icon">📈</span>
        Place Buy Order
      </button>
    </div>
  );
}

/**
 * Map a GBP sell amount to the appropriate sell choice.
 * Mirrors the buy bucket logic: sort_order=0 is the largest sell, etc.
 */
function mapSellAmountToChoice(
  amount: number,
  balance: number,
  sellChoices: ScenarioChoice[],
): ScenarioChoice | null {
  if (!sellChoices.length || amount <= 0) return null;
  const pct = (amount / balance) * 100;
  const sorted = [...sellChoices].sort((a, b) => a.sort_order - b.sort_order);
  if (pct >= 80) return sorted[0];
  if (pct >= 20) return sorted[1] ?? sorted[0];
  return sorted[sorted.length - 1] ?? sorted[0];
}

// ── Sell panel ────────────────────────────────────────────────────────────────

function SellPanel({
  sellChoices,
  btcPositionGbp,
  currency,
  onConfirmSell,
  disabled,
}: {
  sellChoices: ScenarioChoice[];
  /** Current GBP value of the player's BTC holdings — caps sell amounts. */
  btcPositionGbp: number;
  currency: string;
  onConfirmSell: (choice: ScenarioChoice, amount: number) => void;
  disabled: boolean;
}) {
  const [amount, setAmount] = useState("");
  const amountNum = parseFloat(amount) || 0;

  // Percentage buttons are fractions of the BTC position, not total balance.
  const handleQuick = useCallback(
    (pct: number) => setAmount((Math.round(btcPositionGbp * pct) / 100).toFixed(2)),
    [btcPositionGbp],
  );

  const handleSubmit = useCallback(() => {
    const choice = mapSellAmountToChoice(amountNum, btcPositionGbp, sellChoices);
    if (!choice) return;
    onConfirmSell(choice, amountNum);
  }, [amountNum, btcPositionGbp, sellChoices, onConfirmSell]);

  const canSubmit =
    amountNum > 0 && amountNum <= btcPositionGbp && sellChoices.length > 0 && !disabled;

  if (!sellChoices.length || btcPositionGbp <= 0) {
    return (
      <div className="tf-panel tf-panel--sell tf-panel--disabled">
        <div className="tf-panel-header">
          <span className="tf-panel-title tf-panel-title--sell">SELL</span>
        </div>
        <div className="tf-panel-empty">Buy first to enable selling.</div>
      </div>
    );
  }

  return (
    <div className="tf-panel tf-panel--sell">
      <div className="tf-panel-header">
        <span className="tf-panel-title tf-panel-title--sell">SELL</span>
        <span className="tf-panel-avail">Balance: {fmt(btcPositionGbp, currency)}</span>
      </div>

      <label className="tf-panel-label" htmlFor="sell-amount">Amount ({currency})</label>
      <input
        id="sell-amount"
        className="tf-panel-input tf-panel-input--sell"
        type="number"
        min="0"
        max={btcPositionGbp}
        step="100"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
        placeholder="0.00"
        disabled={disabled}
      />

      <div className="tf-quick-pills">
        <QuickPill label="25%" onClick={() => handleQuick(25)} disabled={disabled} />
        <QuickPill label="50%" onClick={() => handleQuick(50)} disabled={disabled} />
        <QuickPill label="75%" onClick={() => handleQuick(75)} disabled={disabled} />
        <QuickPill label="All" onClick={() => handleQuick(100)} disabled={disabled} />
      </div>

      <button
        className="tf-panel-submit tf-panel-submit--sell"
        onClick={handleSubmit}
        disabled={!canSubmit}
        type="button"
      >
        Place Sell Order
      </button>
    </div>
  );
}

// ── Choice-button fallback (non-buy/sell nodes) ───────────────────────────────

function ChoicePanel({
  choices,
  onSelect,
  disabled,
}: {
  choices: ScenarioChoice[];
  onSelect: (choice: ScenarioChoice) => void;
  disabled: boolean;
}) {
  const letters = ["A", "B", "C", "D", "E", "F"];
  return (
    <div className="tf-choice-panel">
      <p className="tf-choices-prompt">What do you do?</p>
      {choices.map((c, i) => (
        <button
          key={c.id}
          className="tf-choice-btn"
          onClick={() => onSelect(c)}
          disabled={disabled}
          type="button"
        >
          <span className="tf-choice-letter">{letters[i] ?? String(i + 1)}</span>
          <span className="tf-choice-body">
            <span className="tf-choice-label">{c.label}</span>
            {c.emotional_framing && (
              <span className="tf-choice-framing">{c.emotional_framing}</span>
            )}
          </span>
        </button>
      ))}
    </div>
  );
}

// ── Main terminal ─────────────────────────────────────────────────────────────

export function TradingTerminal({
  node,
  attempt,
  volatilityProfile = "normal",
  onSubmitChoice,
  isSubmitting,
}: TradingTerminalProps) {
  const [confirmData, setConfirmData] = useState<ConfirmData | null>(null);
  const currency = attempt.scenario_currency || "GBP";
  const balance = parseFloat(attempt.current_balance);
  const currentPrice = getCurrentPrice(node);

  // BTC position value in GBP — used to correctly scope sell panel %s and max.
  // currentPrice is already in GBP (getCurrentPrice divides pence by 100).
  const btcPositionGbp =
    currentPrice > 0 && attempt.btc_held_satoshis > 0
      ? (attempt.btc_held_satoshis * currentPrice) / 100_000_000
      : 0;

  const buyChoices = node.choices.filter((c) => c.action_type === "buy");
  const sellChoices = node.choices.filter((c) => c.action_type === "sell");
  const researchChoice = node.choices.find((c) => c.action_type === "research");
  const holdChoice = node.choices.find((c) => c.action_type === "hold");
  const otherChoices = node.choices.filter(
    (c) => !["buy", "sell", "research", "hold"].includes(c.action_type),
  );

  const hasBuySell = buyChoices.length > 0 || sellChoices.length > 0;

  // Buy: open confirm with the amount + BTC estimate
  const handleBuyConfirm = useCallback(
    (choice: ScenarioChoice, amount: number) => {
      const btcAmount = currentPrice > 0 ? amount / currentPrice : undefined;
      setConfirmData({
        choice,
        amount,
        btcAmount: btcAmount && btcAmount > 0 ? btcAmount : undefined,
        currentPrice: currentPrice > 0 ? currentPrice : undefined,
      });
    },
    [currentPrice],
  );

  // Sell: open confirm with the GBP amount
  const handleSellConfirm = useCallback((choice: ScenarioChoice, amount: number) => {
    setConfirmData({ choice, amount });
  }, []);

  // Research / Hold / Other secondary: open confirm without a typed amount
  const handleSelect = useCallback((choice: ScenarioChoice) => {
    setConfirmData({ choice });
  }, []);

  const handleConfirm = useCallback(() => {
    if (!confirmData) return;
    setConfirmData(null);
    onSubmitChoice(confirmData.choice.id, confirmData.amount);
  }, [confirmData, onSubmitChoice]);

  return (
    <div className="tf-terminal">
      <PriceStrip node={node} volatilityProfile={volatilityProfile} currency={currency} />

      {hasBuySell ? (
        <>
          <div className={`tf-panels-row${sellChoices.length === 0 ? " tf-panels-row--buy-only" : ""}`}>
            <BuyPanel
              buyChoices={buyChoices}
              balance={balance}
              currentPrice={currentPrice}
              currency={currency}
              onConfirmBuy={handleBuyConfirm}
              disabled={isSubmitting}
            />
            <SellPanel
              sellChoices={sellChoices}
              btcPositionGbp={btcPositionGbp}
              currency={currency}
              onConfirmSell={handleSellConfirm}
              disabled={isSubmitting}
            />
          </div>

          {(researchChoice || holdChoice) && (
            <div className="tf-secondary-actions">
              {researchChoice && (
                <button
                  className="tf-secondary-btn"
                  onClick={() => handleSelect(researchChoice)}
                  disabled={isSubmitting}
                  type="button"
                >
                  🔍 {researchChoice.label}
                </button>
              )}
              {holdChoice && (
                <button
                  className="tf-secondary-btn"
                  onClick={() => handleSelect(holdChoice)}
                  disabled={isSubmitting}
                  type="button"
                >
                  🛡️ {holdChoice.label}
                </button>
              )}
            </div>
          )}
        </>
      ) : (
        <ChoicePanel choices={node.choices} onSelect={handleSelect} disabled={isSubmitting} />
      )}

      {hasBuySell && otherChoices.length > 0 && (
        <div className="tf-secondary-actions">
          {otherChoices.map((c) => (
            <button
              key={c.id}
              className="tf-secondary-btn"
              onClick={() => handleSelect(c)}
              disabled={isSubmitting}
              type="button"
            >
              {c.label}
            </button>
          ))}
        </div>
      )}

      <div className="tf-terminal-footer">
        <span className="tf-terminal-footer-note">
          ℹ Market data is simulated. Your decisions drive the story.
        </span>
      </div>

      {confirmData && (
        <ConfirmModal
          data={confirmData}
          currency={currency}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmData(null)}
        />
      )}
    </div>
  );
}
