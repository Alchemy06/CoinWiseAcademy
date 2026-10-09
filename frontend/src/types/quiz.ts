export type QuizLevel = "beginner" | "intermediate" | "advanced";

export type QuizProgressState = "locked" | "ready" | "passed" | "retry";

export interface QuizOption {
  id: number;
  text: string;
  isCorrect: boolean;
}

export interface QuizQuestion {
  id: number;
  text: string;
  questionType: "MCQ" | "SAQ";
  marks: number;
  explanation: string;
  options: QuizOption[];
}

export interface QuizPathItem {
  id: number;
  externalId?: string;
  lessonTitle: string;
  title: string;
  description: string;
  level: QuizLevel;
  orderIndex: number;
  passMark: number;
  questionCount: number;
  maxScore: number;
  bestScore: number | null;
  attemptCount: number;
  isLocked: boolean;
  isPassed: boolean;
  status: QuizProgressState;
}

export interface QuizStageGroup {
  level: QuizLevel;
  label: string;
  quizzes: QuizPathItem[];
}

export interface QuizPathResponse {
  quizzes: QuizPathItem[];
  recommendedQuizId: number | null;
  completedCount: number;
  totalCount: number;
}

export interface QuizDetail {
  id: number;
  externalId?: string;
  title: string;
  description: string;
  level: QuizLevel;
  orderIndex: number;
  passMark: number;
  maxScore: number;
  questionCount: number;
  questions: QuizQuestion[];
}

export interface QuizAnswerDraft {
  questionId: number;
  selectedOptionId: number;
}

export interface QuizSubmissionPayload {
  answers: QuizAnswerDraft[];
}

export interface QuizQuestionResult {
  questionId: number;
  selectedOptionId: number | null;
  correctOptionId: number | null;
  isCorrect: boolean;
  scoreAwarded: number;
  explanation: string;
}

export interface QuizSubmissionResult {
  attemptId: number;
  totalScore: number;
  maxScore: number;
  passScore: number;
  passed: boolean;
  correctCount: number;
  questionCount: number;
  results: QuizQuestionResult[];
}

export interface QuizFeedbackResponse {
  // Feedback is returned as one markdown string because the frontend already owns the rich-text block parser.
  feedback: string;
}
