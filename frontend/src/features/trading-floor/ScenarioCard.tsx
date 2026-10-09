import type { TradingScenario } from "../../types/trading";

interface ScenarioCardProps {
  scenario: TradingScenario;
  onPlay: (slug: string) => void;
  isLoading?: boolean;
}

const DIFFICULTY_LABELS: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

export function ScenarioCard({ scenario, onPlay, isLoading }: ScenarioCardProps) {
  return (
    <article className="tf-scenario-card">
      {/* Accent bar using scenario's colour */}
      <div
        className="tf-scenario-card-accent"
        style={{ background: scenario.accent_color || "#0052ff" }}
        aria-hidden="true"
      />

      <header className="tf-scenario-card-head">
        <div className="tf-scenario-card-meta">
          {scenario.lesson_tag && (
            <span className="tf-scenario-tag">{scenario.lesson_tag}</span>
          )}
          {scenario.historical_date && (
            <span className="tf-scenario-date">{scenario.historical_date}</span>
          )}
        </div>
        <h3 className="tf-scenario-card-title">{scenario.title}</h3>
        {scenario.subtitle && (
          <p className="tf-scenario-card-subtitle">{scenario.subtitle}</p>
        )}
        <span className={`tf-difficulty-badge tf-difficulty-badge--${scenario.difficulty}`}>
          {DIFFICULTY_LABELS[scenario.difficulty] ?? scenario.difficulty}
        </span>
      </header>

      <button
        className="tf-btn tf-btn--primary"
        disabled={isLoading}
        onClick={() => onPlay(scenario.slug)}
        type="button"
      >
        {isLoading ? "Loading…" : "Play scenario →"}
      </button>
    </article>
  );
}
