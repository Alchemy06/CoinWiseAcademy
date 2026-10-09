import type {
  QuizAnswerDraft,
  QuizDetail,
  QuizLevel,
  QuizPathItem,
  QuizPathResponse,
  QuizQuestion,
  QuizQuestionResult,
  QuizFeedbackResponse,
  QuizSubmissionPayload,
  QuizSubmissionResult
} from "../types/quiz";
import { getStoredLocale } from "../i18n/config";
import { API_BASE_URL, fetchWithCsrf } from "./api";

type JsonRecord = Record<string, unknown>;

function normalizeNumber(value: unknown, fallback = 0): number {
  // Coerce only real finite numbers so malformed API fields degrade predictably instead of leaking NaN into UI math.
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  // Nullable numeric fields distinguish "missing" from zero, which matters for best-score and next-quiz metadata.
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function normalizeLevel(value: unknown): QuizLevel {
  // Default unknown levels to beginner so unsupported backend values fail into the safest first-stage styling.
  return value === "intermediate" || value === "advanced" ? value : "beginner";
}

function getErrorMessage(data: JsonRecord, fallback: string): string {
  return typeof data.detail === "string" ? data.detail : fallback;
}

async function parseJson(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    // Some failures return empty bodies, but callers still need a stable object for message extraction.
    return {};
  }
}

async function fetchJson(path: string): Promise<JsonRecord> {
  // GET helpers bypass fetchWithCsrf because quiz reads are session-authenticated but not CSRF-protected mutations.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Accept-Language": getStoredLocale()
    }
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to load quiz data right now."));
  }

  return data;
}

function normalizeQuestion(entry: unknown): QuizQuestion | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as JsonRecord;
  return {
    id: normalizeNumber(record.id),
    text: normalizeText(record.text),
    // Accept either casing so the client stays compatible with DRF snake_case and any future camelCase adapters.
    questionType: normalizeText(record.questionType ?? record.question_type) === "SAQ" ? "SAQ" : "MCQ",
    marks: normalizeNumber(record.marks, 1),
    explanation: normalizeText(record.explanation),
    options: Array.isArray(record.options)
      ? record.options.flatMap((option) => {
        if (!option || typeof option !== "object") {
          return [];
        }

        const optionRecord = option as JsonRecord;
        return [
          {
            id: normalizeNumber(optionRecord.id),
            text: normalizeText(optionRecord.text),
            isCorrect: Boolean(optionRecord.isCorrect ?? optionRecord.is_correct)
          }
        ];
      })
      : []
  };
}

function normalizePathItem(entry: unknown): QuizPathItem | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as JsonRecord;
  return {
    id: normalizeNumber(record.id),
    externalId: normalizeText(record.externalId ?? record.external_id) || undefined,
    lessonTitle: normalizeText(record.lessonTitle),
    title: normalizeText(record.title),
    description: normalizeText(record.description),
    level: normalizeLevel(record.level),
    orderIndex: normalizeNumber(record.orderIndex ?? record.order_index),
    passMark: normalizeNumber(record.passMark ?? record.pass_mark, 1),
    questionCount: normalizeNumber(record.questionCount, 0),
    maxScore: normalizeNumber(record.maxScore, 0),
    // Best score stays nullable so the path can distinguish untouched quizzes from attempted-but-failed ones.
    bestScore: normalizeNullableNumber(record.bestScore),
    attemptCount: normalizeNumber(record.attemptCount, 0),
    isLocked: Boolean(record.isLocked),
    isPassed: Boolean(record.isPassed),
    status: normalizeText(record.status) === "passed"
      ? "passed"
      : normalizeText(record.status) === "retry"
        ? "retry"
        : normalizeText(record.status) === "locked"
          ? "locked"
          : "ready"
  };
}

function normalizeQuestionResult(entry: unknown): QuizQuestionResult | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as JsonRecord;
  return {
    questionId: normalizeNumber(record.questionId ?? record.question_id),
    selectedOptionId: normalizeNullableNumber(record.selectedOptionId ?? record.selected_option_id),
    correctOptionId: normalizeNullableNumber(record.correctOptionId ?? record.correct_option_id),
    isCorrect: Boolean(record.isCorrect ?? record.is_correct),
    scoreAwarded: normalizeNumber(record.scoreAwarded ?? record.score_awarded, 0),
    explanation: normalizeText(record.explanation)
  };
}

export async function fetchQuizPath(): Promise<QuizPathResponse> {
  const data = await fetchJson("/api/quiz-path/");

  return {
    // Flat-map drops malformed rows quietly so one bad item does not blank the entire learning path.
    quizzes: Array.isArray(data.quizzes) ? data.quizzes.flatMap((entry) => {
      const normalized = normalizePathItem(entry);
      return normalized ? [normalized] : [];
    }) : [],
    recommendedQuizId: normalizeNullableNumber(data.recommendedQuizId),
    completedCount: normalizeNumber(data.completedCount, 0),
    totalCount: normalizeNumber(data.totalCount, 0)
  };
}

export async function fetchQuizDetail(quizId: number): Promise<QuizDetail> {
  const data = await fetchJson(`/api/quizzes/${quizId}/`);
  // Normalize questions first so derived totals always reflect the exact data the UI will render.
  const questions = Array.isArray(data.questions)
    ? data.questions.flatMap((entry) => {
      const normalized = normalizeQuestion(entry);
      return normalized ? [normalized] : [];
    })
    : [];

  return {
    id: normalizeNumber(data.id),
    externalId: normalizeText(data.externalId ?? data.external_id) || undefined,
    title: normalizeText(data.title),
    description: normalizeText(data.description),
    level: normalizeLevel(data.level),
    orderIndex: normalizeNumber(data.orderIndex ?? data.order_index),
    passMark: normalizeNumber(data.passMark ?? data.pass_mark, 1),
    maxScore: questions.reduce((sum, question) => sum + question.marks, 0),
    questionCount: questions.length,
    questions
  };
}

export async function submitQuizAnswers(quizId: number, payload: QuizSubmissionPayload): Promise<QuizSubmissionResult> {
  // Submission payload keeps the backend's snake_case contract at the network boundary and camelCase everywhere else.
  const response = await fetchWithCsrf(`/api/quizzes/${quizId}/submit/`, {
    method: "POST",
    body: JSON.stringify({
      answers: payload.answers.map((answer: QuizAnswerDraft) => ({
        question_id: answer.questionId,
        selected_option_id: answer.selectedOptionId
      }))
    })
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to submit quiz right now."));
  }

  return {
    attemptId: normalizeNumber(data.attemptId ?? data.attempt_id),
    totalScore: normalizeNumber(data.totalScore ?? data.total_score, 0),
    maxScore: normalizeNumber(data.maxScore, 0),
    passScore: normalizeNumber(data.passScore, 0),
    passed: Boolean(data.passed),
    correctCount: normalizeNumber(data.correctCount, 0),
    questionCount: normalizeNumber(data.questionCount, 0),
    // Malformed result rows are dropped individually so the summary can still render from the valid remainder.
    results: Array.isArray(data.results) ? data.results.flatMap((entry) => {
      const normalized = normalizeQuestionResult(entry);
      return normalized ? [normalized] : [];
    }) : []
  };
}

export async function fetchQuizFeedback(quizId: number, attemptId: number): Promise<QuizFeedbackResponse> {
  // Feedback is a mutation-style POST because the server derives content from a specific authenticated attempt record.
  const response = await fetchWithCsrf(`/api/quizzes/${quizId}/feedback/`, {
    method: "POST",
    body: JSON.stringify({
      attempt_id: attemptId
    })
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to load quiz feedback right now."));
  }

  // Validate the minimal contract explicitly so malformed responses fail before reaching the markdown renderer.
  if (typeof data.feedback !== "string") {
    throw new Error("Unexpected quiz feedback response format.");
  }

  return {
    feedback: data.feedback
  };
}
