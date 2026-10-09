import type { CrashScenario } from "../types";
import { useI18n } from "../../../i18n/provider";

interface DropStatCardProps {
  crash: CrashScenario;
}

export function DropStatCard({ crash }: DropStatCardProps) {
  const { tx } = useI18n();
  // Negative drops need a stronger treatment because they are the one stat that should read as the focal loss number at a glance.
  const isNegativeDrop = crash.dropPercent.trim().startsWith("-");

  return (
    <div className="ct-drop-card">
      <div className="ct-drop-heading">
        <p className="ct-drop-kicker">{crash.asset}</p>
        <h2>{crash.title}</h2>
        <p>{crash.subtitle}</p>
      </div>
      <div className="ct-drop-facts" aria-label={tx("{title} summary", { title: crash.title })}>
        <div className="ct-drop-fact">
          <span>{tx("Peak to low")}</span>
          <strong className={isNegativeDrop ? "is-negative" : undefined}>{crash.dropPercent}</strong>
        </div>
        <div className="ct-drop-fact">
          <span>{tx("Range")}</span>
          <strong>{crash.priceRange}</strong>
        </div>
        <div className="ct-drop-fact">
          <span>{tx("Window")}</span>
          <strong>{crash.dateRangeLabel}</strong>
        </div>
        {crash.recoveryPill ? (
          <div className={`ct-drop-fact ct-drop-fact--pill is-${crash.recoveryPill.type}`}>
            <span>{tx("Aftermath")}</span>
            <strong>{crash.recoveryPill.text}</strong>
          </div>
        ) : null}
      </div>
    </div>
  );
}
