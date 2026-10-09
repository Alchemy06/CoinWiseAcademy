import type { ConsequenceScenario } from "../types";

interface ConsequenceGridProps {
  scenarios: ConsequenceScenario[];
  summary: string;
}

export function ConsequenceGrid({ scenarios, summary }: ConsequenceGridProps) {
  return (
    <div>
      <div className="ct-consequence-grid">
        {scenarios.map((s, i) => (
          <div key={i} className={`ct-consequence is-${s.type}`}>
            <div className="ct-consequence-label">{s.label}</div>
            <div className="ct-consequence-value">{s.value}</div>
            {s.caption && <div className="ct-consequence-caption">{s.caption}</div>}
          </div>
        ))}
      </div>
      <p className="ct-consequence-summary">{summary}</p>
    </div>
  );
}
