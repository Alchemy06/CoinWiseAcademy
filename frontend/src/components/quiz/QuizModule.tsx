import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";
import { useI18n } from "../../i18n/provider";
import type { QuizDetail, QuizLevel, QuizPathItem, QuizPathResponse, QuizQuestion, QuizStageGroup, QuizSubmissionResult } from "../../types/quiz";
import { AssistantRichText } from "../chat/AssistantRichText";
import { ThinkingIndicator } from "../chat/ThinkingIndicator";
import { fetchQuizDetail, fetchQuizFeedback, fetchQuizPath, submitQuizAnswers } from "../../utils/quiz";

const STAGE_ORDER: QuizLevel[] = ["beginner", "intermediate", "advanced"];

const OPTION_INDEX_LABELS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";

type AsyncState<T> = {
  data: T | null;
  isLoading: boolean;
  error: string;
};

// Feedback has a distinct state machine because its lifecycle starts only after quiz submission succeeds.
type QuizFeedbackStatus = "idle" | "loading" | "success" | "error";

// Keep the latest quiz-path snapshot in module scope so hub/detail hops can reuse it without flashing a fresh loading shell.
let quizPathCache: QuizPathResponse | null = null;

export function resetQuizPathCacheForTests(): void {
  // Test suites need an explicit reset because the module-level cache survives across renders inside one Vitest worker.
  quizPathCache = null;
}

export function primeQuizPathCacheForTests(path: QuizPathResponse): void {
  // Tests can seed the cache directly when they need to simulate a return trip from quiz detail back to the hub.
  quizPathCache = path;
}

function createAsyncState<T>(): AsyncState<T> {
  // Every async quiz surface uses the same idle shape so loading/error branches stay uniform across hub and session views.
  return {
    data: null,
    isLoading: true,
    error: ""
  };
}

function createCachedAsyncState<T>(data: T): AsyncState<T> {
  // Rehydrate from known-good cached data so route transitions can render synchronously without a visible loading detour.
  return {
    data,
    isLoading: false,
    error: ""
  };
}

function setQuizPathCache(path: QuizPathResponse): QuizPathResponse {
  // Return the stored payload as well so callers can update React state and the shared cache in one expression.
  quizPathCache = path;
  return path;
}

function getStageLabel(level: QuizLevel, tx: (source: string) => string): string {
  if (level === "beginner") {
    return tx("Beginner");
  }
  if (level === "intermediate") {
    return tx("Intermediate");
  }
  return tx("Advanced");
}

function getStatusLabel(status: QuizPathItem["status"], tx: (source: string) => string): string {
  if (status === "locked") {
    return tx("Locked");
  }
  if (status === "ready") {
    return tx("Ready");
  }
  if (status === "passed") {
    return tx("Passed");
  }
  return tx("Retry");
}

function groupQuizzesByStage(path: QuizPathResponse, tx: (source: string) => string): QuizStageGroup[] {
  // Keep the first quiz in each stage visible as the stable entry point, then reveal passed work plus the next actionable quiz.
  return STAGE_ORDER.flatMap((level) => {
    const stageQuizzes = path.quizzes.filter((quiz) => quiz.level === level);
    if (stageQuizzes.length === 0) {
      return [];
    }

    const placeholderQuizId = stageQuizzes[0]?.id ?? null;
    const nextActionableQuizId = stageQuizzes.find((quiz) => !quiz.isLocked && (quiz.status === "ready" || quiz.status === "retry"))?.id ?? null;
    const quizzes = stageQuizzes.filter((quiz) => {
      if (quiz.id === placeholderQuizId) {
        return true;
      }

      if (quiz.isPassed) {
        return true;
      }

      return quiz.id === nextActionableQuizId;
    });

    if (quizzes.length === 0) {
      return [];
    }

    return [
      {
        level,
        label: getStageLabel(level, tx),
        quizzes
      }
    ];
  });
}

function getFocusQuizId(locationState: unknown): number | null {
  // Route state is untyped at the boundary, so validate the focus id before using it for scroll restoration.
  if (!locationState || typeof locationState !== "object") {
    return null;
  }

  const record = locationState as { focusQuizId?: unknown };
  return typeof record.focusQuizId === "number" && Number.isInteger(record.focusQuizId) && record.focusQuizId > 0
    ? record.focusQuizId
    : null;
}

function formatBestScore(item: QuizPathItem, tx: (source: string, params?: Record<string, number | string>) => string): string {
  // Hide score copy until the learner has at least one recorded attempt on that quiz.
  if (item.bestScore === null) {
    return "";
  }

  return tx("Best score {score}/{max}", { score: item.bestScore, max: item.maxScore });
}

function getPrimaryActionLabel(item: QuizPathItem, tx: (source: string) => string): string {
  // Button copy reflects progress state so the path feels resumable rather than always "start from scratch".
  if (item.status === "passed") {
    return tx("Review quiz");
  }
  if (item.status === "retry") {
    return tx("Retry quiz");
  }
  return tx("Start quiz");
}

function formatQuizPathIndex(item: QuizPathItem): string {
  // Prefix the per-stage order with the stage number so repeated order indexes stay globally readable on the hub.
  const stageIndex = STAGE_ORDER.indexOf(item.level);
  const major = stageIndex >= 0 ? stageIndex + 1 : 0;
  return `${major}.${item.orderIndex}`;
}

function QuizHub({ focusQuizId }: { focusQuizId: number | null }) {
  const { tx } = useI18n();
  const [pathState, setPathState] = useState<AsyncState<QuizPathResponse>>(() => (
    quizPathCache ? createCachedAsyncState(quizPathCache) : createAsyncState()
  ));
  // Store quiz-card nodes by id so the return trip can scroll to the exact quiz instead of only the surrounding stage.
  const quizRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => {
    let cancelled = false;

    const loadPath = async () => {
      try {
        const path = await fetchQuizPath();
        if (!cancelled) {
          // Refresh from the server in the background so cached renders stay fast without giving up eventual path freshness.
          setPathState(createCachedAsyncState(setQuizPathCache(path)));
        }
      } catch (error) {
        if (!cancelled && !quizPathCache) {
          // Keep the shell visible on fetch failure so the user gets context plus a retryable browser state.
          setPathState({
            data: null,
            isLoading: false,
            error: error instanceof Error ? error.message : tx("Unable to load your quiz path.")
          });
        }
      }
    };

    void loadPath();

    return () => {
      cancelled = true;
    };
  }, [tx]);

  const path = pathState.data;
  // When the API has no recommendation left, distinguish "everything is still locked" from "the learner is fully caught up".
  const recommendedQuiz = path
    ? path.quizzes.find((quiz) => quiz.id === path.recommendedQuizId)
    ?? (path.quizzes.every((quiz) => quiz.isLocked) ? path.quizzes[0] ?? null : null)
    : null;
  const stageGroups = path ? groupQuizzesByStage(path, tx) : [];

  useEffect(() => {
    if (focusQuizId === null || pathState.isLoading) {
      return;
    }

    // Restore the learner to the quiz they just finished instead of dropping them back at the top of the hub.
    quizRefs.current[focusQuizId]?.scrollIntoView({
      block: "start",
      behavior: "auto"
    });
  }, [focusQuizId, pathState.isLoading, stageGroups]);

  return (
    <section className="quiz-module quiz-page-shell" aria-labelledby="quiz-module-title">
      <div className="quiz-header">
        <div className="quiz-header-copy">
          <h1 id="quiz-module-title">
            <span>{tx("A practical check on crypto")}</span>
            <span>{tx("risk and market judgement")}</span>
          </h1>
          <p>{tx("Use short quizzes to test core concepts, recognise common risk patterns, and build more reliable market judgement step by step.")}</p>
        </div>

        <div aria-hidden="true" className="quiz-header-divider" />

        <div className="quiz-toolbar">
          <p>{path ? tx("{completed} of {total} quizzes passed", { completed: path.completedCount, total: path.totalCount }) : tx("Loading your quiz path...")}</p>
        </div>
      </div>

      {pathState.error ? <p className="quiz-status-banner is-error">{pathState.error}</p> : null}

      <div className="quiz-content-stack">
        <article className="quiz-panel quiz-focus-panel">
          <div className="quiz-panel-head">
            <div>
              <h2>{tx("Start here")}</h2>
            </div>
          </div>

          {pathState.isLoading ? (
            <div className="quiz-empty-state">
              <p>{tx("Loading your personalised path...")}</p>
            </div>
          ) : recommendedQuiz ? (
            <div className="quiz-focus-block">
              <p className="quiz-kicker">{getStageLabel(recommendedQuiz.level, tx)}</p>

              <div className="quiz-focus-row">
                <div className="quiz-focus-copy">
                  <h3>{recommendedQuiz.title}</h3>
                  <div className="quiz-inline-meta" role="list">
                    <span role="listitem">{tx("Pass mark {pass}/{max}", { pass: recommendedQuiz.passMark, max: recommendedQuiz.maxScore })}</span>
                  </div>
                  {recommendedQuiz.isLocked ? (
                    <>
                      {/* Locked recommendations still need a concrete next step so the hero can route learners back into lessons. */}
                      <p className="quiz-panel-note">{tx("Finish the matching lesson first, then come back here to start this quiz.")}</p>
                    </>
                  ) : null}
                </div>

                <div className="quiz-focus-actions">
                  <span className={`quiz-status-label status-${recommendedQuiz.status}`}>{getStatusLabel(recommendedQuiz.status, tx)}</span>
                  {recommendedQuiz.isLocked ? (
                    <Link className="quiz-secondary-action" to="/learn">
                      {tx("Go to lesson")}
                    </Link>
                  ) : (
                    <Link className="quiz-primary-action" to={`/quiz/${recommendedQuiz.id}`}>
                      {getPrimaryActionLabel(recommendedQuiz, tx)}
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="quiz-empty-state">
              <p>{tx("You're all caught up.")}</p>
            </div>
          )}
        </article>

        {stageGroups.map((group) => (
          <article className="quiz-panel" key={group.level}>
            <div className="quiz-panel-head">
              <div>
                <h2>{group.label}</h2>
              </div>
            </div>

            <div className="quiz-path-list">
              {group.quizzes.map((item) => (
                <article
                  className={`quiz-path-item status-${item.status}`}
                  key={item.id}
                  ref={(node) => {
                    quizRefs.current[item.id] = node;
                  }}
                >
                  <div className="quiz-path-index">{formatQuizPathIndex(item)}</div>

                  <div className="quiz-path-main">
                    <h3>{item.title}</h3>
                    <div className="quiz-inline-meta" role="list">
                      <span role="listitem">{tx("Pass mark {pass}/{max}", { pass: item.passMark, max: item.maxScore })}</span>
                      {item.bestScore !== null ? <span role="listitem">{formatBestScore(item, tx)}</span> : null}
                    </div>
                  </div>

                  <div className="quiz-path-actions">
                    <span className={`quiz-status-label status-${item.status}`}>{getStatusLabel(item.status, tx)}</span>
                    {item.isLocked ? null : (
                      <Link className="quiz-secondary-action" to={`/quiz/${item.id}`}>
                        {getPrimaryActionLabel(item, tx)}
                      </Link>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function QuizResults({
  result
}: {
  result: QuizSubmissionResult;
}) {
  const { tx } = useI18n();
  // Results stay intentionally compact here because per-question review is deferred until the product needs it.
  return (
    <article className="quiz-panel quiz-result-summary-panel">
      <div className="quiz-result-stats-wrap">
        <dl className="quiz-result-stats">
          <div className="quiz-result-stat">
            <dt>{tx("Score")}</dt>
            <dd>
              {result.totalScore}/{result.maxScore}
            </dd>
          </div>
          <div className="quiz-result-stat">
            <dt>{tx("Pass mark")}</dt>
            <dd>
              {result.passScore}/{result.maxScore}
            </dd>
          </div>
        </dl>
      </div>
    </article>
  );
}

function QuizResultActions({
  backToPathState,
  canShowBackToPath,
  canShowViewResult,
  compactSpacing,
  isViewResultDisabled,
  onRetake,
  onViewResult
}: {
  backToPathState?: unknown;
  canShowBackToPath?: boolean;
  canShowViewResult: boolean;
  compactSpacing?: boolean;
  isViewResultDisabled: boolean;
  onRetake: () => void;
  onViewResult: () => void;
}) {
  const { tx } = useI18n();
  // Keep all post-result controls in one component so layout changes track one shared button order contract.
  return (
    <div className={`quiz-result-actions-shell ${compactSpacing ? "is-compact" : ""}`.trim()}>
      <div className="quiz-result-actions">
        {canShowViewResult ? (
          <button className="quiz-secondary-action quiz-button-reset" disabled={isViewResultDisabled} onClick={onViewResult} type="button">
            {tx("View result")}
          </button>
        ) : null}
        <button className="quiz-secondary-action quiz-button-reset" onClick={onRetake} type="button">
          {tx("Retake quiz")}
        </button>
        {canShowBackToPath ? <QuizBackToPathLink className="quiz-secondary-action quiz-button-reset" state={backToPathState} /> : null}
      </div>
    </div>
  );
}

function QuizBackToPathLink({ className = "", state }: { className?: string; state?: unknown }) {
  const { tx } = useI18n();
  return (
    <Link className={className} state={state} to="/quiz">
      {tx("Back to path")}
    </Link>
  );
}

function QuizFeedbackSection({
  error,
  feedback,
  isLoading,
  isRetryAvailable,
  onRetry
}: {
  error: string;
  feedback: string;
  isLoading: boolean;
  isRetryAvailable: boolean;
  onRetry: () => void;
}) {
  const { tx } = useI18n();
  // Keep the feedback surface lightweight so the generated summary feels native to the quiz flow instead of a full chat turn.
  return (
    <section aria-live="polite" className="quiz-feedback-section">
      <div className="quiz-feedback-body">
        {isLoading ? <ThinkingIndicator /> : null}
        {feedback ? <AssistantRichText content={feedback} /> : null}
        {error ? (
          <div className="quiz-feedback-error">
            <p className="quiz-status-banner is-error">{error}</p>
            {isRetryAvailable ? (
              <button className="quiz-secondary-action quiz-button-reset" onClick={onRetry} type="button">
                {tx("Try again")}
              </button>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}

function QuizSession({ quizId }: { quizId: number }) {
  const { tx } = useI18n();
  const navigate = useNavigate();
  const backToPathState = { focusQuizId: quizId };
  // Auto-advance keeps the session feeling conversational, but the timeout must remain cancellable across rerenders.
  const autoAdvanceTimeoutRef = useRef<number | null>(null);
  // The question panel becomes the scroll anchor so each auto-advanced step can re-enter the viewport predictably.
  const questionPanelRef = useRef<HTMLElement | null>(null);
  // Lock each question on the first selection so late taps cannot rewrite the answer during the feedback delay.
  const answeredQuestionIdsRef = useRef<Set<number>>(new Set());
  // Monotonic request ids let the UI ignore stale feedback responses after retakes or route changes.
  const feedbackRequestIdRef = useRef(0);
  const [pathState, setPathState] = useState<AsyncState<QuizPathResponse>>(() => (
    quizPathCache ? createCachedAsyncState(quizPathCache) : createAsyncState()
  ));
  const [quizState, setQuizState] = useState<AsyncState<QuizDetail>>(createAsyncState);
  const [answersByQuestionId, setAnswersByQuestionId] = useState<Record<number, number>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [result, setResult] = useState<QuizSubmissionResult | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [feedbackStatus, setFeedbackStatus] = useState<QuizFeedbackStatus>("idle");
  const [feedbackContent, setFeedbackContent] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [isFeedbackRetryAvailable, setIsFeedbackRetryAvailable] = useState(true);

  useEffect(() => {
    let cancelled = false;

    // Reset local state whenever the route quiz id changes so one session cannot leak into the next.
    // Reuse cached path data immediately so returning to a just-visited quiz does not briefly flash the hub loading state.
    setPathState(quizPathCache ? createCachedAsyncState(quizPathCache) : createAsyncState());
    setQuizState(createAsyncState());
    setAnswersByQuestionId({});
    setCurrentQuestionIndex(0);
    setResult(null);
    setSubmitError("");
    setFeedbackStatus("idle");
    setFeedbackContent("");
    setFeedbackError("");
    setIsFeedbackRetryAvailable(true);
    answeredQuestionIdsRef.current = new Set();
    // Invalidate any in-flight feedback promise from the previous quiz before fresh data starts loading.
    feedbackRequestIdRef.current += 1;

    const loadQuiz = async () => {
      try {
        // Fetch path and detail together so the route can validate lock state before showing question content.
        // When the path is already cached, skip the extra network round trip and validate against the shared snapshot immediately.
        const [path, quiz] = await Promise.all([
          quizPathCache ? Promise.resolve(quizPathCache) : fetchQuizPath(),
          fetchQuizDetail(quizId)
        ]);
        const pathItem = path.quizzes.find((item) => item.id === quizId);

        if (!pathItem || pathItem.isLocked) {
          if (!cancelled) {
            // Fail closed back to the hub if the user deep-links into a locked or no-longer-live quiz route.
            navigate("/quiz", { replace: true });
          }
          return;
        }

        if (!cancelled) {
          setPathState(createCachedAsyncState(setQuizPathCache(path)));
          setQuizState({
            data: quiz,
            isLoading: false,
            error: ""
          });
        }
      } catch (error) {
        if (!cancelled) {
          // Share one message across both state buckets so the page cannot display contradictory error states.
          const message = error instanceof Error ? error.message : tx("Unable to load this quiz.");
          setPathState((current) => ({
            ...current,
            isLoading: false,
            error: message
          }));
          setQuizState({
            data: null,
            isLoading: false,
            error: message
          });
        }
      }
    };

    void loadQuiz();

    return () => {
      cancelled = true;
    };
  }, [navigate, quizId, tx]);

  const quiz = quizState.data;
  const quizMeta = pathState.data?.quizzes.find((item) => item.id === quizId) ?? null;
  const questions = quiz?.questions ?? [];
  const currentQuestion = questions[currentQuestionIndex] ?? null;
  const selectedOptionId = currentQuestion ? answersByQuestionId[currentQuestion.id] : undefined;
  const isCurrentQuestionLocked = selectedOptionId !== undefined;
  // Once feedback leaves idle, reserve space for that section so error/loading/success share the same visual slot.
  const shouldRenderFeedbackSection = feedbackStatus !== "idle";
  // Successful feedback moves the actions underneath the generated copy to preserve the reading flow.
  const shouldMoveActionsBelowFeedback = feedbackStatus === "success";

  useEffect(() => {
    if (!currentQuestion || result) {
      return undefined;
    }

    const questionPanel = questionPanelRef.current;
    // JSDOM does not implement scrollIntoView, so the guard keeps tests aligned with browser-only behavior.
    if (!questionPanel || typeof questionPanel.scrollIntoView !== "function") {
      return undefined;
    }

    // Re-anchor the new question near the top so long prompts/options do not leave the learner mid-scroll.
    const frameId = window.requestAnimationFrame(() => {
      questionPanel.scrollIntoView({
        behavior: currentQuestionIndex === 0 ? "auto" : "smooth",
        block: "start"
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [currentQuestion, currentQuestionIndex, result]);

  const clearAutoAdvanceTimeout = () => {
    if (autoAdvanceTimeoutRef.current !== null) {
      window.clearTimeout(autoAdvanceTimeoutRef.current);
      autoAdvanceTimeoutRef.current = null;
    }
  };

  const handleOptionSelect = (question: QuizQuestion, optionId: number) => {
    if (result || answeredQuestionIdsRef.current.has(question.id)) {
      return;
    }

    answeredQuestionIdsRef.current.add(question.id);
    // Persist the latest selection immediately so rapid taps still leave the UI in the correct checked state.
    const nextAnswers = {
      ...answersByQuestionId,
      [question.id]: optionId
    };

    setAnswersByQuestionId(nextAnswers);
    clearAutoAdvanceTimeout();

    // Delay the transition slightly so the learner sees the selected state before the next question replaces it.
    autoAdvanceTimeoutRef.current = window.setTimeout(() => {
      if (currentQuestionIndex < questions.length - 1) {
        setCurrentQuestionIndex((index) => Math.min(questions.length - 1, index + 1));
      } else {
        // Reuse the pending answer map so the last click can submit without waiting for state reconciliation.
        void handleSubmit(nextAnswers);
      }
      autoAdvanceTimeoutRef.current = null;
    }, 900);
  };

  const handleSubmit = async (answersOverride?: Record<number, number>) => {
    const submittedAnswers = answersOverride ?? answersByQuestionId;

    // Guard against partial payloads so the backend never receives a half-finished quiz session from the UI.
    if (!quiz || questions.length === 0 || !questions.every((question) => submittedAnswers[question.id] !== undefined)) {
      return;
    }

    clearAutoAdvanceTimeout();
    setSubmitError("");

    try {
      // Submit answers in quiz order so the payload remains stable and easy to inspect in tests/network logs.
      const submission = await submitQuizAnswers(quiz.id, {
        answers: quiz.questions.map((question) => ({
          questionId: question.id,
          selectedOptionId: submittedAnswers[question.id]
        }))
      });
      setResult(submission);
      // Refresh the shared path snapshot opportunistically so the next trip back to the hub reflects updated progress without blocking results.
      void fetchQuizPath().then((path) => {
        setQuizPathCache(path);
      }).catch(() => {
        // Keep the current session usable even if the post-submit path refresh fails.
      });
      // Submitting again should force a fresh feedback fetch rather than reusing the previous attempt's summary.
      setFeedbackStatus("idle");
      setFeedbackContent("");
      setFeedbackError("");
      setIsFeedbackRetryAvailable(true);
    } catch (error) {
      // Leave the selected answers intact so the learner can retry submission without redoing the whole quiz.
      setSubmitError(error instanceof Error ? error.message : tx("Unable to submit this quiz."));
    }
  };

  // Clear any pending auto-advance when the session unmounts so stale timers cannot update a future route.
  useEffect(() => () => {
    clearAutoAdvanceTimeout();
  }, []);

  const handleRetakeQuiz = () => {
    // Retake resets only local session state; persisted attempt history still informs the path page afterwards.
    setAnswersByQuestionId({});
    setCurrentQuestionIndex(0);
    setResult(null);
    setSubmitError("");
    setFeedbackStatus("idle");
    setFeedbackContent("");
    setFeedbackError("");
    setIsFeedbackRetryAvailable(true);
    answeredQuestionIdsRef.current = new Set();
    // Any pending feedback response from the previous attempt should be ignored once the learner starts over.
    feedbackRequestIdRef.current += 1;
  };

  const handleLoadFeedback = async () => {
    // Collapse double clicks and pre-result calls into a no-op so only one feedback request can be active at a time.
    if (!result || feedbackStatus === "loading") {
      return;
    }

    // Snapshot the current request id so late responses from older attempts can be discarded safely.
    const requestId = feedbackRequestIdRef.current + 1;
    feedbackRequestIdRef.current = requestId;
    setFeedbackStatus("loading");
    setFeedbackError("");
    setIsFeedbackRetryAvailable(true);

    try {
      const response = await fetchQuizFeedback(quizId, result.attemptId);
      if (feedbackRequestIdRef.current !== requestId) {
        // Ignore out-of-order completions after a retake, route change, or newer retry request wins the race.
        return;
      }
      setFeedbackContent(response.feedback);
      setFeedbackStatus("success");
    } catch (error) {
      if (feedbackRequestIdRef.current !== requestId) {
        return;
      }
      const message = error instanceof Error ? error.message : tx("Unable to load quiz feedback right now.");
      setFeedbackContent("");
      setFeedbackError(message);
      // Missing server credentials are not locally recoverable, so hide retry while keeping retake/next actions available.
      setIsFeedbackRetryAvailable(!/OPENAI_API_KEY is missing on the server/i.test(message));
      setFeedbackStatus("error");
    }
  };

  if (pathState.isLoading || quizState.isLoading) {
    return (
      <section className="quiz-module quiz-page-shell" aria-live="polite">
        <div className="quiz-empty-state">
          <p>{tx("Loading quiz session...")}</p>
        </div>
      </section>
    );
  }

  if (quizState.error || !quiz || !quizMeta) {
    return (
      <section className="quiz-module quiz-page-shell">
        <p className="quiz-status-banner is-error">{quizState.error || tx("This quiz is unavailable right now.")}</p>
      </section>
    );
  }

  if (result) {
    return (
      <section className="quiz-module quiz-page-shell" aria-labelledby="quiz-session-title">
        <div className="quiz-header quiz-session-header">
          <div className="quiz-header-copy">
          <h1 id="quiz-session-title">
            <span>{quiz.title}</span>
            <span>{tx("Results")}</span>
          </h1>
          </div>

          <div aria-hidden="true" className="quiz-header-divider" />

        <div className="quiz-toolbar">
          <p>{getStageLabel(quizMeta.level, tx)}</p>
          {!shouldMoveActionsBelowFeedback ? <QuizBackToPathLink state={backToPathState} /> : null}
        </div>
        </div>

        <div className="quiz-content-stack quiz-session-stack">
          <QuizResults result={result} />
          {shouldRenderFeedbackSection ? (
            <QuizFeedbackSection
              error={feedbackError}
              feedback={feedbackContent}
              isLoading={feedbackStatus === "loading"}
              isRetryAvailable={isFeedbackRetryAvailable}
              onRetry={() => {
                void handleLoadFeedback();
              }}
            />
          ) : null}
          {shouldMoveActionsBelowFeedback ? (
            <>
              <QuizResultActions
                backToPathState={backToPathState}
                canShowBackToPath
                canShowViewResult={false}
                compactSpacing
                isViewResultDisabled={false}
                onRetake={handleRetakeQuiz}
                onViewResult={() => {}}
              />
            </>
          ) : null}
        </div>
        {feedbackStatus !== "loading" && !shouldMoveActionsBelowFeedback ? (
          <QuizResultActions
            backToPathState={backToPathState}
            canShowBackToPath={false}
            canShowViewResult={feedbackStatus === "idle" || feedbackStatus === "loading"}
            isViewResultDisabled={feedbackStatus === "loading"}
            onRetake={handleRetakeQuiz}
            onViewResult={() => {
              void handleLoadFeedback();
            }}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section className="quiz-module quiz-page-shell" aria-labelledby="quiz-session-title">
      <div className="quiz-header quiz-session-header">
        <div className="quiz-header-copy">
          <h1 id="quiz-session-title">
            <span>{quiz.title}</span>
            <span>{tx("Quiz")}</span>
          </h1>
        </div>

        <div aria-hidden="true" className="quiz-header-divider" />

        <div className="quiz-toolbar">
          <p>{tx("{current} of {total}", { current: currentQuestionIndex + 1, total: quiz.questionCount })}</p>
          <QuizBackToPathLink state={backToPathState} />
        </div>
      </div>

      <div className="quiz-content-stack quiz-session-stack">
        <article className="quiz-panel quiz-question-panel" ref={questionPanelRef}>
          {currentQuestion ? (
            <div className="quiz-question-block">
              <h3>{currentQuestion.text}</h3>

              <div className="quiz-choice-list" role="radiogroup" aria-label={tx("Question {index} options", { index: currentQuestionIndex + 1 })}>
                {currentQuestion.options.map((option, index) => {
                  const checked = selectedOptionId === option.id;
                  // Reuse correctness styling during the live session so the final selected state reads clearly before auto-advance.
                  const choiceStateClass = checked
                    ? option.isCorrect
                      ? "quiz-choice is-selected is-correct"
                      : "quiz-choice is-selected is-incorrect"
                    : "quiz-choice";
                  const indicatorLabel = checked
                    ? option.isCorrect
                      ? "✓"
                      : "✕"
                    : OPTION_INDEX_LABELS[index] ?? String(index + 1);
                  return (
                    <label className={`${choiceStateClass} ${isCurrentQuestionLocked ? "is-locked" : ""}`.trim()} key={option.id}>
                      <input
                        aria-label={option.text}
                        checked={checked}
                        disabled={isCurrentQuestionLocked}
                        name={`question-${currentQuestion.id}`}
                        onChange={() => handleOptionSelect(currentQuestion, option.id)}
                        type="radio"
                      />
                      <span aria-hidden="true" className="quiz-choice-index">
                        {indicatorLabel}
                      </span>
                      <span>{option.text}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          {submitError ? <p className="quiz-status-banner is-error">{submitError}</p> : null}

        </article>
      </div>
    </section>
  );
}

export function QuizModule() {
  const { tx } = useI18n();
  const { quizId } = useParams();
  const location = useLocation();
  const parsedQuizId = quizId ? Number.parseInt(quizId, 10) : null;

  // The index route renders the path hub; only numeric ids should enter the quiz-session flow.
  if (parsedQuizId === null) {
    return <QuizHub focusQuizId={getFocusQuizId(location.state)} />;
  }

  if (!Number.isInteger(parsedQuizId) || parsedQuizId <= 0) {
    return (
      <section className="quiz-module quiz-page-shell">
        <p className="quiz-status-banner is-error">{tx("Invalid quiz route.")}</p>
      </section>
    );
  }

  return <QuizSession quizId={parsedQuizId} />;
}
