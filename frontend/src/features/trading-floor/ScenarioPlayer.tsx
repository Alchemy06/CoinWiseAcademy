import { useCallback, useState } from "react";
import type { ChoiceRecord, TradingAttempt } from "../../types/trading";
import { makeChoice } from "../../utils/tradingFloor";
import { ConsequenceScreen } from "./ConsequenceScreen";
import { LessonCard } from "./LessonCard";
import { TradingTerminal } from "./TradingTerminal";

interface ScenarioPlayerProps {
  attempt: TradingAttempt;
  scenarioAccentColor?: string;
  scenarioVolatilityProfile?: string;
  onAttemptUpdate: (updated: TradingAttempt) => void;
  onRestart: () => void;
  onBack: () => void;
}

type ViewState = "trading" | "consequence" | "complete";

// ── News Ticker ────────────────────────────────────────────────────────────────
function NewsTicker({ text }: { text: string }) {
  if (!text) return null;
  return (
    <div className="tf-ticker-wrap" aria-label="Market news">
      <span className="tf-ticker-track">{text}</span>
    </div>
  );
}

// ── Mood Meter ─────────────────────────────────────────────────────────────────
function MoodMeter({ position, label }: { position: number; label: string }) {
  const clamp = Math.max(0, Math.min(100, position));
  return (
    <div className="tf-mood-card">
      <p className="tf-mood-card-heading">MARKET MOOD</p>
      <p className="tf-mood-sentiment">{label || "Neutral"}</p>
      <div className="tf-mood-labels">
        <span className="tf-mood-label-left">FEAR</span>
        <span className="tf-mood-label-right">GREED</span>
      </div>
      <div className="tf-mood-bar-wrap">
        <div className="tf-mood-dot" style={{ left: `${clamp}%` }} />
      </div>
    </div>
  );
}

// ── Round indicator ────────────────────────────────────────────────────────────
function RoundIndicator({
  current,
  total,
}: {
  current: number;
  total: number;
}) {
  return (
    <div className="tf-round-indicator">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className={[
            "tf-round-pip",
            i + 1 < current ? "is-done" : "",
            i + 1 === current ? "is-current" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        />
      ))}
      <span className="tf-round-label">
        Round {current} of {total}
      </span>
    </div>
  );
}

// ── Back-to-lobby confirm ──────────────────────────────────────────────────────
function BackConfirmModal({
  onStay,
  onLeave,
}: {
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <div className="tf-confirm-backdrop" role="dialog" aria-modal="true">
      <div className="tf-confirm-card">
        <h3 className="tf-confirm-title">Leave this scenario?</h3>
        <p className="tf-confirm-hint">Your progress will not be saved.</p>
        <div className="tf-confirm-actions">
          <button className="tf-btn tf-btn--primary" onClick={onStay} type="button">
            Stay
          </button>
          <button className="tf-btn tf-btn--ghost" onClick={onLeave} type="button">
            Leave
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ScenarioPlayer ────────────────────────────────────────────────────────
export function ScenarioPlayer({
  attempt,
  scenarioAccentColor = "#0052ff",
  scenarioVolatilityProfile = "normal",
  onAttemptUpdate,
  onRestart,
  onBack,
}: ScenarioPlayerProps) {
  const [viewState, setViewState] = useState<ViewState>("trading");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRecord, setLastRecord] = useState<ChoiceRecord | null>(null);
  const [consequenceAttempt, setConsequenceAttempt] = useState<TradingAttempt | null>(null);
  const [showBackConfirm, setShowBackConfirm] = useState(false);

  const currency = attempt.scenario_currency || "GBP";
  const node = attempt.current_node;
  const initialBalance = parseFloat(attempt.initial_balance);
  const currentBalance = parseFloat(attempt.current_balance);

  const roundNumber = node?.round_number ?? 1;
  const totalRounds = attempt.total_rounds ?? 3;

  const handleSubmitChoice = useCallback(
    async (choiceId: number, amount?: number) => {
      if (isSubmitting) return;
      setIsSubmitting(true);
      setError(null);

      try {
        const updated = await makeChoice(attempt.id, choiceId, amount);

        // Get the record that was just added
        const record = updated.choices_made[updated.choices_made.length - 1];
        setLastRecord(record ?? null);
        setConsequenceAttempt(updated);
        setViewState("consequence");
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Something went wrong.");
      } finally {
        setIsSubmitting(false);
      }
    },
    [attempt.id, isSubmitting],
  );

  const handleConsequenceContinue = useCallback(() => {
    if (!consequenceAttempt) return;

    const isComplete = consequenceAttempt.completed_at !== null;

    if (isComplete) {
      // Update parent state and switch to lesson card
      onAttemptUpdate(consequenceAttempt);
      setViewState("complete");
    } else {
      // Advance to next round
      onAttemptUpdate(consequenceAttempt);
      setViewState("trading");
    }
  }, [consequenceAttempt, onAttemptUpdate]);

  // ── Lesson card (full screen) ─────────────────────────────────────────────
  if (viewState === "complete") {
    const lessonAttempt = consequenceAttempt ?? attempt;
    const lessonNode = lessonAttempt.current_node;
    if (lessonNode) {
      return (
        <LessonCard
          node={lessonNode}
          attempt={lessonAttempt}
          accentColor={scenarioAccentColor}
          onRestart={onRestart}
          onBack={onBack}
        />
      );
    }
  }

  if (!node) {
    return (
      <div className="tf-player-error">
        <p>No scenario node found. Please restart.</p>
        <button className="tf-btn tf-btn--ghost" onClick={onBack} type="button">
          ← Back
        </button>
      </div>
    );
  }

  const isR1 = node.round_number === 1;

  return (
    <div className="tf-player-layout">
      {/* ── Left sidebar ─────────────────────────────────────────── */}
      <aside className="tf-sidebar">
        {/* Back link */}
        <button
          className="tf-sidebar-back"
          onClick={() => setShowBackConfirm(true)}
          type="button"
        >
          ← Back to Lobby
        </button>

        {/* Scenario meta */}
        <div className="tf-sidebar-meta">
          <RoundIndicator current={roundNumber} total={totalRounds} />
        </div>

        {/* Situation card */}
        <div className="tf-situation-card">
          <div className="tf-situation-header">
            <span className="tf-situation-icon" aria-hidden="true">📢</span>
            <span className="tf-situation-label">THE SITUATION</span>
          </div>
          <div className="tf-situation-body">
            {node.narrative_text.split("\n\n").map((para, i) => (
              <p key={i} className="tf-situation-para">
                {para}
              </p>
            ))}
          </div>
          <p className="tf-situation-cta">What will you do?</p>
        </div>

        {/* Mood meter */}
        {node.market_sentiment && (
          <MoodMeter
            position={node.sentiment_position}
            label={node.market_sentiment}
          />
        )}

        {/* Tip */}
        <p className="tf-sidebar-tip">
          💡 Decisions have consequences. There's no single 'right' answer — only different outcomes.
        </p>
      </aside>

      {/* ── Right terminal area ───────────────────────────────────── */}
      <section className="tf-terminal-area">
        {/* News ticker — Round 1 only */}
        {isR1 && node.news_ticker_text && (
          <NewsTicker text={node.news_ticker_text} />
        )}

        {/* Balance strip (top right) */}
        <div className="tf-terminal-balance-strip">
          <span className="tf-terminal-balance-label">Virtual Wallet</span>
          <span className="tf-terminal-balance-value">
            {currentBalance.toLocaleString("en-GB", {
              style: "currency",
              currency,
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          {currentBalance !== initialBalance && (
            <span
              className={`tf-terminal-balance-delta ${currentBalance > initialBalance ? "is-up" : "is-down"}`}
            >
              {currentBalance > initialBalance ? "▲" : "▼"}
              {Math.abs(currentBalance - initialBalance).toLocaleString("en-GB", {
                style: "currency",
                currency,
                minimumFractionDigits: 0,
                maximumFractionDigits: 0,
              })}
            </span>
          )}
        </div>

        {/* Trading terminal or consequence screen */}
        {viewState === "consequence" && lastRecord && consequenceAttempt ? (
          <ConsequenceScreen
            record={lastRecord}
            node={consequenceAttempt.current_node}
            currency={currency}
            currentBalance={parseFloat(consequenceAttempt.current_balance)}
            initialBalance={initialBalance}
            onContinue={handleConsequenceContinue}
          />
        ) : (
          <TradingTerminal
            node={node}
            attempt={attempt}
            volatilityProfile={scenarioVolatilityProfile}
            onSubmitChoice={handleSubmitChoice}
            isSubmitting={isSubmitting}
          />
        )}

        {error && <p className="tf-player-error-msg">{error}</p>}
      </section>

      {/* Back confirm modal */}
      {showBackConfirm && (
        <BackConfirmModal
          onStay={() => setShowBackConfirm(false)}
          onLeave={onBack}
        />
      )}
    </div>
  );
}
