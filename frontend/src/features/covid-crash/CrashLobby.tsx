import type { CrashScenario } from "../../types/covidCrash";
import { formatGBP } from "./lib/format";
import { useI18n } from "../../i18n/provider";
import { IconClock, IconArrowRight, IconSparkle } from "../../components/icons";

// ── Per-scenario editorial copy (from the design handoff) ─────────────────────
// Keyed by scenario.order so the visuals stay consistent if DB titles change.
// Exported so the in-scenario player (CrashScenarioPlayer) can apply the same
// editorial header treatment as the lobby card.
export type ScenarioCopy = {
  title: string;
  tier: "Beginner" | "Intermediate" | "Advanced";
  tag: string;
  body: string;
  recommended: boolean;
};

export const SCENARIO_COPY: Record<number, ScenarioCopy> = {
  1: {
    title: "The COVID Crash & Recovery",
    tier: "Intermediate",
    tag: "Crisis & Recovery",
    body:
      "Bitcoin fell 44% in a single day on March 12, 2020 (Black Thursday) as global investors sold liquid assets for cash. It then rose 441% from the low by December 31, 2020, driven by unprecedented central bank stimulus and institutional adoption.",
    recommended: true,
  },
  2: {
    title: "The Luna Collapse",
    tier: "Advanced",
    tag: "Algorithmic Collapse",
    body:
      "LUNA fell from £87 to near zero in five days in May 2022. The Terra ecosystem's $18B algorithmic stablecoin UST lost its $1 peg, triggering a death spiral that destroyed $50 billion in value. Investors who understood the circular dependency between UST and LUNA sold early. Those who did not lost everything.",
    recommended: false,
  },
  3: {
    title: "The FTX Collapse",
    tier: "Advanced",
    tag: "Counterparty Risk",
    body:
      "A leaked balance sheet, a tweet from a competitor, and a bank run. The second-largest exchange unwound in nine days. The textbook case for self-custody and counterparty risk.",
    recommended: false,
  },
  4: {
    title: "The GameStop Short Squeeze",
    tier: "Advanced",
    tag: "Reflexive Speculation",
    body:
      "Retail traders coordinating on r/wallstreetbets pushed GME from $20 to $483 in two weeks before brokers restricted buying. A live demonstration of how reflexive demand, leverage, and platform risk can compound far faster than fundamentals would suggest.",
    recommended: false,
  },
  5: {
    title: "The Great Financial Crisis",
    tier: "Advanced",
    tag: "Cross-Asset Contagion",
    body:
      "The S&P 500 fell 57% from October 2007 to March 2009 as the housing market collapsed and counterparty trust evaporated. Trade across five UK assets — equities, banks, commodities, gilts — and feel how correlations broke down when liquidity disappeared.",
    recommended: false,
  },
};

interface CrashLobbyProps {
  scenarios: CrashScenario[];
  isLoading: boolean;
  loadingId: number | null;
  error: string | null;
  onPlay: (scenarioId: number) => void;
  /** Cumulative wallet balance across all completed scenarios. */
  cumulativeBalancePence?: number;
}

export function CrashLobby({
  scenarios,
  isLoading,
  loadingId,
  error,
  onPlay,
  cumulativeBalancePence,
}: CrashLobbyProps) {
  const { tx } = useI18n();
  return (
    <div className="cc-lobby">
      <div className="cc-lobby-hero">
        <div className="cc-lobby-hero-icon" aria-hidden="true">📉</div>
        <h1 className="cc-lobby-title">{tx("Trading Scenarios")}</h1>
        <p className="cc-lobby-sub">
          {tx("Free-form trading simulator. Real historical prices.")}
          <br />
          {tx("Buy and sell across 5 decision points and discover what your instincts would have cost — or earned — you.")}
        </p>

        {cumulativeBalancePence !== undefined && (
          <div className="cc-lobby-wallet">
            <span className="cc-lobby-wallet-label">{tx("Your wallet")}</span>
            <span className="cc-lobby-wallet-value">
              {formatGBP(cumulativeBalancePence)}
            </span>
            <span className="cc-lobby-wallet-hint">{tx("carries between scenarios")}</span>
          </div>
        )}
      </div>

      {error && <p className="cc-lobby-error">{error}</p>}

      <section className="cc-scenarios-section">
        {isLoading ? (
          <div className="cc-scenarios-loading">{tx("Loading…")}</div>
        ) : scenarios.length === 0 ? (
          <div className="cc-scenarios-empty">{tx("No scenarios available.")}</div>
        ) : (
          <div className="cl-card-list">
            {scenarios.map((s) => {
              const prereq = s.recommended_prerequisite_id
                ? scenarios.find((x) => x.id === s.recommended_prerequisite_id)
                : null;
              return (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  isLoading={loadingId === s.id}
                  onPlay={onPlay}
                  prereqTitle={prereq?.title ?? null}
                />
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Scenario Card ─────────────────────────────────────────────────────────────

function ScenarioCard({
  scenario,
  isLoading,
  onPlay,
  prereqTitle,
}: {
  scenario: CrashScenario;
  isLoading: boolean;
  onPlay: (id: number) => void;
  prereqTitle: string | null;
}) {
  const { tx } = useI18n();

  // Per-scenario editorial copy from the design handoff. Falls back to DB values
  // for unknown scenarios so adding a new scenario in the DB doesn't break the lobby.
  const copy: ScenarioCopy = SCENARIO_COPY[scenario.order] ?? {
    title: scenario.title,
    tier: scenario.order <= 1 ? "Beginner" : scenario.order <= 3 ? "Intermediate" : "Advanced",
    tag: scenario.lesson_tag,
    body: scenario.subtitle,
    recommended: false,
  };

  const tierChipClass =
    copy.tier === "Advanced"
      ? "cl-chip cl-chip--neg"
      : copy.tier === "Intermediate"
      ? "cl-chip cl-chip--warn"
      : "cl-chip cl-chip--accent";

  const startingBalance = (scenario.starting_balance_pence / 100).toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  });

  return (
    <article className="cl-card">
      <div className="cl-card-eyebrow">
        {tx("Scenario")} · {scenario.asset_symbol}/GBP
      </div>

      <div className="cl-card-chips">
        <span className={tierChipClass}>{tx(copy.tier)}</span>
        <span className="cl-chip">{tx(copy.tag)}</span>
        {copy.recommended && <span className="cl-chip cl-chip--accent">{tx("Recommended")}</span>}
      </div>

      <h2 className="cl-card-title">{tx(copy.title)}</h2>
      <p className="cl-card-sub">{scenario.subtitle}</p>

      <div className="cl-card-meta">
        <IconClock size={13} stroke={1.7} />
        <span>{scenario.historical_period}</span>
      </div>

      {prereqTitle && (
        <div className="cl-card-callout">
          <span className="cl-card-callout-icon" aria-hidden="true">
            <IconSparkle size={14} stroke={1.7} />
          </span>
          <span>
            <strong>{tx("Recommended:")}</strong>{" "}
            {tx("complete {title} first", { title: prereqTitle })}
          </span>
        </div>
      )}

      <p className="cl-card-body">{tx(copy.body)}</p>

      <p className="cl-card-stat-line">
        {tx("Starting balance")}: <strong>{startingBalance}</strong>
        {" · "}
        {tx("5 decision points")}
        {" · "}
        {tx("Asset")}: <strong>{scenario.asset_symbol}</strong>
      </p>

      <div className="cl-card-footer">
        <button
          className="cl-card-btn"
          disabled={isLoading}
          onClick={() => onPlay(scenario.id)}
          type="button"
        >
          <span>{isLoading ? tx("Starting…") : tx("Start Scenario")}</span>
          {!isLoading && <IconArrowRight size={14} stroke={1.8} />}
        </button>
        <span className="cl-card-hint">
          {tx("~10 min · 5 rounds · historical pricing")}
        </span>
      </div>
    </article>
  );
}
