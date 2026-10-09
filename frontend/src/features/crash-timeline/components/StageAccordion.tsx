import type { CrashStage } from "../types";
import { IconTarget } from "../../../components/icons";
import { Fragment } from "react";
import { useI18n } from "../../../i18n/provider";

interface StageAccordionProps {
  stages: CrashStage[];
  openIndex: number;
  setOpenIndex: (i: number) => void;
  itemRefs: React.MutableRefObject<(HTMLElement | null)[]>;
}

function getStageSummary(stage: CrashStage): string {
  // The table keeps one-scan density, so only the opening paragraph is surfaced before the learner expands for full detail.
  return stage.narrative.split("\n\n")[0] ?? stage.narrative;
}

export function StageAccordion({ stages, openIndex, setOpenIndex, itemRefs }: StageAccordionProps) {
  const { tx } = useI18n();
  return (
    <div className="ct-stage-table-wrap">
      <table className="ct-stage-table">
        <colgroup>
          <col className="ct-stage-col-step" />
          <col className="ct-stage-col-moment" />
          <col className="ct-stage-col-window" />
          <col className="ct-stage-col-keydate" />
          <col className="ct-stage-col-action" />
        </colgroup>
        <thead>
          <tr>
            <th>{tx("Step")}</th>
            <th>{tx("Moment")}</th>
            <th>{tx("Window")}</th>
            <th>{tx("Key date")}</th>
            <th aria-hidden="true" className="ct-stage-action-head" />
          </tr>
        </thead>
        <tbody>
          {stages.map((stage, i) => {
            const isOpen = i === openIndex;
            // Pair each summary row with its detail row so assistive tech can follow one explicit expand/collapse relationship.
            const detailId = `ct-stage-detail-${stage.number}`;
            return (
              <Fragment key={stage.number}>
                <tr
                  ref={(el) => {
                    itemRefs.current[i] = el;
                  }}
                  className={`ct-stage-row ${isOpen ? "is-open" : ""}`}
                >
                  <th scope="row">
                    <span className="ct-stage-num">{stage.number}</span>
                  </th>
                  <td>
                    <button
                      type="button"
                      className="ct-stage-title-trigger"
                      onClick={() => setOpenIndex(isOpen ? -1 : i)}
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      aria-label={tx("{number} {title}", { number: stage.number, title: stage.title })}
                    >
                      <span className="ct-stage-title">{stage.title}</span>
                    </button>
                  </td>
                  <td className="ct-stage-date">{stage.dateRange}</td>
                  <td className="ct-stage-keydate">{stage.timestamp.date}</td>
                  <td className="ct-stage-action-cell">
                    <button
                      type="button"
                      className="ct-stage-trigger"
                      onClick={() => setOpenIndex(isOpen ? -1 : i)}
                      aria-expanded={isOpen}
                      aria-controls={detailId}
                      aria-label={tx("{action} stage {number}: {title}", {
                        action: isOpen ? tx("Collapse") : tx("Expand"),
                        number: stage.number,
                        title: stage.title,
                      })}
                    >
                      <span className={`ct-stage-chev ${isOpen ? "is-open" : ""}`} aria-hidden="true">
                        ▾
                      </span>
                    </button>
                  </td>
                </tr>
                {isOpen && (
                  <tr className="ct-stage-detail-row" id={detailId}>
                    <td colSpan={5}>
                      <div className="ct-stage-body">
                        <p className="ct-stage-para">{getStageSummary(stage)}</p>
                        <div className="ct-stage-timestamp">
                          <span className="ct-stage-timestamp-pin" aria-hidden="true">
                            <IconTarget size={14} stroke={1.8} />
                          </span>
                          <div>
                            <div className="ct-stage-timestamp-context">{stage.timestamp.context}</div>
                          </div>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
