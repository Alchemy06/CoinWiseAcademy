import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useI18n } from "../../i18n/provider";
import type { LearnCatalogResponse, LearnLevel, LearnTrack, LearnUnit } from "../../types/learn";
import { fetchLearnCatalog, fetchLearnProgress, markLearnUnitDone } from "../../utils/learn";
import { fetchQuizPath } from "../../utils/quiz";
import { LessonRichText } from "./LessonRichText";

// Keep learn ordering aligned with the staged quiz progression so hub indexes stay globally readable.
const LEVEL_ORDER: LearnLevel[] = ["beginner", "intermediate", "advanced"];

type CatalogState = {
  data: LearnCatalogResponse | null;
  isLoading: boolean;
  error: string;
};

type ProgressState = {
  completedUnitExternalIds: string[];
  isLoading: boolean;
  error: string;
  isMarking: boolean;
  markError: string;
};

type QuizLinkState = {
  quizIdsByExternalId: Record<string, number>;
};

function createCatalogState(): CatalogState {
  // Start with a loading shell so the page can reserve its full structure before catalog content arrives.
  return {
    data: null,
    isLoading: true,
    error: ""
  };
}

function createProgressState(): ProgressState {
  // Completion state stays separate from catalog state because read content should remain visible even if progress fetch fails.
  return {
    completedUnitExternalIds: [],
    isLoading: true,
    error: "",
    isMarking: false,
    markError: ""
  };
}

function createQuizLinkState(): QuizLinkState {
  // Quiz links are derived metadata, so default to an empty map instead of blocking lesson rendering on quiz-path fetches.
  return {
    quizIdsByExternalId: {}
  };
}

function flattenUnits(tracks: LearnTrack[]): LearnUnit[] {
  // Flatten every track into one globally ordered lesson list so recommendation and next-lesson navigation share one source.
  return tracks
    .toSorted((left, right) => left.orderIndex - right.orderIndex)
    .flatMap((track) => track.units.toSorted((left, right) => left.orderIndex - right.orderIndex));
}

function isUnitDone(completedUnitExternalIds: string[], unitExternalId: string): boolean {
  // Centralize completion checks so hub cards, detail metadata, and auto-marking all speak from the same rule.
  return completedUnitExternalIds.includes(unitExternalId);
}

function formatUnitIndex(level: LearnLevel, orderIndex: number): string {
  // Mirror the quiz-style stage prefix so repeated per-track order indexes still read clearly on the hub.
  const stageIndex = LEVEL_ORDER.indexOf(level);
  return `${stageIndex + 1}.${orderIndex}`;
}

function formatReadingTime(estimatedMinutes: number | null, tx: (source: string, params?: Record<string, number | string>) => string): string {
  // Missing reading estimates should still render a calm label instead of exposing "0 min" or blank metadata.
  if (estimatedMinutes === null) {
    return tx("Short read");
  }

  return tx("{minutes} min read", { minutes: estimatedMinutes });
}

function getRecommendedUnit(units: LearnUnit[], completedUnitExternalIds: string[]): LearnUnit | null {
  // Recommend the first unfinished lesson so the hero keeps pointing at the next actionable chapter.
  return units.find((unit) => !isUnitDone(completedUnitExternalIds, unit.externalId)) ?? null;
}

function getLessonActionLabel(isDone: boolean, tx: (source: string) => string): string {
  return isDone ? tx("Review lesson") : tx("Open lesson");
}

function getLevelLabel(level: LearnLevel, tx: (source: string) => string): string {
  if (level === "beginner") {
    return tx("Beginner");
  }
  if (level === "intermediate") {
    return tx("Intermediate");
  }
  return tx("Advanced");
}

function getUnitQuizHref(unit: LearnUnit, quizIdsByExternalId: Record<string, number>): string {
  // Fall back to the quiz hub when the linked lesson quiz is not present in the current live path payload.
  if (!unit.quizExternalId) {
    return "/quiz";
  }

  const quizId = quizIdsByExternalId[unit.quizExternalId];
  return typeof quizId === "number" ? `/quiz/${quizId}` : "/quiz";
}

function getTrackForUnit(tracks: LearnTrack[], unitExternalId: string): LearnTrack | null {
  // Resolve the owning track once so both the detail header and the "back" link can stay anchored to the same section.
  return tracks.find((track) => track.units.some((candidate) => candidate.externalId === unitExternalId)) ?? null;
}

function getFocusTrackExternalId(locationState: unknown): string {
  if (!locationState || typeof locationState !== "object") {
    return "";
  }

  const record = locationState as { focusTrackExternalId?: unknown };
  return typeof record.focusTrackExternalId === "string" ? record.focusTrackExternalId : "";
}

function LearnHub({
  completedUnitExternalIds,
  focusTrackExternalId,
  progressError,
  tracks
}: {
  completedUnitExternalIds: string[];
  focusTrackExternalId: string;
  progressError: string;
  tracks: LearnTrack[];
}) {
  const { tx } = useI18n();
  const units = flattenUnits(tracks);
  const trackRefs = useRef<Record<string, HTMLElement | null>>({});
  // Completion copy is derived from the same flattened list that powers recommendation so counts stay consistent across sections.
  const recommendedUnit = getRecommendedUnit(units, completedUnitExternalIds);
  const completedCount = units.filter((unit) => isUnitDone(completedUnitExternalIds, unit.externalId)).length;
  const totalCount = units.length;

  useEffect(() => {
    if (!focusTrackExternalId) {
      return;
    }

    // Restore the learner to the originating stage instead of leaving them wherever the detail page footer happened to sit.
    trackRefs.current[focusTrackExternalId]?.scrollIntoView({
      block: "start",
      behavior: "auto"
    });
  }, [focusTrackExternalId, tracks]);

  return (
    <section className="learn-module learn-page-shell" aria-labelledby="learn-module-title">
      <div className="learn-header">
        <div className="learn-header-copy">
          <h1 id="learn-module-title">
            <span>{tx("Read the core crypto ideas")}</span>
            <span>{tx("before you test them")}</span>
          </h1>
          <p>{tx("Move chapter by chapter through the core learning path, keep the reading flow calm and focused, then head into quiz when you are ready.")}</p>
        </div>

        <div aria-hidden="true" className="learn-header-divider" />

        <div className="learn-toolbar">
          <p>{tx("{completed} of {total} lessons done", { completed: completedCount, total: totalCount })}</p>
        </div>
      </div>

      {progressError ? <p className="learn-status-banner is-warning">{progressError}</p> : null}

      <div className="learn-content-stack">
        <article className="learn-panel learn-focus-panel">
          <div className="learn-panel-head">
            <div>
              <h2>{tx("Start here")}</h2>
            </div>
          </div>

          {recommendedUnit ? (
            <div className="learn-focus-block">
              <p className="learn-kicker">{getLevelLabel(recommendedUnit.level, tx)}</p>

              <div className="learn-focus-row">
                <div className="learn-focus-copy">
                  <h3>{recommendedUnit.title}</h3>
                  <div className="learn-inline-meta" role="list">
                    <span role="listitem">{formatReadingTime(recommendedUnit.estimatedMinutes, tx)}</span>
                  </div>
                </div>

                <div className="learn-focus-actions">
                  {isUnitDone(completedUnitExternalIds, recommendedUnit.externalId) ? <span className="learn-status-label is-done">{tx("Done")}</span> : null}
                  <Link className="learn-primary-action" to={`/learn/${recommendedUnit.externalId}`}>
                    {getLessonActionLabel(isUnitDone(completedUnitExternalIds, recommendedUnit.externalId), tx)}
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <div className="learn-focus-block learn-complete-block">
              <p className="learn-kicker">{tx("Course status")}</p>

              <div className="learn-focus-row">
                <div className="learn-focus-copy learn-complete-copy">
                  <h3>{tx("Completed")}</h3>
                  <p>{tx("You have completed every lesson in the current path.")}</p>
                </div>
              </div>
            </div>
          )}
        </article>

        {tracks.map((track) => (
          <article
            className="learn-panel"
            key={track.externalId}
            ref={(element) => {
              trackRefs.current[track.externalId] = element;
            }}
          >
            <div className="learn-panel-head">
              <div>
                <h2>{track.title}</h2>
              </div>
            </div>

            <div className="learn-path-list">
              {track.units.map((unit) => {
                // Recompute completion per row so repeated labels/links cannot drift from the shared progress state.
                const unitDone = isUnitDone(completedUnitExternalIds, unit.externalId);

                return (
                  <article className={`learn-path-item ${unitDone ? "is-done" : ""}`.trim()} key={unit.externalId}>
                    <div className="learn-path-index">{formatUnitIndex(unit.level, unit.orderIndex)}</div>

                    <div className="learn-path-main">
                      <h3>{unit.title}</h3>
                      <div className="learn-inline-meta learn-path-meta" role="list">
                        <span role="listitem">{formatReadingTime(unit.estimatedMinutes, tx)}</span>
                      </div>
                    </div>

                    <div className="learn-path-actions">
                      {unitDone ? <span className="learn-status-label is-done">{tx("Done")}</span> : null}
                      <Link className="learn-secondary-action" to={`/learn/${unit.externalId}`}>
                        {getLessonActionLabel(unitDone, tx)}
                      </Link>
                    </div>
                  </article>
                );
              })}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function LearnDetail({
  completedUnitExternalIds,
  markError,
  onMarkDone,
  quizHref,
  track,
  tracks,
  unit
}: {
  completedUnitExternalIds: string[];
  markError: string;
  onMarkDone: (unitExternalId: string) => Promise<void>;
  quizHref: string;
  track: LearnTrack | null;
  tracks: LearnTrack[];
  unit: LearnUnit;
}) {
  const { tx } = useI18n();
  const units = flattenUnits(tracks);
  // Derive next lesson from the globally ordered list so cross-track transitions still move forward predictably.
  const currentIndex = units.findIndex((candidate) => candidate.externalId === unit.externalId);
  const nextUnit = currentIndex >= 0 && currentIndex + 1 < units.length ? units[currentIndex + 1] : null;
  const unitDone = isUnitDone(completedUnitExternalIds, unit.externalId);
  const readingEndRef = useRef<HTMLDivElement | null>(null);
  const autoMarkStartedRef = useRef(false);

  useEffect(() => {
    // Reset the guard on route change so each lesson can auto-complete once when its own footer enters view.
    autoMarkStartedRef.current = false;
  }, [unit.externalId]);

  useEffect(() => {
    // Re-anchor every lesson detail at the top so direct links and next-step navigation both start from the heading.
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto"
    });
  }, [unit.externalId]);

  useEffect(() => {
    const target = readingEndRef.current;
    if (!target || unitDone) {
      // Already-completed lessons skip the observer entirely so review visits do not trigger redundant writes.
      return;
    }

    const observer = new IntersectionObserver((entries) => {
      const didReachEnd = entries.some((entry) => entry.isIntersecting);
      if (!didReachEnd || autoMarkStartedRef.current) {
        return;
      }

      // Lock after the first qualifying intersection so tiny scroll oscillations near the footer cannot double-submit.
      autoMarkStartedRef.current = true;
      void onMarkDone(unit.externalId);
    }, {
      root: null,
      threshold: 0.98
    });

    observer.observe(target);

    return () => {
      observer.disconnect();
    };
  }, [onMarkDone, unit.externalId, unitDone]);

  return (
    <section className="learn-module learn-page-shell learn-article-page" aria-labelledby="learn-detail-title">
      <header className="learn-article-header">
        <p className="learn-article-kicker">{track ? track.title : getLevelLabel(unit.level, tx)}</p>
        <h1 id="learn-detail-title" className="learn-article-title">
          {unit.title}
        </h1>
        <div className="learn-inline-meta learn-detail-meta learn-article-meta" role="list">
          <span role="listitem">{formatReadingTime(unit.estimatedMinutes, tx)}</span>
          {unitDone ? <span role="listitem" className="learn-status-label is-done">{tx("Done")}</span> : null}
        </div>
        <div aria-hidden="true" className="learn-article-divider" />
      </header>

      {markError ? <p className="learn-status-banner is-error">{markError}</p> : null}

      <div className="learn-content-stack learn-session-stack learn-article-stack">
        <article className="learn-panel learn-reading-panel learn-article-panel">
          <div className="learn-reading-body">
            {/* Pass source metadata through so the rich-text renderer can normalize links relative to the lesson's upstream document. */}
            <LessonRichText content={unit.bodyMarkdown} sourcePath={unit.sourcePath} sourceRepo={unit.sourceRepo} />
            <div aria-hidden="true" className="learn-reading-end-sentinel" ref={readingEndRef} />
          </div>
        </article>

        <article className="learn-panel learn-detail-actions-panel learn-article-footer">
          <div className="learn-detail-nav learn-article-nav">
            {nextUnit ? (
              <div className="learn-detail-nav-slot">
                <Link className="learn-secondary-action" to={`/learn/${nextUnit.externalId}`}>
                  {tx("Next lesson")}
                </Link>
              </div>
            ) : null}

            <div className="learn-detail-nav-slot">
              <Link className="learn-secondary-action" to={quizHref}>
                {tx("Go to quiz")}
              </Link>
            </div>

            <div className="learn-detail-nav-slot">
              <Link
                className="learn-back-link"
                // Carry the current track back to the hub so the return trip lands near the lesson the learner just finished reading.
                state={track ? { focusTrackExternalId: track.externalId } : undefined}
                to="/learn"
              >
                {tx("Back to learn")}
              </Link>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function LearnModule() {
  const { tx } = useI18n();
  const { unitExternalId } = useParams();
  const location = useLocation();
  const [catalogState, setCatalogState] = useState<CatalogState>(createCatalogState);
  const [progressState, setProgressState] = useState<ProgressState>(createProgressState);
  const [quizLinkState, setQuizLinkState] = useState<QuizLinkState>(createQuizLinkState);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      // Load catalog, progress, and quiz-link metadata together so the hub can recover partially when one request fails.
      const [catalogResult, progressResult, quizPathResult] = await Promise.allSettled([fetchLearnCatalog(), fetchLearnProgress(), fetchQuizPath()]);

      if (cancelled) {
        return;
      }

      if (catalogResult.status === "fulfilled") {
        setCatalogState({
          data: catalogResult.value,
          isLoading: false,
          error: ""
        });
      } else {
        setCatalogState({
          data: null,
          isLoading: false,
          error: catalogResult.reason instanceof Error ? catalogResult.reason.message : tx("Unable to load the learn catalog.")
        });
      }

      if (progressResult.status === "fulfilled") {
        setProgressState((current) => ({
          ...current,
          completedUnitExternalIds: progressResult.value.completedUnitExternalIds,
          isLoading: false,
          error: ""
        }));
      } else {
        setProgressState((current) => ({
          ...current,
          isLoading: false,
          error: progressResult.reason instanceof Error ? progressResult.reason.message : tx("Unable to load lesson completion right now.")
        }));
      }

      if (quizPathResult.status === "fulfilled") {
        setQuizLinkState({
          quizIdsByExternalId: Object.fromEntries(
            quizPathResult.value.quizzes.flatMap((quiz) => (
              quiz.externalId && typeof quiz.id === "number" ? [[quiz.externalId, quiz.id]] : []
            ))
          )
        });
      } else {
        // Missing quiz-path data should degrade only the footer CTA target, not the rest of the learn experience.
        setQuizLinkState(createQuizLinkState());
      }
    };

    void loadData();

    return () => {
      cancelled = true;
    };
  }, [tx]);

  const handleMarkDone = async (nextUnitExternalId: string): Promise<void> => {
    // Keep mark state local so the lesson can surface one inline error without blanking the chapter body.
    setProgressState((current) => ({
      ...current,
      isMarking: true,
      markError: ""
    }));

    try {
      const completion = await markLearnUnitDone(nextUnitExternalId);
      setProgressState((current) => ({
        ...current,
        // Append idempotently because the server endpoint can be retried and the observer may revisit the footer on rerender.
        completedUnitExternalIds: current.completedUnitExternalIds.includes(completion.unitExternalId)
          ? current.completedUnitExternalIds
          : [...current.completedUnitExternalIds, completion.unitExternalId],
        isMarking: false,
        markError: ""
      }));
    } catch (error) {
      setProgressState((current) => ({
        ...current,
        isMarking: false,
        markError: error instanceof Error ? error.message : tx("Unable to mark this lesson as done right now.")
      }));
    }
  };

  if (catalogState.isLoading) {
    return (
      <section className="learn-access-shell" aria-live="polite">
        <p>{tx("Loading learn content...")}</p>
      </section>
    );
  }

  if (catalogState.error || !catalogState.data) {
    return (
      <section className="learn-access-shell" aria-live="polite">
        <p>{catalogState.error || tx("Unable to load the learn catalog.")}</p>
      </section>
    );
  }

  const unit = unitExternalId
    // Resolve lesson detail from the published catalog snapshot so routing stays anchored to stable external ids.
    ? flattenUnits(catalogState.data.tracks).find((entry) => entry.externalId === unitExternalId) ?? null
    : null;

  if (unitExternalId && !unit) {
    return (
      <section className="learn-access-shell" aria-live="polite">
        <p>{tx("Lesson not found.")}</p>
      </section>
    );
  }

  if (unit) {
    const track = getTrackForUnit(catalogState.data.tracks, unit.externalId);
    return (
      <LearnDetail
        completedUnitExternalIds={progressState.completedUnitExternalIds}
        markError={progressState.markError}
        onMarkDone={handleMarkDone}
        quizHref={getUnitQuizHref(unit, quizLinkState.quizIdsByExternalId)}
        track={track}
        tracks={catalogState.data.tracks}
        unit={unit}
      />
    );
  }

  return (
    <LearnHub
      completedUnitExternalIds={progressState.completedUnitExternalIds}
      focusTrackExternalId={getFocusTrackExternalId(location.state)}
      progressError={progressState.error}
      tracks={catalogState.data.tracks}
    />
  );
}
