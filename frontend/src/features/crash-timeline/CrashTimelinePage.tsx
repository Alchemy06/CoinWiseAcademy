import { useEffect, useMemo, useRef, useState } from "react";
import { CRASHES } from "./crashData";
import { CrashNav } from "./components/CrashNav";
import { DropStatCard } from "./components/DropStatCard";
import { TimelineBar } from "./components/TimelineBar";
import { StageAccordion } from "./components/StageAccordion";
import { SectionCard } from "./components/SectionCard";
import { RuleList } from "./components/RuleList";
import { ProceedButtons } from "./components/ProceedButtons";
import { useI18n } from "../../i18n/provider";
import type { CrashScenario } from "./types";

function getFirstParagraph(text: string): string {
  // The summary cards are intentionally terse, so trim each long analysis block down to the lead takeaway.
  return text.split("\n\n")[0] ?? text;
}

export function CrashTimelinePage() {
  const { tx } = useI18n();
  const crashes = useMemo<CrashScenario[]>(
    // Translate the static crash dataset once per locale while preserving ids, ordering, and navigation structure.
    () =>
      CRASHES.map((crash) => ({
        ...crash,
        navLabel: tx(crash.navLabel),
        title: tx(crash.title),
        subtitle: tx(crash.subtitle),
        asset: tx(crash.asset),
        dateRangeLabel: tx(crash.dateRangeLabel),
        openingQuote: tx(crash.openingQuote),
        timeframe: tx(crash.timeframe),
        recoveryPill: crash.recoveryPill
          ? {
              ...crash.recoveryPill,
              text: tx(crash.recoveryPill.text),
            }
          : null,
        stages: crash.stages.map((stage) => ({
          ...stage,
          title: tx(stage.title),
          dateRange: tx(stage.dateRange),
          narrative: tx(stage.narrative),
          timestamp: {
            date: tx(stage.timestamp.date),
            context: tx(stage.timestamp.context),
          },
        })),
        whatWentWrong: tx(crash.whatWentWrong),
        whenToSell: tx(crash.whenToSell),
        consequences: {
          ...crash.consequences,
          scenarios: crash.consequences.scenarios.map((scenario) => ({
            ...scenario,
            label: tx(scenario.label),
            value: tx(scenario.value),
            caption: scenario.caption ? tx(scenario.caption) : undefined,
          })),
          summary: tx(crash.consequences.summary),
        },
        whatToDoRight: crash.whatToDoRight.map((rule) => ({
          ...rule,
          bold: tx(rule.bold),
          text: tx(rule.text),
        })),
      })),
    [tx],
  );
  const [activeId, setActiveId] = useState<string>(CRASHES[0].id);
  const active = useMemo(
    () => crashes.find((c) => c.id === activeId) ?? crashes[0],
    [activeId, crashes],
  );

  const [openIndex, setOpenIndex] = useState<number>(0);
  const [lastViewedIndex, setLastViewedIndex] = useState<number>(0);
  useEffect(() => {
    // Each crash starts from its own first stage so switching tabs never carries over stale progress from another case.
    setOpenIndex(0);
    setLastViewedIndex(0);
  }, [active]);

  const stageRefs = useRef<(HTMLElement | null)[]>([]);

  const handleJump = (i: number) => {
    // Jumping from the top timeline should keep the accordion and progress indicator in sync before scrolling the row into view.
    setOpenIndex(i);
    setLastViewedIndex(i);
    requestAnimationFrame(() => {
      stageRefs.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  };

  const finalStageIndex = active.stages.length - 1;
  // Once the learner has opened the last stage, collapsing it should leave the timeline looking "fully traversed" instead of blank.
  const timelineIsComplete = openIndex === -1 && lastViewedIndex === finalStageIndex;
  // The top bar still needs one anchor when the accordion is collapsed, so reuse the last visited stage as the active marker.
  const timelineActiveIndex = openIndex >= 0 ? openIndex : lastViewedIndex;

  return (
    <section className="ct-page ds-page-enter" aria-labelledby="ct-page-title">
      <header className="ct-header">
        <div className="ct-header-copy">
          <h1 id="ct-page-title" className="ct-header-title">
            <span>{tx("Market crash timeline")}</span>
            <span>{tx("one event at a time")}</span>
          </h1>
          <p className="ct-header-sub">
            {tx("Pick a historical crash, open the key moment, and take away one risk lesson.")}
          </p>
        </div>
        <div aria-hidden="true" className="ct-header-divider" />
      </header>

      <CrashNav crashes={crashes} activeId={activeId} onSelect={setActiveId} />

      <div className="ct-content-stack" key={active.id}>
        <section className="ct-section-block ct-section-block--overview" aria-labelledby="ct-overview-heading">
          <div className="ct-section-headline">
            <h2 id="ct-overview-heading">{tx("Crash overview and timeline")}</h2>
          </div>

          <DropStatCard crash={active} />
          <TimelineBar
            stages={active.stages}
            activeIndex={timelineActiveIndex}
            isComplete={timelineIsComplete}
            onJump={handleJump}
          />
        </section>

        <section className="ct-section-block ct-section-block--body" aria-labelledby="ct-lessons-heading">
          <div className="ct-section-headline">
            <h2 id="ct-lessons-heading">{tx("Key moments in the crash")}</h2>
          </div>

          <div className="ct-body">
            <StageAccordion
              stages={active.stages}
              openIndex={openIndex}
              setOpenIndex={(nextIndex) => {
                setOpenIndex(nextIndex);
                if (nextIndex >= 0) {
                  setLastViewedIndex(nextIndex);
                }
              }}
              itemRefs={stageRefs}
            />
          </div>
        </section>

        <section className="ct-section-block" aria-labelledby="ct-analysis-heading">
          <div className="ct-section-headline">
            <h2 id="ct-analysis-heading">{tx("What this case shows")}</h2>
          </div>

          <div className="ct-body-analysis">
            <div className="ct-analysis-grid">
              <SectionCard variant="red" title={tx("Mistake")}>
                <p className="ct-section-para">{getFirstParagraph(active.whatWentWrong)}</p>
              </SectionCard>
              <SectionCard variant="amber" title={tx("Signal")}>
                <p className="ct-section-para">{getFirstParagraph(active.whenToSell)}</p>
              </SectionCard>
              <SectionCard variant="green" title={tx("Rule")}>
                <RuleList rules={active.whatToDoRight.slice(0, 2)} />
              </SectionCard>
            </div>
            <p className="ct-outcome-note">{active.consequences.summary}</p>
          </div>
        </section>

        <ProceedButtons crash={active} />
      </div>
    </section>
  );
}
