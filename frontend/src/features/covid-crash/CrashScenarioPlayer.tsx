import { useCallback, useMemo, useState } from "react";
import type {
  CrashAttempt,
  CrashActionLogEntry,
  MarginCallDetails,
} from "../../types/covidCrash";
import { GFCScenarioPlayer } from "./GFCScenarioPlayer";
import {
  advanceCrash,
  buyCrash,
  sellCrash,
  moveCrash,
  selectBrokerCrash,
} from "../../utils/covidCrash";
import {
  formatGBP,
  formatAsset,
  formatBTC,
  formatGBPDelta,
  formatPercentDelta,
} from "./lib/format";
import { PriceChart } from "./components/PriceChart";
import { PriceStrip } from "./components/PriceStrip";
import { BuyPanel } from "./components/BuyPanel";
import { SellPanel } from "./components/SellPanel";
import { MoveCustodyPanel } from "./components/MoveCustodyPanel";
import { FTXEventModal } from "./components/FTXEventModal";
import { BrokerSelectionScreen } from "./components/BrokerSelectionScreen";
import { MarginCallModal, PCOModal } from "./components/BrokerEventModal";
import { StockBuyPanel } from "./components/StockBuyPanel";
import { StockSellPanel } from "./components/StockSellPanel";
import { WSBFeed } from "./components/WSBFeed";
import { ScenarioComplete } from "./components/ScenarioComplete";
import { StructuralSignalBanner } from "./components/StructuralSignalBanner";
import { useI18n } from "../../i18n/provider";
import { SCENARIO_COPY, type ScenarioCopy } from "./CrashLobby";

interface CrashScenarioPlayerProps {
  attempt: CrashAttempt;
  onAttemptUpdate: (updated: CrashAttempt) => void;
  onBack: () => void;
  onPlayAgain: () => void;
  isRestarting: boolean;
}

const TOTAL_ROUNDS = 5;

// ── Per-scenario round labels & chart dates ───────────────────────────────────

const ROUND_LABELS_COVID: Record<number, string> = {
  0: "Feb 2020",
  1: "Mar 2020",
  2: "Apr 2020",
  3: "Jul 2020",
  4: "Oct 2020",
};

const ROUND_LABELS_LUNA: Record<number, string> = {
  0: "Apr 5, 2022",
  1: "May 6, 2022",
  2: "May 9, 2022",
  3: "May 11, 2022",
  4: "May 13, 2022",
};

const ROUND_LABELS_FTX: Record<number, string> = {
  0: "Oct 1, 2022",
  1: "Nov 1, 2022",
  2: "Nov 6, 2022",
  3: "Nov 8, 2022",
  4: "Nov 11, 2022",
};

const ROUND_LABELS_GME: Record<number, string> = {
  0: "Jan 11, 2021",
  1: "Jan 22, 2021",
  2: "Jan 27, 2021",
  3: "Jan 28, 2021",
  4: "Feb 4, 2021",
};

const ROUND_DATES_COVID: Record<number, string> = {
  0: "2020-02-14",
  1: "2020-03-13",
  2: "2020-04-30",
  3: "2020-07-31",
  4: "2020-10-31",
};

const ROUND_DATES_LUNA: Record<number, string> = {
  0: "2022-04-05",
  1: "2022-05-06",
  2: "2022-05-09",
  3: "2022-05-11",
  4: "2022-05-13",
};

const ROUND_DATES_FTX: Record<number, string> = {
  0: "2022-10-01",
  1: "2022-11-01",
  2: "2022-11-06",
  3: "2022-11-08",
  4: "2022-11-11",
};

const ROUND_DATES_GME: Record<number, string> = {
  0: "2021-01-11",
  1: "2021-01-22",
  2: "2021-01-27",
  3: "2021-01-28",
  4: "2021-02-04",
};

function getScenarioMeta(scenarioOrder: number) {
  if (scenarioOrder === 2) {
    return { roundLabels: ROUND_LABELS_LUNA, roundDates: ROUND_DATES_LUNA };
  }
  if (scenarioOrder === 3) {
    return { roundLabels: ROUND_LABELS_FTX, roundDates: ROUND_DATES_FTX };
  }
  if (scenarioOrder === 4) {
    return { roundLabels: ROUND_LABELS_GME, roundDates: ROUND_DATES_GME };
  }
  return { roundLabels: ROUND_LABELS_COVID, roundDates: ROUND_DATES_COVID };
}

// ── Round pip indicator ───────────────────────────────────────────────────────
function RoundPips({ current, total }: { current: number; total: number }) {
  const { tx } = useI18n();
  return (
    <div className="cc-round-pips">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            "cc-round-pip",
            i < current ? "is-done" : "",
            i === current ? "is-current" : "",
          ]
            .filter(Boolean)
            .join(" ")}
          title={tx("Round {index}", { index: i + 1 })}
        />
      ))}
      <span className="cc-round-label">
        {tx("Round {current} of {total}", { current: current + 1, total })}
      </span>
    </div>
  );
}

// ── Balance strip (S1/S2) ─────────────────────────────────────────────────────
function BalanceStrip({
  attempt,
  assetSymbol,
}: {
  attempt: CrashAttempt;
  assetSymbol: string;
}) {
  const { tx } = useI18n();
  const { state } = attempt;
  const isUp = state.total_delta_pence >= 0;
  return (
    <div className="cc-balance-strip">
      <div className="cc-balance-item">
        <span className="cc-balance-label">{tx("Cash")}</span>
        <span className="cc-balance-value">{formatGBP(state.cash_pence)}</span>
      </div>
      <div className="cc-balance-item">
        <span className="cc-balance-label">{tx("{asset} held", { asset: assetSymbol })}</span>
        <span className="cc-balance-value">
          {formatAsset(state.btc_held_satoshis, assetSymbol)}
        </span>
      </div>
      <div className="cc-balance-item">
        <span className="cc-balance-label">{tx("Position value")}</span>
        <span className="cc-balance-value">{formatGBP(state.position_value_pence)}</span>
      </div>
      <div className="cc-balance-item cc-balance-item--total">
        <span className="cc-balance-label">{tx("Portfolio")}</span>
        <span className="cc-balance-value cc-balance-value--total">
          {formatGBP(state.total_value_pence)}
        </span>
        <span className={`cc-balance-delta ${isUp ? "is-up" : "is-down"}`}>
          {formatGBPDelta(state.total_delta_pence)}{" "}
          {formatPercentDelta(state.total_delta_basis_pts)}
        </span>
      </div>
    </div>
  );
}

// ── S3 custody-split balance strip ───────────────────────────────────────────
function CustodyBalanceStrip({ attempt }: { attempt: CrashAttempt }) {
  const { tx } = useI18n();
  const { state } = attempt;
  const isUp = state.total_delta_pence >= 0;
  const isBankrupt = state.ftx_bankruptcy_triggered;
  const isHalted   = state.ftx_withdrawals_halted;

  return (
    <div className="cc-balance-strip cc-balance-strip--custody">
      <div className="cc-balance-item">
        <span className="cc-balance-label">{tx("Cash")}</span>
        <span className="cc-balance-value">{formatGBP(state.cash_pence)}</span>
      </div>
      <div className={`cc-balance-item cc-balance-item--ftx ${isBankrupt ? "is-bankrupt" : isHalted ? "is-halted" : ""}`}>
        <span className="cc-balance-label">
          {tx("BTC on FTX")}
          {isHalted && !isBankrupt && <span className="cc-custody-badge cc-custody-badge--halted"> 🔒</span>}
          {isBankrupt && <span className="cc-custody-badge cc-custody-badge--bankrupt"> ☠️</span>}
        </span>
        <span className={`cc-balance-value ${isBankrupt ? "cc-balance-value--lost" : ""}`}>
          {isBankrupt ? tx("LOST") : formatBTC(state.btc_on_ftx_satoshis)}
        </span>
        <span className="cc-balance-sub">
          {isBankrupt ? formatGBP(0) : formatGBP(state.ftx_position_value_pence)}
        </span>
      </div>
      <div className="cc-balance-item cc-balance-item--cold">
        <span className="cc-balance-label">{tx("BTC in self-custody")} 🔐</span>
        <span className="cc-balance-value">{formatBTC(state.btc_in_self_custody_satoshis)}</span>
        <span className="cc-balance-sub">{formatGBP(state.self_custody_position_value_pence)}</span>
      </div>
      <div className="cc-balance-item cc-balance-item--total">
        <span className="cc-balance-label">{tx("Portfolio")}</span>
        <span className="cc-balance-value cc-balance-value--total">
          {formatGBP(state.total_value_pence)}
        </span>
        <span className={`cc-balance-delta ${isUp ? "is-up" : "is-down"}`}>
          {formatGBPDelta(state.total_delta_pence)}{" "}
          {formatPercentDelta(state.total_delta_basis_pts)}
        </span>
      </div>
    </div>
  );
}

// ── S4 stock/broker balance strip ─────────────────────────────────────────────
function StockBalanceStrip({ attempt }: { attempt: CrashAttempt }) {
  const { tx } = useI18n();
  const { state } = attempt;
  const shares = state.btc_in_self_custody_satoshis; // repurposed field
  const margin = state.margin_borrowed_pence ?? 0;
  const netEquity = state.net_equity_pence ?? state.total_value_pence;
  const isUp = state.total_delta_pence >= 0;
  const marginCallImminent = state.margin_call_imminent;

  return (
    <div className="cc-balance-strip cc-balance-strip--stock">
      <div className="cc-balance-item">
        <span className="cc-balance-label">{tx("Cash")}</span>
        <span className="cc-balance-value">{formatGBP(state.cash_pence)}</span>
      </div>
      <div className="cc-balance-item">
        <span className="cc-balance-label">{tx("GME held")}</span>
        <span className="cc-balance-value">
          {tx("{count} share_label", { count: shares }).replace("share_label", shares !== 1 ? tx("shares") : tx("share"))}
        </span>
        <span className="cc-balance-sub">
          {formatGBP(state.position_value_pence)}
        </span>
      </div>
      {margin > 0 && (
        <div className={`cc-balance-item cc-balance-item--margin ${marginCallImminent ? "is-danger" : ""}`}>
          <span className="cc-balance-label">
            {tx("Margin borrowed")}
            {marginCallImminent && " ⚠️"}
          </span>
          <span className="cc-balance-value cc-balance-value--margin">
            −{formatGBP(margin)}
          </span>
          {marginCallImminent && (
            <span className="cc-balance-sub cc-balance-sub--danger">
              {tx("Margin call risk!")}
            </span>
          )}
        </div>
      )}
      <div className="cc-balance-item cc-balance-item--total">
        <span className="cc-balance-label">{tx("Net equity")}</span>
        <span className="cc-balance-value cc-balance-value--total">
          {formatGBP(netEquity)}
        </span>
        <span className={`cc-balance-delta ${isUp ? "is-up" : "is-down"}`}>
          {formatGBPDelta(state.total_delta_pence)}{" "}
          {formatPercentDelta(state.total_delta_basis_pts)}
        </span>
      </div>
    </div>
  );
}

// ── Action log for current round ──────────────────────────────────────────────
function RoundActionLog({
  entries,
  roundIndex,
  assetSymbol,
  isStock,
}: {
  entries: CrashActionLogEntry[];
  roundIndex: number;
  assetSymbol: string;
  isStock: boolean;
}) {
  const { tx } = useI18n();
  const roundEntries = entries.filter(
    (e) => e.round_index === roundIndex && !e.is_synthetic
  );
  if (roundEntries.length === 0) {
    return <p className="cc-action-log-empty">{tx("No trades this round yet.")}</p>;
  }

  function actionVerb(action: string) {
    switch (action) {
      case "buy":        return tx("Bought");
      case "buy_margin": return tx("Bought (margin)");
      case "sell":       return isStock ? tx("Sold") : tx("Sold (FTX)");
      case "sell_self":  return tx("Sold (wallet)");
      case "move_to_cold": return tx("→ Cold wallet");
      case "move_to_ftx":  return tx("→ FTX");
      case "ftx_yield":    return tx("Yield credited");
      case "ftx_loss":     return tx("Lost on FTX");
      default:             return action;
    }
  }

  function actionDetail(e: CrashActionLogEntry) {
    if (isStock) {
      const shares = e.btc_quantity_satoshis;
      if (e.action === "buy" || e.action === "buy_margin") {
        return `${shares} ${shares !== 1 ? tx("shares") : tx("share")} ${tx("for")} ${formatGBP(e.amount_pence)}`;
      }
      if (e.action === "sell") {
        return `${shares} ${shares !== 1 ? tx("shares") : tx("share")} → ${formatGBP(e.amount_pence)}`;
      }
      return "";
    }
    if (e.action === "buy") {
      return `${formatGBP(e.amount_pence)} → ${formatAsset(e.btc_quantity_satoshis, assetSymbol)}`;
    }
    if (e.action === "sell" || e.action === "sell_self") {
      return `${formatAsset(e.btc_quantity_satoshis, assetSymbol)} → ${formatGBP(e.amount_pence)}`;
    }
    if (e.action === "move_to_cold" || e.action === "move_to_ftx") {
      return `${formatAsset(e.btc_quantity_satoshis, assetSymbol)} (${tx("fee")} ${formatGBP(e.amount_pence)})`;
    }
    if (e.action === "ftx_yield") {
      return `+${formatAsset(e.btc_quantity_satoshis, assetSymbol)}`;
    }
    if (e.action === "ftx_loss") {
      return `${formatAsset(Math.abs(e.btc_quantity_satoshis), assetSymbol)} ${tx("wiped")}`;
    }
    return "";
  }

  return (
    <ul className="cc-action-log-list">
      {roundEntries.map((e, i) => (
        <li key={i} className={`cc-action-log-item cc-action-log-item--${e.action}`}>
          <span className="cc-action-log-verb">{actionVerb(e.action)}</span>
          <span className="cc-action-log-detail">{actionDetail(e)}</span>
          {e.price_pence > 0 && (
            <span className="cc-action-log-price">@ {formatGBP(e.price_pence)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

// ── Advance button ────────────────────────────────────────────────────────────
function AdvanceButton({
  roundIndex,
  isLoading,
  onAdvance,
  roundLabels,
}: {
  roundIndex: number;
  isLoading: boolean;
  onAdvance: () => void;
  roundLabels: Record<number, string>;
}) {
  const { tx } = useI18n();
  const isFinal = roundIndex >= TOTAL_ROUNDS - 1;
  const nextLabel = roundLabels[(roundIndex + 1) as keyof typeof roundLabels] ?? tx("Next Round");
  return (
    <div className="cc-advance-bar">
      <button
        className={`cc-advance-btn ${isFinal ? "cc-advance-btn--final" : ""}`}
        disabled={isLoading}
        onClick={onAdvance}
        type="button"
      >
        {isLoading
          ? tx("Loading…")
          : isFinal
          ? tx("Reveal Final Results →")
          : tx("Advance to {label} →", { label: tx(nextLabel) })}
      </button>
      {!isFinal && (
        <p className="cc-advance-hint">
          {tx("You can continue trading before advancing to the next round.")}
        </p>
      )}
    </div>
  );
}

// ── S3 Yield notification banner ──────────────────────────────────────────────
function YieldBanner({ satoshis }: { satoshis: number }) {
  const { tx, formatDate } = useI18n();
  if (satoshis <= 0) return null;
  return (
    <div className="cc-yield-banner" role="status">
      <span aria-hidden="true">📈</span>
      {tx("FTX credited {amount} in yield on your BTC balance.", { amount: formatBTC(satoshis) })}
    </div>
  );
}

// ── S4 margin interest notification banner ────────────────────────────────────
function MarginInterestBanner({ pence }: { pence: number }) {
  const { tx } = useI18n();
  if (pence <= 0) return null;
  return (
    <div className="cc-yield-banner cc-yield-banner--cost" role="status">
      <span aria-hidden="true">💸</span>
      {tx("Trading Forge charged {amount} in margin interest.", { amount: formatGBP(pence) })}
    </div>
  );
}

// ── Back confirm modal ────────────────────────────────────────────────────────
function BackConfirmModal({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const { tx } = useI18n();
  return (
    <div className="cc-confirm-backdrop" role="dialog" aria-modal="true">
      <div className="cc-confirm-card">
        <h3 className="cc-confirm-title">{tx("Leave this scenario?")}</h3>
        <p className="cc-confirm-hint">{tx("Your progress is saved. You can resume it later.")}</p>
        <div className="cc-confirm-actions">
          <button className="cc-btn cc-btn--primary" onClick={onStay} type="button">
            {tx("Stay")}
          </button>
          <button className="cc-btn cc-btn--ghost" onClick={onLeave} type="button">
            {tx("Leave")}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main player ───────────────────────────────────────────────────────────────
export function CrashScenarioPlayer({
  attempt,
  onAttemptUpdate,
  onBack,
  onPlayAgain,
  isRestarting,
}: CrashScenarioPlayerProps) {
  const { tx, formatDate } = useI18n();
  const [isAdvancing, setIsAdvancing]     = useState(false);
  const [isTrading, setIsTrading]         = useState(false);
  const [isMoving, setIsMoving]           = useState(false);
  const [isBrokerSelect, setIsBrokerSelect] = useState(false);
  const [tradeError, setTradeError]       = useState<string | null>(null);
  const [moveError, setMoveError]         = useState<string | null>(null);
  const [advanceError, setAdvanceError]   = useState<string | null>(null);
  const [brokerError, setBrokerError]     = useState<string | null>(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  // S3 FTX event modal state
  const [pendingHaltModal, setPendingHaltModal]         = useState(false);
  const [pendingBankruptModal, setPendingBankruptModal] = useState(false);
  const [btcLostInBankruptcy, setBtcLostInBankruptcy]   = useState(0);
  const [yieldJustEarned, setYieldJustEarned]           = useState<number | null>(null);

  // S4 broker event modal state
  const [pendingPCOModal, setPendingPCOModal]     = useState(false);
  const [pendingMarginCall, setPendingMarginCall] = useState<MarginCallDetails | null>(null);
  const [marginInterestJustCharged, setMarginInterestJustCharged] = useState(0);

  // Queued advance: after a modal is dismissed, push the updated attempt.
  const [pendingAttempt, setPendingAttempt] = useState<CrashAttempt | null>(null);

  const round = attempt.current_round;
  const { state } = attempt;
  const accentColor       = attempt.scenario.accent_color;
  const assetSymbol       = attempt.scenario.asset_symbol;
  const assetName         = tx(attempt.scenario.asset_name);
  const isCustodySplit    = attempt.scenario.uses_custody_split;
  const isBrokerScenario  = attempt.scenario.uses_broker_mechanics;
  const { roundLabels, roundDates } = getScenarioMeta(attempt.scenario.order);

  // Editorial copy from the design handoff — shared with the lobby card so the
  // player header reads the same title/tier/tag the user just clicked into.
  const editorial: ScenarioCopy = SCENARIO_COPY[attempt.scenario.order] ?? {
    title: attempt.scenario.title,
    tier: attempt.scenario.order <= 1 ? "Beginner"
      : attempt.scenario.order <= 3 ? "Intermediate"
      : "Advanced",
    tag: attempt.scenario.lesson_tag,
    body: attempt.scenario.subtitle,
    recommended: false,
  };
  const tierChipClass =
    editorial.tier === "Advanced"
      ? "cl-chip cl-chip--neg"
      : editorial.tier === "Intermediate"
      ? "cl-chip cl-chip--warn"
      : "cl-chip cl-chip--accent";
  const translatedAttempt = useMemo<CrashAttempt>(
    () => ({
      ...attempt,
      scenario: {
        ...attempt.scenario,
        title: tx(attempt.scenario.title),
        subtitle: tx(attempt.scenario.subtitle),
        historical_period: tx(attempt.scenario.historical_period),
        lesson_tag: tx(attempt.scenario.lesson_tag),
        asset_name: tx(attempt.scenario.asset_name),
        asset_unit_label: tx(attempt.scenario.asset_unit_label),
      },
      current_round: attempt.current_round
        ? {
            ...attempt.current_round,
            context_paragraph: tx(attempt.current_round.context_paragraph),
            structural_signal_text: tx(attempt.current_round.structural_signal_text),
            wsb_feed_text: tx(attempt.current_round.wsb_feed_text),
          }
        : null,
    }),
    [attempt, tx],
  );

  // S4 broker state
  const brokerChoice = state.broker_choice as "trading_forge" | "highford_latham" | "" | undefined;
  const needsBrokerSelect = isBrokerScenario && !brokerChoice;
  const pcoActive = state.broker_pco_active ?? false;

  // ── Broker selection handler ──────────────────────────────────────────────

  const handleSelectBroker = useCallback(
    async (broker: "trading_forge" | "highford_latham") => {
      if (isBrokerSelect) return;
      setIsBrokerSelect(true);
      setBrokerError(null);
      try {
        const res = await selectBrokerCrash(attempt.id, broker);
        onAttemptUpdate(res.attempt);
      } catch (err: unknown) {
        setBrokerError(err instanceof Error ? err.message : tx("Failed to select broker."));
      } finally {
        setIsBrokerSelect(false);
      }
    },
    [attempt.id, isBrokerSelect, onAttemptUpdate],
  );

  // ── Trade handlers ────────────────────────────────────────────────────────

  const handleBuy = useCallback(
    async (amountPence: number, useMargin = false) => {
      if (isTrading) return;
      setIsTrading(true);
      setTradeError(null);
      try {
        const res = await buyCrash(attempt.id, amountPence, useMargin);
        onAttemptUpdate(res.attempt);
      } catch (err: unknown) {
        setTradeError(err instanceof Error ? err.message : tx("Buy failed."));
      } finally {
        setIsTrading(false);
      }
    },
    [attempt.id, isTrading, onAttemptUpdate],
  );

  const handleSell = useCallback(
    async (satoshis: number, source: "auto" | "ftx" | "self_custody" = "auto") => {
      if (isTrading) return;
      setIsTrading(true);
      setTradeError(null);
      try {
        const res = await sellCrash(attempt.id, satoshis, source);
        onAttemptUpdate(res.attempt);
      } catch (err: unknown) {
        setTradeError(err instanceof Error ? err.message : tx("Sell failed."));
      } finally {
        setIsTrading(false);
      }
    },
    [attempt.id, isTrading, onAttemptUpdate],
  );

  const handleMove = useCallback(
    async (satoshis: number, direction: "to_self_custody" | "to_ftx") => {
      if (isMoving) return;
      setIsMoving(true);
      setMoveError(null);
      try {
        const res = await moveCrash(attempt.id, satoshis, direction);
        onAttemptUpdate(res.attempt);
      } catch (err: unknown) {
        setMoveError(err instanceof Error ? err.message : tx("Move failed."));
      } finally {
        setIsMoving(false);
      }
    },
    [attempt.id, isMoving, onAttemptUpdate],
  );

  // ── Advance handler ───────────────────────────────────────────────────────

  const handleAdvance = useCallback(async () => {
    if (isAdvancing) return;
    setIsAdvancing(true);
    setAdvanceError(null);
    setYieldJustEarned(null);
    setMarginInterestJustCharged(0);
    try {
      const res = await advanceCrash(attempt.id);

      // S3: show yield banner if earned
      if (res.ftx_yield_earned_satoshis && res.ftx_yield_earned_satoshis > 0) {
        setYieldJustEarned(res.ftx_yield_earned_satoshis);
      }

      // S4: show margin interest banner
      if (res.margin_interest_charged_pence > 0) {
        setMarginInterestJustCharged(res.margin_interest_charged_pence);
      }

      if (res.ftx_withdrawals_just_halted) {
        setPendingAttempt(res.attempt);
        setPendingHaltModal(true);
      } else if (res.ftx_just_went_bankrupt) {
        setBtcLostInBankruptcy(res.btc_lost_in_bankruptcy_satoshis);
        setPendingAttempt(res.attempt);
        setPendingBankruptModal(true);
      } else if (res.pco_just_imposed) {
        // PCO modal shown before revealing new round state
        setPendingAttempt(res.attempt);
        setPendingPCOModal(true);
      } else if (res.margin_call_triggered && res.margin_call_details) {
        // Margin call modal
        setPendingAttempt(res.attempt);
        setPendingMarginCall(res.margin_call_details);
      } else {
        onAttemptUpdate(res.attempt);
      }
    } catch (err: unknown) {
      setAdvanceError(err instanceof Error ? err.message : tx("Failed to advance."));
    } finally {
      setIsAdvancing(false);
    }
  }, [attempt.id, isAdvancing, onAttemptUpdate]);

  // ── Modal dismiss handlers ────────────────────────────────────────────────

  function flushPendingAttempt() {
    if (pendingAttempt) {
      onAttemptUpdate(pendingAttempt);
      setPendingAttempt(null);
    }
  }

  const handleHaltModalConfirm = useCallback(() => {
    setPendingHaltModal(false);
    flushPendingAttempt();
  }, [pendingAttempt, onAttemptUpdate]); // eslint-disable-line

  const handleBankruptModalConfirm = useCallback(() => {
    setPendingBankruptModal(false);
    flushPendingAttempt();
  }, [pendingAttempt, onAttemptUpdate]); // eslint-disable-line

  const handlePCOModalConfirm = useCallback(() => {
    setPendingPCOModal(false);
    flushPendingAttempt();
  }, [pendingAttempt, onAttemptUpdate]); // eslint-disable-line

  const handleMarginCallConfirm = useCallback(() => {
    setPendingMarginCall(null);
    flushPendingAttempt();
  }, [pendingAttempt, onAttemptUpdate]); // eslint-disable-line

  // ── Scenario 5: GFC multi-asset player ───────────────────────────────────

  if (attempt.scenario.is_multi_asset) {
    if (attempt.is_complete && attempt.final_state_snapshot) {
      return (
        <ScenarioComplete
          attempt={attempt}
          onBack={onBack}
          onPlayAgain={onPlayAgain}
          isRestarting={isRestarting}
        />
      );
    }
    return (
        <GFCScenarioPlayer
          attempt={translatedAttempt}
        onAttemptUpdate={onAttemptUpdate}
        onBack={onBack}
      />
    );
  }

  // ── Scenario complete ─────────────────────────────────────────────────────

  if (attempt.is_complete && attempt.final_state_snapshot) {
    return (
        <ScenarioComplete
          attempt={translatedAttempt}
        onBack={onBack}
        onPlayAgain={onPlayAgain}
        isRestarting={isRestarting}
      />
    );
  }

  // ── S4: broker selection gate ─────────────────────────────────────────────

  if (needsBrokerSelect) {
    return (
      <div className="cc-player-wrap">
        <div
          className="cc-player-header"
          style={{ "--cc-accent": accentColor } as React.CSSProperties}
        >
          <button className="cc-player-back" onClick={() => setShowBackConfirm(true)} type="button">
            ← {tx("Lobby")}
          </button>
          <div className="cc-player-header-center">
            <span className="cc-player-scenario-title">{translatedAttempt.scenario.title}</span>
          </div>
          <div className="cc-player-header-right" />
        </div>

        <BrokerSelectionScreen
          attemptId={attempt.id}
          onSelect={(broker) => void handleSelectBroker(broker)}
          isSubmitting={isBrokerSelect}
          error={brokerError}
        />

        {showBackConfirm && (
          <BackConfirmModal onStay={() => setShowBackConfirm(false)} onLeave={onBack} />
        )}
      </div>
    );
  }

  if (!round) {
    return (
      <div className="cc-player-error">
        <p>{tx("Round data not available.")}</p>
        <button className="cc-btn cc-btn--ghost" onClick={onBack} type="button">
          ← {tx("Back")}
        </button>
      </div>
    );
  }

  // ── FTX state shortcuts ───────────────────────────────────────────────────
  const ftxHalted   = state.ftx_withdrawals_halted;
  const ftxBankrupt = state.ftx_bankruptcy_triggered;
  const ftxLocked   = ftxHalted || ftxBankrupt;

  // ── S4 shortcuts ──────────────────────────────────────────────────────────
  const shares    = state.btc_in_self_custody_satoshis; // repurposed for stocks
  const margin    = state.margin_borrowed_pence ?? 0;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="cc-player-wrap">
      {/* ── Top header ──────────────────────────────────────────────── */}
      <div
        className="cc-player-header"
        style={{ "--cc-accent": accentColor } as React.CSSProperties}
      >
        <button
          className="cc-player-back"
          onClick={() => setShowBackConfirm(true)}
          type="button"
        >
          ← {tx("Lobby")}
        </button>
        <div className="cc-player-header-center">
          <span className="cc-player-scenario-title">{translatedAttempt.scenario.title}</span>
          <RoundPips current={attempt.current_round_index} total={TOTAL_ROUNDS} />
        </div>
        <div className="cc-player-header-right">
          <span className="cc-player-date">
            {formatDate(new Date(`${round.scenario_date}T00:00:00`), {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          {isBrokerScenario && brokerChoice && (
            <span className="cc-player-broker-badge">
              {brokerChoice === "trading_forge" ? `🔥 ${tx("Trading Forge")}` : `🏛️ ${tx("Highford & Latham")}`}
            </span>
          )}
        </div>
      </div>

      {/* ── Editorial scenario hero (matches Crash Lab lobby + design handoff) ── */}
      <section className="cl-player-hero">
        <div className="cl-player-hero-inner">
          <div className="cl-card-eyebrow">
            {tx("Scenario")} · {assetSymbol}/GBP
          </div>
          <div className="cl-card-chips">
            <span className={tierChipClass}>{tx(editorial.tier)}</span>
            <span className="cl-chip">{tx(editorial.tag)}</span>
          </div>
          <h1 className="cl-player-hero-title">{tx(editorial.title)}</h1>
          <p className="cl-player-hero-sub">{tx(editorial.body)}</p>
        </div>
      </section>

      {/* ── Balance strip ────────────────────────────────────────────── */}
      {isBrokerScenario ? (
        <StockBalanceStrip attempt={attempt} />
      ) : isCustodySplit ? (
        <CustodyBalanceStrip attempt={attempt} />
      ) : (
        <BalanceStrip attempt={attempt} assetSymbol={assetSymbol} />
      )}

      {/* ── Event banners ─────────────────────────────────────────── */}
      {yieldJustEarned !== null && yieldJustEarned > 0 && (
        <YieldBanner satoshis={yieldJustEarned} />
      )}
      {marginInterestJustCharged > 0 && (
        <MarginInterestBanner pence={marginInterestJustCharged} />
      )}

      {/* ── Two-column body ──────────────────────────────────────────── */}
      <div className="cc-player-layout">
        {/* Sidebar */}
        <aside className="cc-sidebar">
          <div className="cc-situation-card">
            <div className="cc-situation-header">
              <span className="cc-situation-icon" aria-hidden="true">📢</span>
              <span className="cc-situation-label">{tx("THE SITUATION")}</span>
            </div>
            <div className="cc-situation-body">
              {translatedAttempt.current_round?.context_paragraph.split("\n\n").map((para, i) => (
                <p key={i} className="cc-situation-para">
                  {para}
                </p>
              ))}
            </div>
          </div>

          {/* S4: WSB sentiment feed */}
          {isBrokerScenario && round.wsb_feed_text && (
            <WSBFeed
              feedText={translatedAttempt.current_round?.wsb_feed_text ?? ""}
              roundIndex={attempt.current_round_index}
            />
          )}

          <div className="cc-round-trades">
            <p className="cc-round-trades-heading">{tx("YOUR TRADES THIS ROUND")}</p>
            <RoundActionLog
              entries={attempt.action_log}
              roundIndex={attempt.current_round_index}
              assetSymbol={assetSymbol}
              isStock={isBrokerScenario}
            />
          </div>

          {!isBrokerScenario && state.btc_held_satoshis > 0 && !ftxBankrupt && (
            <div className="cc-unrealised-card">
              <p className="cc-unrealised-label">{tx("Unrealised P&L")}</p>
              <p
                className={`cc-unrealised-value ${
                  state.unrealised_pnl_pence >= 0 ? "is-up" : "is-down"
                }`}
              >
                {formatGBPDelta(state.unrealised_pnl_pence)}
              </p>
              <p className="cc-unrealised-sub">
                {tx("Avg entry")} {formatGBP(state.avg_entry_price_pence)} → {tx("now")}{" "}
                {formatGBP(state.current_price_pence)}
              </p>
            </div>
          )}

          {isBrokerScenario && shares > 0 && (
            <div className="cc-unrealised-card">
              <p className="cc-unrealised-label">{tx("Unrealised P&L")}</p>
              <p
                className={`cc-unrealised-value ${
                  state.unrealised_pnl_pence >= 0 ? "is-up" : "is-down"
                }`}
              >
                {formatGBPDelta(state.unrealised_pnl_pence)}
              </p>
              <p className="cc-unrealised-sub">
                {tx("Avg entry")} {formatGBP(state.avg_entry_price_pence)} → {tx("now")}{" "}
                {formatGBP(state.current_price_pence)}
              </p>
              {margin > 0 && (
                <p className="cc-unrealised-sub cc-unrealised-sub--margin">
                  {tx("Borrowed:")} {formatGBP(margin)}
                </p>
              )}
            </div>
          )}
        </aside>

        {/* Main area */}
        <section className="cc-main">
          {/* Structural signal banner */}
          <StructuralSignalBanner text={translatedAttempt.current_round?.structural_signal_text ?? ""} />

          {/* Candlestick chart */}
            <PriceChart
              candles={attempt.all_candles}
              actionLog={attempt.action_log}
              logScale={attempt.scenario.chart_log_scale}
              roundScenarioDates={roundDates}
              assetName={assetName}
              costBasisPence={
                state.avg_entry_price_pence > 0 && state.remaining_sats > 0
                  ? state.avg_entry_price_pence
                  : undefined
              }
            />

          {/* Price strip */}
          <PriceStrip currentRound={round} />

          {/* ── Action panels ─────────────────────────────────────── */}
          {isBrokerScenario && brokerChoice ? (
            /* S4: Stock buy + sell panels */
            <div className="cc-panels-row">
              <StockBuyPanel
                cashPence={state.cash_pence}
                pricePence={round.price_pence}
                broker={brokerChoice}
                marginBorrowedPence={margin}
                isSubmitting={isTrading}
                pcoBocked={pcoActive && brokerChoice === "trading_forge"}
                onBuy={(pence, useMargin) => void handleBuy(pence, useMargin)}
              />
              <StockSellPanel
                sharesHeld={shares}
                pricePence={round.price_pence}
                broker={brokerChoice}
                isSubmitting={isTrading}
                onSell={(sh) => void handleSell(sh)}
              />
            </div>
          ) : isCustodySplit ? (
            /* S3: Buy / Sell FTX / Sell Self-Custody / Move panels */
            <div className="cc-panels-s3">
              <div className="cc-panels-row">
                <BuyPanel
                  cashPence={state.cash_pence}
                  pricePence={round.price_pence}
                  isSubmitting={isTrading}
                  onBuy={(pence) => void handleBuy(pence)}
                  disabled={ftxLocked}
                  disabledReason={ftxLocked ? tx("FTX is unavailable") : undefined}
                />
                <SellPanel
                  btcHeldSatoshis={state.btc_on_ftx_satoshis}
                  pricePence={round.price_pence}
                  isSubmitting={isTrading}
                  onSell={(sats) => void handleSell(sats, "ftx")}
                  assetSymbol={assetSymbol}
                  positionValueIsDust={false}
                  label={tx("SELL (FTX)")}
                  disabled={ftxLocked}
                  disabledReason={
                    ftxHalted ? tx("Withdrawals halted") :
                    ftxBankrupt ? tx("FTX bankrupt") : undefined
                  }
                />
              </div>
              <div className="cc-panels-row">
                <SellPanel
                  btcHeldSatoshis={state.btc_in_self_custody_satoshis}
                  pricePence={round.price_pence}
                  isSubmitting={isTrading}
                  onSell={(sats) => void handleSell(sats, "self_custody")}
                  assetSymbol={assetSymbol}
                  positionValueIsDust={false}
                  label={tx("SELL (WALLET)")}
                />
                <MoveCustodyPanel
                  direction="to_self_custody"
                  sourceSatoshis={state.btc_on_ftx_satoshis}
                  pricePence={round.price_pence}
                  cashPence={state.cash_pence}
                  isSubmitting={isMoving}
                  isLocked={ftxLocked}
                  onMove={(sats, dir) => void handleMove(sats, dir)}
                />
              </div>
              {moveError && <p className="cc-trade-error">{moveError}</p>}
            </div>
          ) : (
            /* S1/S2: standard Buy + Sell */
            <div className="cc-panels-row">
              <BuyPanel
                cashPence={state.cash_pence}
                pricePence={round.price_pence}
                isSubmitting={isTrading}
                onBuy={(pence) => void handleBuy(pence)}
              />
              <SellPanel
                btcHeldSatoshis={state.btc_held_satoshis}
                pricePence={round.price_pence}
                isSubmitting={isTrading}
                onSell={(sats) => void handleSell(sats)}
                assetSymbol={assetSymbol}
                positionValueIsDust={state.position_value_is_dust}
              />
            </div>
          )}

          {tradeError && <p className="cc-trade-error">{tradeError}</p>}
          {advanceError && <p className="cc-advance-error">{advanceError}</p>}

          <AdvanceButton
            roundIndex={attempt.current_round_index}
            isLoading={isAdvancing}
            onAdvance={() => void handleAdvance()}
            roundLabels={roundLabels}
          />
        </section>
      </div>

      {/* ── Back confirm modal ───────────────────────────────────── */}
      {showBackConfirm && (
        <BackConfirmModal
          onStay={() => setShowBackConfirm(false)}
          onLeave={onBack}
        />
      )}

      {/* ── S3: FTX halt modal ───────────────────────────────────── */}
      {pendingHaltModal && (
        <FTXEventModal
          variant="halt"
          btcOnFtxSatoshis={
            pendingAttempt?.state.btc_on_ftx_satoshis ??
            state.btc_on_ftx_satoshis
          }
          onConfirm={handleHaltModalConfirm}
        />
      )}

      {/* ── S3: FTX bankruptcy modal ─────────────────────────────── */}
      {pendingBankruptModal && (
        <FTXEventModal
          variant="bankruptcy"
          btcLostSatoshis={btcLostInBankruptcy}
          lossValuePence={
            (btcLostInBankruptcy * round.price_pence) / 100_000_000
          }
          onConfirm={handleBankruptModalConfirm}
        />
      )}

      {/* ── S4: PCO modal ────────────────────────────────────────── */}
      {pendingPCOModal && brokerChoice && (
        <PCOModal broker={brokerChoice} onConfirm={handlePCOModalConfirm} />
      )}

      {/* ── S4: Margin call modal ────────────────────────────────── */}
      {pendingMarginCall && (
        <MarginCallModal details={pendingMarginCall} onConfirm={handleMarginCallConfirm} />
      )}
    </div>
  );
}
