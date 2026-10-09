import type { OutcomeTone, ScenarioNode, TradingAttempt } from "../../types/trading";
import { BalanceDisplay } from "./BalanceDisplay";

interface LessonCardProps {
  node: ScenarioNode;
  attempt: TradingAttempt;
  accentColor?: string;
  onRestart: () => void;
  onBack: () => void;
}

function toneIcon(tone: OutcomeTone): string {
  if (tone === "positive") return "🏆";
  if (tone === "negative") return "📉";
  return "📊";
}

function fmtCurrency(n: number, currency: string): string {
  return n.toLocaleString("en-GB", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  });
}

// Lightweight markdown-ish renderer: **bold**, bullet lines, numbered lists.
function renderLesson(text: string): React.ReactNode[] {
  const lines = text.split("\n");
  const elements: React.ReactNode[] = [];

  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) {
      elements.push(<br key={`br-${i}`} />);
      return;
    }

    if (line.startsWith("- ") || line.startsWith("• ")) {
      elements.push(
        <li key={i} className="tf-lesson-li">
          {renderInline(line.slice(2))}
        </li>,
      );
      return;
    }

    const numMatch = /^(\d+)\.\s+(.*)$/.exec(line);
    if (numMatch) {
      elements.push(
        <li key={i} className="tf-lesson-li tf-lesson-li--numbered">
          <span className="tf-lesson-num">{numMatch[1]}.</span>{" "}
          {renderInline(numMatch[2])}
        </li>,
      );
      return;
    }

    elements.push(
      <p key={i} className="tf-lesson-p">
        {renderInline(line)}
      </p>,
    );
  });

  return elements;
}

function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

export function LessonCard({ node, attempt, accentColor, onRestart, onBack }: LessonCardProps) {
  const currency = attempt.scenario_currency || "GBP";
  const initial = parseFloat(attempt.initial_balance);
  const current = parseFloat(attempt.current_balance);
  const pnl = current - initial;
  const isPositive = pnl >= 0;

  // The last choice record contains the final feedback text and headline
  const lastRecord = attempt.choices_made[attempt.choices_made.length - 1];
  const finalHeadline = lastRecord?.consequence_headline || "";
  const finalFeedback = lastRecord?.feedback_text || "";

  return (
    <div className={`tf-lesson-card tone-${node.outcome_tone}`}>
      {accentColor && (
        <div className="tf-lesson-accent-bar" style={{ background: accentColor }} />
      )}
      <div className="tf-lesson-icon" aria-hidden="true">
        {toneIcon(node.outcome_tone)}
      </div>

      {/* Final choice headline */}
      {finalHeadline && (
        <p className="tf-lesson-headline">{finalHeadline}</p>
      )}

      {node.lesson_title && <h2 className="tf-lesson-title">{node.lesson_title}</h2>}

      {/* Outcome narrative (from node) */}
      <div className="tf-lesson-narrative">{node.narrative_text}</div>

      {/* Final choice feedback */}
      {finalFeedback && (
        <div className="tf-lesson-feedback">{finalFeedback}</div>
      )}

      {/* Final balance summary */}
      <div className="tf-lesson-result">
        <BalanceDisplay
          balance={current}
          initialBalance={initial}
          currency={currency}
          label="Final portfolio"
        />
        <div className={`tf-lesson-verdict ${isPositive ? "is-up" : "is-down"}`}>
          {isPositive ? "Net gain" : "Net loss"}: {isPositive ? "+" : ""}
          {fmtCurrency(pnl, currency)}
        </div>
      </div>

      {/* Lesson body */}
      {node.lesson_text && (
        <div className="tf-lesson-body">
          <h3 className="tf-lesson-body-heading">What can we learn from this?</h3>
          <div className="tf-lesson-content">{renderLesson(node.lesson_text)}</div>
        </div>
      )}

      {/* Takeaway line */}
      {node.takeaway_line && (
        <div className="tf-lesson-takeaway">
          <span className="tf-lesson-takeaway-quote">&#8220;</span>
          {node.takeaway_line}
          <span className="tf-lesson-takeaway-quote">&#8221;</span>
        </div>
      )}

      {/* Path taken */}
      {attempt.choices_made.length > 0 && (
        <div className="tf-lesson-path">
          <h4 className="tf-lesson-path-heading">Your path</h4>
          <ol className="tf-lesson-path-list">
            {attempt.choices_made.map((record, i) => (
              <li key={i} className="tf-lesson-path-item">
                {record.choice_label}
              </li>
            ))}
          </ol>
        </div>
      )}

      <div className="tf-lesson-actions">
        <button className="tf-btn tf-btn--primary" onClick={onRestart} type="button">
          Play again
        </button>
        <button className="tf-btn tf-btn--ghost" onClick={onBack} type="button">
          ← All scenarios
        </button>
      </div>
    </div>
  );
}
