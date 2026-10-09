import type { CrashStage } from "../types";
import { useI18n } from "../../../i18n/provider";

interface TimelineBarProps {
  stages: CrashStage[];
  activeIndex: number;
  isComplete: boolean;
  onJump: (i: number) => void;
}

export function TimelineBar({ stages, activeIndex, isComplete, onJump }: TimelineBarProps) {
  const { tx } = useI18n();
  // Fill tracks the furthest visited point, but still needs a full-width fallback for one-stage and completed states.
  const fillPct = isComplete
    ? 100
    : stages.length <= 1
      ? 100
      : (activeIndex / (stages.length - 1)) * 100;
  const lastIndex = stages.length - 1;

  return (
    <div className={`ct-timeline ${isComplete ? "is-complete" : ""}`}>
      <div className="ct-timeline-track" aria-hidden="true">
        <div className="ct-timeline-track-bg" />
        <div className="ct-timeline-track-fill" style={{ width: `${fillPct}%` }} />
      </div>
      <div className="ct-timeline-steps">
        {stages.map((s, i) => {
          // Completed mode promotes every visited step into the passed state so the bar reads like one finished sequence.
          const active = !isComplete && i === activeIndex;
          const passed = isComplete || i < activeIndex;
          const leftPct = lastIndex <= 0 ? 0 : (i / lastIndex) * 100;
          // First and last labels need separate anchoring so long captions stay inside the rail instead of overflowing outward.
          const anchorClass = i === 0 ? "is-start" : i === lastIndex ? "is-end" : "is-middle";
          return (
            <button
              key={s.number}
              className={`ct-timeline-step ${anchorClass} ${active ? "is-active" : ""} ${passed ? "is-passed" : ""}`}
              onClick={() => onJump(i)}
              aria-label={tx("Jump to stage {number}: {title}", { number: s.number, title: s.title })}
              style={{ left: `${leftPct}%` }}
            >
              <span className="ct-timeline-step-marker" aria-hidden="true">
                <span className="ct-timeline-step-dot">
                  <span className="ct-timeline-step-dot-core" />
                </span>
              </span>
              <span className="ct-timeline-step-date">{s.dateRange.split(/[-–]/)[0].trim()}</span>
              <span className="ct-timeline-step-title">{s.title}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
