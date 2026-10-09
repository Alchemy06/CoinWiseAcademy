import type { RuleEntry } from "../types";

interface RuleListProps {
  rules: RuleEntry[];
}

export function RuleList({ rules }: RuleListProps) {
  return (
    <ul className="ct-rules">
      {rules.map((r) => (
        <li key={r.number} className="ct-rule">
          <span className="ct-rule-text">
            {/* Keep the emphasized fragment inline so each takeaway still reads as one sentence instead of a detached label/value pair. */}
            <strong>{r.bold}</strong> {r.text}
          </span>
        </li>
      ))}
    </ul>
  );
}
