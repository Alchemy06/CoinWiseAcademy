import type { ScenarioChoice } from "../../types/trading";

interface ChoiceButtonProps {
  choice: ScenarioChoice;
  onSelect: (choiceId: number) => void;
  disabled?: boolean;
  index: number;
}

export function ChoiceButton({ choice, onSelect, disabled, index }: ChoiceButtonProps) {
  const letters = ["A", "B", "C", "D"];
  const letter = letters[index] ?? String(index + 1);

  return (
    <button
      className="tf-choice-btn"
      disabled={disabled}
      onClick={() => onSelect(choice.id)}
      title={choice.tooltip || undefined}
      type="button"
    >
      <span className="tf-choice-letter">{letter}</span>
      <span className="tf-choice-body">
        <span className="tf-choice-label">{choice.label}</span>
        {choice.emotional_framing && (
          <span className="tf-choice-framing">{choice.emotional_framing}</span>
        )}
      </span>
      {choice.tooltip ? (
        <span className="tf-choice-tooltip" aria-hidden="true">
          ℹ
        </span>
      ) : null}
    </button>
  );
}
