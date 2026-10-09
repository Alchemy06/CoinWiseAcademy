/**
 * ScenarioComplete.tsx — End-of-scenario overlay.
 *
 * Shown when attempt.is_complete = true. Displays:
 *   1. Final portfolio value + delta vs starting balance
 *   2. Reference outcomes comparison (different rows per scenario)
 *   3. Behaviour pattern badge + lesson narrative card
 *   4. Round-by-round decision recap from action_log
 *   5. Back to Lobby / Play Again actions
 *
 * Supports both Scenario 1 (COVID Crash) and Scenario 2 (Luna Collapse).
 * All monetary data comes from attempt.final_state_snapshot, written server-side
 * by _complete_attempt() and never mutated after that.
 */

import type { CrashAttempt, CrashActionLogEntry, CrashFinalSnapshot } from "../../../types/covidCrash";
import { formatGBP, formatAsset, formatGBPDelta, formatPercentDelta } from "../lib/format";

// ── Pattern metadata ──────────────────────────────────────────────────────────

const PATTERN_LABELS: Record<string, string> = {
  // COVID Crash
  missed_it:               "Stayed Out",
  panic_seller:            "Panic Seller",
  dip_buyer:               "Dip Buyer",
  disciplined_holder:      "Disciplined Holder",
  active_trader:           "Active Trader",
  // Luna Collapse
  bought_at_peak_held:     "Held to the Floor",
  buy_the_dip_into_zero:   "Bought the Dip into Zero",
  partial_exit:            "Late Exit",
  // FTX Collapse (some shared with Luna: stayed_out, signal_reader)
  stayed_out:              "Stayed Out",
  signal_reader:           "Read the Signal",
  pure_self_custody:       "Self-Custody Throughout",
  partial_protection:      "Partial Protection",
  full_loss:               "Lost on FTX",
  actively_traded:         "Exited Before Bankruptcy",
  // GameStop Short Squeeze
  margin_call_wipeout:     "Margin Call Wipeout",
  sold_at_peak:            "Sold at the Peak",
  diamond_hands_held_to_zero: "💎 Diamond Hands",
  fomo_buyer:              "FOMO Buyer",
  caught_by_pco_sold:      "PCO Trapped — Sold",
  caught_by_pco_held:      "PCO Trapped — Held",
  took_profits_early:      "Took Profits Early",
  // GFC 2008
  cash_through_crisis:     "Stayed in Cash",
  rbs_holder:              "RBS Holder",
  gold_bull:               "Gold Bull",
  balanced_portfolio:      "Balanced Portfolio",
  safe_haven_seeker:       "Safe Haven Seeker",
  active_rotator:          "Active Rotator",
  bottom_picker:           "Bottom Picker",
};

const PATTERN_EMOJI: Record<string, string> = {
  // COVID Crash
  missed_it:               "🪑",
  panic_seller:            "😱",
  dip_buyer:               "🦅",
  disciplined_holder:      "🛡️",
  active_trader:           "⚡",
  // Luna Collapse
  bought_at_peak_held:     "📉",
  buy_the_dip_into_zero:   "🕳️",
  partial_exit:            "🚪",
  // FTX Collapse
  stayed_out:              "🪑",
  signal_reader:           "👁️",
  pure_self_custody:       "🔐",
  partial_protection:      "🛡️",
  full_loss:               "💀",
  actively_traded:         "⚡",
  // GameStop Short Squeeze
  margin_call_wipeout:     "📉",
  sold_at_peak:            "🎯",
  diamond_hands_held_to_zero: "💎",
  fomo_buyer:              "🚀",
  caught_by_pco_sold:      "🔒",
  caught_by_pco_held:      "⛓️",
  took_profits_early:      "✂️",
  // GFC 2008
  cash_through_crisis:     "💵",
  rbs_holder:              "📉",
  gold_bull:               "🥇",
  balanced_portfolio:      "⚖️",
  safe_haven_seeker:       "🛡️",
  active_rotator:          "🔄",
  bottom_picker:           "🎯",
};

// ── Per-scenario round metadata ───────────────────────────────────────────────

const ROUND_DATE_LABELS: Record<number, Record<number, string>> = {
  1: {
    0: "Feb 14, 2020",
    1: "Mar 13, 2020",
    2: "Apr 30, 2020",
    3: "Jul 31, 2020",
    4: "Oct 31, 2020",
  },
  2: {
    0: "Apr 5, 2022",
    1: "May 6, 2022",
    2: "May 9, 2022",
    3: "May 11, 2022",
    4: "May 13, 2022",
  },
  3: {
    0: "Oct 1, 2022",
    1: "Nov 1, 2022",
    2: "Nov 6, 2022",
    3: "Nov 8, 2022",
    4: "Nov 11, 2022",
  },
  4: {
    0: "Jan 11, 2021",
    1: "Jan 22, 2021",
    2: "Jan 27, 2021",
    3: "Jan 28, 2021",
    4: "Feb 4, 2021",
  },
  5: {
    0: "Sep 12, 2008",
    1: "Sep 29, 2008",
    2: "Oct 7, 2008",
    3: "Oct 27, 2008",
    4: "Jan 19, 2009",
    5: "Mar 3, 2009",
  },
};

const ROUND_PRICE_LABELS: Record<number, Record<number, string>> = {
  1: {
    0: "£7,920",
    1: "£4,355",
    2: "£7,063",
    3: "£8,625",
    4: "£10,615",
  },
  2: {
    0: "£91.22",
    1: "£61.79",
    2: "£49.19",
    3: "£4.07",
    4: "£0.24",
  },
  3: {
    0: "£17,080",
    1: "£17,830",
    2: "£18,400",
    3: "£16,090",
    4: "£14,830",
  },
  4: {
    0: "£14.74",
    1: "£47.52",
    2: "£253.47",
    3: "£141.31",
    4: "£39.17",
  },
  5: {
    0: "FTSE 5,416",
    1: "FTSE 4,898",
    2: "FTSE 4,670",
    3: "FTSE 3,883",
    4: "FTSE 4,015",
    5: "FTSE 3,512",
  },
};

const SCENARIO_END_DATE: Record<number, string> = {
  1: "Dec 31, 2020",
  2: "May 27, 2022",
  3: "Mar 31, 2023",
  4: "Feb 19, 2021",
  5: "Jun 1, 2009",
};

// ── Reference outcomes comparison ─────────────────────────────────────────────

function OutcomesComparison({
  snap,
  userFinalPence,
  scenarioOrder,
}: {
  snap: CrashFinalSnapshot;
  userFinalPence: number;
  scenarioOrder: number;
}) {
  const startPence = snap.final_state.starting_balance_pence;
  const ref = snap.reference_outcomes;

  // Build rows depending on scenario
  let rows: { label: string; pence: number; isUser: boolean; dim: boolean }[];
  let subtitle: string;

  if (scenarioOrder === 4) {
    // GameStop Short Squeeze
    rows = [
      {
        label: "Stayed in cash",
        pence: ref.all_cash_pence ?? startPence,
        isUser: false,
        dim: true,
      },
      { label: "You", pence: userFinalPence, isUser: true, dim: false },
      {
        label: "Bought Jan 11 (£14.74), held to end",
        pence: ref.bought_r0_held_pence ?? 0,
        isUser: false,
        dim: false,
      },
      {
        label: "Perfect trade: bought Jan 11, sold at peak",
        pence: ref.bought_r0_sold_peak_pence ?? 0,
        isUser: false,
        dim: false,
      },
      {
        label: "Bought at peak (£253.47), held to end",
        pence: ref.bought_peak_held_pence ?? 0,
        isUser: false,
        dim: false,
      },
    ];
    subtitle = `Starting balance ${formatGBP(startPence)} · GME/GBP ${formatGBP(snap.end_price_pence)} on Feb 19, 2021`;
  } else if (scenarioOrder === 3) {
    // FTX Collapse
    rows = [
      {
        label: "Stayed in cash",
        pence: ref.all_cash_pence ?? startPence,
        isUser: false,
        dim: true,
      },
      { label: "You", pence: userFinalPence, isUser: true, dim: false },
      {
        label: "Bought at Oct 2022, self-custody",
        pence: ref.self_custody_held_pence ?? 0,
        isUser: false,
        dim: false,
      },
      {
        label: "Moved to cold at Nov 6 signal",
        pence: ref.moved_at_signal_pence ?? 0,
        isUser: false,
        dim: false,
      },
      {
        label: "All on FTX, never moved",
        pence: ref.ftx_never_moved_pence ?? 0,
        isUser: false,
        dim: false,
      },
    ];
    subtitle = `Starting balance ${formatGBP(startPence)} · BTC/GBP ${formatGBP(snap.end_price_pence)} on Mar 31, 2023`;
  } else if (scenarioOrder === 2) {
    // Luna Collapse
    rows = [
      {
        label: "Stayed in cash throughout",
        pence: ref.all_cash_pence ?? startPence,
        isUser: false,
        dim: true,
      },
      { label: "You", pence: userFinalPence, isUser: true, dim: false },
      {
        label: "Sold at UST depeg signal (May 9)",
        pence: ref.sold_at_signal_pence ?? 0,
        isUser: false,
        dim: false,
      },
      {
        label: "Bought peak, held to end",
        pence: ref.held_to_end_pence ?? 0,
        isUser: false,
        dim: false,
      },
    ];
    subtitle = `Starting balance ${formatGBP(startPence)} · LUNA/GBP end price ${formatGBP(snap.end_price_pence)}`;
  } else if (scenarioOrder === 5) {
    // GFC 2008
    rows = [
      { label: "Stayed in cash", pence: ref.all_cash_pence ?? startPence, isUser: false, dim: true },
      { label: "You", pence: userFinalPence, isUser: true, dim: false },
      { label: "All FTSE 100 at start, held", pence: ref.all_ftse_pence ?? 0, isUser: false, dim: false },
      { label: "All gold at start, held", pence: ref.all_gold_pence ?? 0, isUser: false, dim: false },
      { label: "Optimal: 50% gold / 30% gilts / 20% cash", pence: ref.optimal_pence ?? 0, isUser: false, dim: false },
      { label: "All RBS at start, held", pence: ref.all_rbs_pence ?? 0, isUser: false, dim: false },
    ];
    subtitle = `Starting ${formatGBP(startPence)} · Jun 1, 2009 closing prices`;
  } else {
    // COVID Crash (Scenario 1)
    rows = [
      {
        label: "Did nothing (all cash)",
        pence: ref.all_cash_pence ?? startPence,
        isUser: false,
        dim: true,
      },
      { label: "You", pence: userFinalPence, isUser: true, dim: false },
      {
        label: "Bought Feb 2020, held",
        pence: ref.bought_round_1_pence ?? 0,
        isUser: false,
        dim: false,
      },
      {
        label: "Bought March crash, held",
        pence: ref.bought_round_2_pence ?? 0,
        isUser: false,
        dim: false,
      },
    ];
    subtitle = `What ${formatGBP(startPence)} invested at each point is worth on 31 Dec 2020 · BTC/GBP ${formatGBP(snap.end_price_pence)}`;
  }

  const maxPence = Math.max(...rows.map((r) => r.pence));

  return (
    <div className="cc-complete-section">
      <h2 className="cc-complete-section-title">How You Compare</h2>
      <p className="cc-complete-section-sub">{subtitle}</p>
      <div className="cc-outcomes-list">
        {rows.map((row) => {
          const barPct = maxPence > 0 ? (row.pence / maxPence) * 100 : 0;
          const returnPct = startPence > 0
            ? ((row.pence - startPence) / startPence) * 100
            : 0;
          const isUp = row.pence >= startPence;
          return (
            <div
              key={row.label}
              className={`cc-outcome-row ${row.isUser ? "cc-outcome-row--user" : ""} ${row.dim ? "cc-outcome-row--dim" : ""}`}
            >
              <div className="cc-outcome-meta">
                <span className="cc-outcome-label">{row.isUser ? "▶ You" : row.label}</span>
                <span className="cc-outcome-value">{formatGBP(row.pence)}</span>
                <span className={`cc-outcome-return ${isUp ? "is-up" : "is-down"}`}>
                  {returnPct >= 0 ? "+" : ""}{returnPct.toFixed(0)}%
                </span>
              </div>
              <div className="cc-outcome-bar-track">
                <div
                  className={`cc-outcome-bar ${row.isUser ? "cc-outcome-bar--user" : ""}`}
                  style={{ width: `${barPct.toFixed(1)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Lesson narrative card ─────────────────────────────────────────────────────

function NarrativeCard({ snap }: { snap: CrashFinalSnapshot }) {
  const { narrative, pattern_key } = snap;
  const patternLabel = PATTERN_LABELS[pattern_key] ?? pattern_key;
  const patternEmoji = PATTERN_EMOJI[pattern_key] ?? "📊";

  return (
    <div className="cc-complete-section">
      <h2 className="cc-complete-section-title">Your Investor Profile</h2>
      <div className="cc-narrative-card">
        <div className="cc-narrative-pattern-badge">
          <span className="cc-narrative-emoji" aria-hidden="true">{patternEmoji}</span>
          <span className="cc-narrative-pattern-label">{patternLabel}</span>
        </div>

        {narrative ? (
          <>
            <h3 className="cc-narrative-headline">{narrative.headline}</h3>
            <div className="cc-narrative-body">
              {narrative.body.split(". ").reduce<string[]>((acc, sentence, i, arr) => {
                // Rejoin into sensible paragraphs (~3 sentences each)
                const chunkIdx = Math.floor(i / 3);
                if (!acc[chunkIdx]) acc[chunkIdx] = "";
                acc[chunkIdx] += sentence + (i < arr.length - 1 ? ". " : "");
                return acc;
              }, []).map((para, i) => (
                <p key={i} className="cc-narrative-para">{para.trim()}</p>
              ))}
            </div>
            <blockquote className="cc-narrative-takeaway">
              <span className="cc-narrative-takeaway-pin" aria-hidden="true">📌</span>
              {narrative.takeaway}
            </blockquote>
          </>
        ) : (
          <p className="cc-narrative-para cc-narrative-para--empty">
            No narrative available for this pattern.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Round-by-round decision recap ─────────────────────────────────────────────

/** Format integer shares (repurposed satoshi field) as "N share(s)" */
function formatShares(n: number): string {
  return `${n} share${n !== 1 ? "s" : ""}`;
}

/** Map a broker_choice key to a readable label */
function brokerLabel(choice: string): string {
  if (choice === "trading_forge")   return "Trading Forge (commission-free, 2× margin)";
  if (choice === "highford_latham") return "Highford & Latham (£11.95/trade, no margin)";
  return choice;
}

function DecisionRecap({
  actionLog,
  scenarioOrder,
  assetSymbol,
}: {
  actionLog: CrashActionLogEntry[];
  scenarioOrder: number;
  assetSymbol: string;
}) {
  const dateLookup  = ROUND_DATE_LABELS[scenarioOrder]  ?? ROUND_DATE_LABELS[1];
  const priceLookup = ROUND_PRICE_LABELS[scenarioOrder] ?? ROUND_PRICE_LABELS[1];
  const isStock     = scenarioOrder === 4;
  const isGFC       = scenarioOrder === 5;

  // S4: broker was selected at round_index=-1; show it above the round list
  const brokerSelectEntry = isStock
    ? actionLog.find((e) => e.action === "broker_select")
    : null;

  // S4 verb/detail helper
  function stockVerb(action: string): string {
    switch (action) {
      case "buy":                     return "Bought";
      case "buy_margin":              return "Bought (2× margin)";
      case "sell":                    return "Sold";
      case "commission_paid":         return "Commission charged";
      case "margin_interest":         return "Margin interest";
      case "pco_imposed":             return "PCO restriction imposed";
      case "margin_call_liquidation": return "Margin call — position liquidated";
      default:                        return action;
    }
  }

  function stockDetail(t: CrashActionLogEntry): string {
    switch (t.action) {
      case "buy":
      case "buy_margin":
        return `${formatGBP(t.amount_pence)} → ${formatShares(t.btc_quantity_satoshis)}`;
      case "sell":
        return `${formatShares(t.btc_quantity_satoshis)} → ${formatGBP(t.amount_pence)}`;
      case "commission_paid":
        return `−${formatGBP(t.amount_pence)}`;
      case "margin_interest":
        return `−${formatGBP(t.amount_pence)}`;
      case "pco_imposed":
        return "Buy button disabled — sells only";
      case "margin_call_liquidation":
        return `${formatShares(t.btc_quantity_satoshis)} sold · received ${formatGBP(t.amount_pence)}`;
      default:
        return "";
    }
  }

  function stockActionClass(action: string): string {
    switch (action) {
      case "buy":
      case "buy_margin":              return "cc-recap-trade--buy";
      case "sell":                    return "cc-recap-trade--sell";
      case "commission_paid":
      case "margin_interest":         return "cc-recap-trade--cost";
      case "pco_imposed":             return "cc-recap-trade--warning";
      case "margin_call_liquidation": return "cc-recap-trade--danger";
      default:                        return "";
    }
  }

  return (
    <div className="cc-complete-section">
      <h2 className="cc-complete-section-title">Your Decisions</h2>

      {/* S4: broker selection banner */}
      {brokerSelectEntry && (
        <div className="cc-recap-broker-banner">
          <span className="cc-recap-broker-label">Broker chosen:</span>
          <span className="cc-recap-broker-value">
            {brokerLabel(brokerSelectEntry.broker ?? "")}
          </span>
        </div>
      )}

      <div className="cc-recap-list">
        {(isGFC ? [0, 1, 2, 3, 4, 5] : [0, 1, 2, 3, 4]).map((idx) => {
          // Exclude broker_select (round_index=-1) from per-round display
          const trades = actionLog.filter(
            (e) => e.round_index === idx && e.action !== "broker_select"
          );

          // For non-stock, further filter to only user-visible actions
          const visibleTrades = isStock
            ? trades
            : trades.filter((e) =>
                ["buy", "sell", "sell_self", "move_to_cold", "move_to_ftx",
                 "ftx_yield", "ftx_loss"].includes(e.action)
              );

          return (
            <div key={idx} className="cc-recap-round">
              <div className="cc-recap-round-header">
                <span className="cc-recap-round-num">Round {idx + 1}</span>
                <span className="cc-recap-round-date">{dateLookup[idx]}</span>
                <span className="cc-recap-round-price">{priceLookup[idx]}</span>
              </div>
              {visibleTrades.length === 0 ? (
                <p className="cc-recap-no-trades">No trades — held position</p>
              ) : (
                <ul className="cc-recap-trades">
                  {visibleTrades.map((t, i) => {
                    let verb: string;
                    let detail: string;
                    let actionClass: string;

                    if (isGFC) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      const tAny = t as any;
                      const asset = tAny.asset ?? '';
                      verb = t.action === 'buy' ? 'Bought' : t.action === 'sell' ? 'Sold' : t.action;
                      detail = t.action === 'buy'
                        ? `${formatGBP(t.amount_pence)} → ${tAny.units_acquired ?? 0} ${asset}`
                        : t.action === 'sell'
                        ? `${tAny.units_sold ?? 0} ${asset} → ${formatGBP(t.amount_pence)}`
                        : '';
                      actionClass = `cc-recap-trade--${t.action}`;
                    } else if (isStock) {
                      verb        = stockVerb(t.action);
                      detail      = stockDetail(t);
                      actionClass = stockActionClass(t.action);
                    } else {
                      const isBuy     = t.action === "buy";
                      const isSell    = t.action === "sell" || t.action === "sell_self";
                      const isToCold  = t.action === "move_to_cold";
                      const isToFtx   = t.action === "move_to_ftx";
                      const isYield   = t.action === "ftx_yield";
                      const isFtxLoss = t.action === "ftx_loss";

                      verb =
                        isBuy     ? "Bought" :
                        isSell    ? (t.action === "sell_self" ? "Sold (wallet)" : "Sold (FTX)") :
                        isToCold  ? "→ Cold wallet" :
                        isToFtx   ? "→ FTX" :
                        isYield   ? "Yield credited" :
                        isFtxLoss ? "Lost on FTX" :
                        t.action;

                      detail =
                        isBuy    ? `${formatGBP(t.amount_pence)} → ${formatAsset(t.btc_quantity_satoshis, assetSymbol)}` :
                        isSell   ? `${formatAsset(t.btc_quantity_satoshis, assetSymbol)} → ${formatGBP(t.amount_pence)}` :
                        (isToCold || isToFtx) ? `${formatAsset(t.btc_quantity_satoshis, assetSymbol)}` :
                        isYield   ? `+${formatAsset(t.btc_quantity_satoshis, assetSymbol)}` :
                        isFtxLoss ? `${formatAsset(Math.abs(t.btc_quantity_satoshis), assetSymbol)} wiped` :
                        "";

                      actionClass = `cc-recap-trade--${t.action}`;
                    }

                    return (
                      <li key={i} className={`cc-recap-trade ${actionClass}`}>
                        <span className="cc-recap-trade-verb">{verb}</span>
                        <span className="cc-recap-trade-detail">{detail}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface ScenarioCompleteProps {
  attempt: CrashAttempt;
  onBack: () => void;
  onPlayAgain: () => void;
  isRestarting: boolean;
}

export function ScenarioComplete({
  attempt,
  onBack,
  onPlayAgain,
  isRestarting,
}: ScenarioCompleteProps) {
  const snap = attempt.final_state_snapshot!;
  const { final_state } = snap;
  const isUp = final_state.total_delta_pence >= 0;
  const scenarioOrder = attempt.scenario.order;
  const assetSymbol   = attempt.scenario.asset_symbol;
  const endDateLabel  = SCENARIO_END_DATE[scenarioOrder] ?? "Scenario End";

  return (
    <div className="cc-complete-wrap">
      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="cc-complete-header">
        <button className="cc-player-back" onClick={onBack} type="button">
          ← Lobby
        </button>
        <div className="cc-complete-header-center">
          <span className="cc-player-scenario-title">{attempt.scenario.title}</span>
          <span className="cc-complete-badge">COMPLETE</span>
        </div>
        <span className="cc-player-date">{endDateLabel}</span>
      </div>

      {/* ── Scrollable body ─────────────────────────────────────── */}
      <div className="cc-complete-body">

        {/* ── Hero result card ──────────────────────────────────── */}
        <div className="cc-complete-hero">
          <p className="cc-complete-hero-label">Your Final Portfolio</p>
          <p className="cc-complete-hero-value">{formatGBP(final_state.total_value_pence)}</p>
          <p className={`cc-complete-hero-delta ${isUp ? "is-up" : "is-down"}`}>
            {formatGBPDelta(final_state.total_delta_pence)}{" "}
            ({formatPercentDelta(final_state.total_delta_basis_pts)})
          </p>
          <p className="cc-complete-hero-sub">
            Started with {formatGBP(final_state.starting_balance_pence)} ·{" "}
            {assetSymbol} at {formatGBP(snap.end_price_pence)} on {endDateLabel}
          </p>
        </div>

        {/* ── Reference outcomes comparison ──────────────────────── */}
        <OutcomesComparison
          snap={snap}
          userFinalPence={final_state.total_value_pence}
          scenarioOrder={scenarioOrder}
        />

        {/* ── Narrative / lesson card ────────────────────────────── */}
        <NarrativeCard snap={snap} />

        {/* ── Decision recap ─────────────────────────────────────── */}
        <DecisionRecap
          actionLog={attempt.action_log}
          scenarioOrder={scenarioOrder}
          assetSymbol={assetSymbol}
        />

        {/* ── Actions ───────────────────────────────────────────── */}
        <div className="cc-complete-actions">
          <button
            className="cc-btn cc-btn--ghost"
            onClick={onBack}
            type="button"
          >
            ← Back to Lobby
          </button>
          <button
            className="cc-btn cc-btn--primary cc-btn--lg"
            onClick={onPlayAgain}
            disabled={isRestarting}
            type="button"
          >
            {isRestarting ? "Starting…" : "Play Again"}
          </button>
        </div>

      </div>
    </div>
  );
}
