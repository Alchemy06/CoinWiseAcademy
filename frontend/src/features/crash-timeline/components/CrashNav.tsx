import type { CrashScenario } from "../types";

interface CrashNavProps {
  crashes: CrashScenario[];
  activeId: string;
  onSelect: (id: string) => void;
}

export function CrashNav({ crashes, activeId, onSelect }: CrashNavProps) {
  return (
    <div className="ct-nav" role="tablist">
      {crashes.map((c) => {
        // The nav is modeled as tabs so keyboard and screen-reader users can treat each crash as one alternate timeline view.
        const isActive = c.id === activeId;
        return (
          <button
            key={c.id}
            role="tab"
            aria-selected={isActive}
            className={`ct-nav-tab ${isActive ? "is-active" : ""}`}
            onClick={() => onSelect(c.id)}
          >
            <span className="ct-nav-label">{c.navLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
