import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedQuizRoute } from "../components/ProtectedQuizRoute";
import { I18nProvider } from "../i18n/provider";
import { primeQuizPathCacheForTests, resetQuizPathCacheForTests } from "../components/quiz/QuizModule";
import type { QuizDetail, QuizPathResponse, QuizSubmissionResult } from "../types/quiz";
import { QuizPage } from "./QuizPage";

const useAuthMock = vi.fn();
const fetchQuizPathMock = vi.fn<() => Promise<QuizPathResponse>>();
const fetchQuizDetailMock = vi.fn<(quizId: number) => Promise<QuizDetail>>();
const fetchQuizFeedbackMock = vi.fn<(quizId: number, attemptId: number) => Promise<{ feedback: string }>>();
const submitQuizAnswersMock = vi.fn<(quizId: number, payload: unknown) => Promise<QuizSubmissionResult>>();

vi.mock("../store/authStore", () => ({
  useAuth: () => useAuthMock()
}));

vi.mock("../utils/quiz", () => ({
  fetchQuizPath: () => fetchQuizPathMock(),
  fetchQuizDetail: (quizId: number) => fetchQuizDetailMock(quizId),
  fetchQuizFeedback: (quizId: number, attemptId: number) => fetchQuizFeedbackMock(quizId, attemptId),
  submitQuizAnswers: (quizId: number, payload: unknown) => submitQuizAnswersMock(quizId, payload)
}));

const sampleQuizPath: QuizPathResponse = {
  // Sample path mirrors lesson-driven unlocks while still keeping the first quiz in each stage visible as a placeholder.
  quizzes: [
    {
      id: 1,
      lessonTitle: "Crypto Foundations",
      title: "Beginner Basics",
      description: "Start with the vocabulary and the mental model.",
      level: "beginner",
      orderIndex: 1,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: false,
      isPassed: false,
      status: "ready"
    },
    {
      id: 2,
      lessonTitle: "Crypto Foundations",
      title: "Beginner Signals",
      description: "Apply the basics to simple market context.",
      level: "beginner",
      orderIndex: 2,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: false,
      isPassed: false,
      status: "ready"
    },
    {
      id: 3,
      lessonTitle: "Crypto Foundations",
      title: "Intermediate Signals",
      description: "Step into wallets, risk, and market clues.",
      level: "intermediate",
      orderIndex: 1,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: false,
      isPassed: false,
      status: "ready"
    },
    {
      id: 5,
      lessonTitle: "Crypto Foundations",
      title: "Advanced Judgement",
      description: "Handle ambiguity under pressure.",
      level: "advanced",
      orderIndex: 1,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: true,
      isPassed: false,
      status: "locked"
    },
    {
      id: 6,
      lessonTitle: "Crypto Foundations",
      title: "Advanced Review",
      description: "Stress test your final judgement.",
      level: "advanced",
      orderIndex: 2,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: true,
      isPassed: false,
      status: "locked"
    }
  ],
  recommendedQuizId: 1,
  completedCount: 0,
  totalCount: 4
};

const progressedQuizPath: QuizPathResponse = {
  // Once more lessons are completed, every unlocked quiz in that stage should stay visible without requiring quiz passes.
  quizzes: [
    {
      id: 1,
      lessonTitle: "Crypto Foundations",
      title: "Beginner Basics",
      description: "Start with the vocabulary and the mental model.",
      level: "beginner",
      orderIndex: 1,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: 2,
      attemptCount: 1,
      isLocked: false,
      isPassed: true,
      status: "passed"
    },
    {
      id: 2,
      lessonTitle: "Crypto Foundations",
      title: "Beginner Signals",
      description: "Apply the basics to simple market context.",
      level: "beginner",
      orderIndex: 2,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: false,
      isPassed: false,
      status: "ready"
    },
    {
      id: 7,
      lessonTitle: "Crypto Foundations",
      title: "Beginner Practice Set",
      description: "Push one step beyond the current frontier.",
      level: "beginner",
      orderIndex: 3,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: false,
      isPassed: false,
      status: "ready"
    },
    {
      id: 3,
      lessonTitle: "Crypto Foundations",
      title: "Intermediate Signals",
      description: "Step into wallets, risk, and market clues.",
      level: "intermediate",
      orderIndex: 1,
      passMark: 2,
      questionCount: 2,
      maxScore: 2,
      bestScore: null,
      attemptCount: 0,
      isLocked: false,
      isPassed: false,
      status: "ready"
    }
  ],
  recommendedQuizId: 2,
  completedCount: 1,
  totalCount: 4
};

const sampleQuizDetail: QuizDetail = {
  // Include correctness flags because the live session view styles the selected answer before auto-advance.
  id: 1,
  title: "Beginner Basics",
  description: "Start with the vocabulary and the mental model.",
  level: "beginner",
  orderIndex: 1,
  passMark: 2,
  maxScore: 2,
  questionCount: 2,
  questions: [
    {
      id: 11,
      text: "What does decentralisation change first?",
      questionType: "MCQ",
      marks: 1,
      explanation: "It changes who controls the ledger.",
      options: [
        { id: 101, text: "It removes network ownership from one central actor.", isCorrect: true },
        { id: 102, text: "It guarantees every token price will rise.", isCorrect: false }
      ]
    },
    {
      id: 12,
      text: "What should a beginner protect before anything else?",
      questionType: "MCQ",
      marks: 1,
      explanation: "Private keys control access to funds.",
      options: [
        { id: 103, text: "Their private keys or seed phrase.", isCorrect: true },
        { id: 104, text: "A prediction about the next bull market.", isCorrect: false }
      ]
    }
  ]
};

function LoginProbe() {
  const location = useLocation();
  // Render the redirected pathname so the test can assert the preserved destination without mocking router internals.
  return <p>{typeof location.state === "object" && location.state && "from" in location.state ? String((location.state as { from?: { pathname?: string } }).from?.pathname ?? "") : ""}</p>;
}

const renderWithI18n = (ui: Parameters<typeof render>[0]) => render(<I18nProvider>{ui}</I18nProvider>);

describe("QuizPage", () => {
  beforeEach(() => {
    // Reset every quiz mock per test so async feedback scenarios cannot inherit call state from earlier cases.
    resetQuizPathCacheForTests();
    useAuthMock.mockReset();
    fetchQuizPathMock.mockReset();
    fetchQuizDetailMock.mockReset();
    fetchQuizFeedbackMock.mockReset();
    submitQuizAnswersMock.mockReset();
  });

  it("redirects unauthenticated users to login while preserving the original quiz destination", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz/2"]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route
            path="/quiz/:quizId"
            element={
              <ProtectedQuizRoute>
                <QuizPage />
              </ProtectedQuizRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("/quiz/2")).toBeInTheDocument();
  });

  it("renders the learning path homepage with lesson-unlocked quizzes only", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue(sampleQuizPath);

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz"]}>
        <Routes>
          <Route path="/quiz" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: /A practical check on crypto risk and market judgement/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Beginner" })).toBeInTheDocument();
    expect(screen.getAllByText("Beginner Basics")).toHaveLength(2);
    expect(screen.getByText("1.1")).toBeInTheDocument();
    expect(screen.getByText("2.1")).toBeInTheDocument();
    expect(screen.getByText("3.1")).toBeInTheDocument();
    expect(screen.queryByText("Beginner Signals")).not.toBeInTheDocument();
    expect(screen.getByText("Advanced Judgement")).toBeInTheDocument();
    expect(screen.getAllByText("Locked")).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: "Start quiz" })[0]).toHaveAttribute("href", "/quiz/1");
  });

  it("shows every unlocked quiz in a stage even if earlier quiz results are the only ones passed", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue(progressedQuizPath);

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz"]}>
        <Routes>
          <Route path="/quiz" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect((await screen.findAllByText("Beginner Signals")).length).toBe(2);
    expect(screen.queryByText("Beginner Practice Set")).not.toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("Best score 2/2")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start quiz" })[0]).toHaveAttribute("href", "/quiz/2");
  });

  it("restores the hub scroll position to the last visited quiz card", async () => {
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewMock = vi.fn();

    // JSDOM cannot express real scroll position, so assert on the imperative browser API the module uses for restoration.
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock
    });

    try {
      useAuthMock.mockReturnValue({
        isAuthenticated: true,
        isLoading: false
      });
      fetchQuizPathMock.mockResolvedValue(progressedQuizPath);
      // Seed the in-memory path snapshot first so this test exercises the no-flash return path rather than the cold-load path.
      primeQuizPathCacheForTests(progressedQuizPath);

      renderWithI18n(
        <MemoryRouter initialEntries={[{ pathname: "/quiz", state: { focusQuizId: 2 } }]}>
          <Routes>
            <Route path="/quiz" element={<QuizPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Cached hub renders should skip the temporary loading copy that caused the visible flash on back navigation.
      expect(screen.queryByText("Loading your personalised path...")).not.toBeInTheDocument();
      expect(await screen.findByRole("heading", { level: 2, name: "Beginner" })).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: "auto",
          block: "start"
        });
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      });
    }
  });

  it("keeps start here visible with a lesson prompt when no quiz is unlocked yet", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue({
      quizzes: [
        {
          id: 1,
          lessonTitle: "Crypto Foundations",
          title: "Beginner Basics",
          description: "Start with the vocabulary and the mental model.",
          level: "beginner",
          orderIndex: 1,
          passMark: 2,
          questionCount: 2,
          maxScore: 2,
          bestScore: null,
          attemptCount: 0,
          isLocked: true,
          isPassed: false,
          status: "locked"
        },
        {
          id: 3,
          lessonTitle: "Crypto Foundations",
          title: "Intermediate Signals",
          description: "Step into wallets, risk, and market clues.",
          level: "intermediate",
          orderIndex: 1,
          passMark: 2,
          questionCount: 2,
          maxScore: 2,
          bestScore: null,
          attemptCount: 0,
          isLocked: true,
          isPassed: false,
          status: "locked"
        },
        {
          id: 5,
          lessonTitle: "Crypto Foundations",
          title: "Advanced Judgement",
          description: "Handle ambiguity under pressure.",
          level: "advanced",
          orderIndex: 1,
          passMark: 2,
          questionCount: 2,
          maxScore: 2,
          bestScore: null,
          attemptCount: 0,
          isLocked: true,
          isPassed: false,
          status: "locked"
        }
      ],
      recommendedQuizId: null,
      completedCount: 0,
      totalCount: 3
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz"]}>
        <Routes>
          <Route path="/quiz" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 2, name: "Start here" })).toBeInTheDocument();
    expect(screen.getAllByText("Locked").length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText("Finish the matching lesson first, then come back here to start this quiz.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to lesson" })).toHaveAttribute("href", "/learn");
  });

  it("renders the completion empty state when there is no recommended quiz and nothing is locked", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue({
      quizzes: [
        {
          id: 1,
          lessonTitle: "Crypto Foundations",
          title: "Beginner Basics",
          description: "Start with the vocabulary and the mental model.",
          level: "beginner",
          orderIndex: 1,
          passMark: 2,
          questionCount: 2,
          maxScore: 2,
          bestScore: 2,
          attemptCount: 1,
          isLocked: false,
          isPassed: true,
          status: "passed"
        }
      ],
      recommendedQuizId: null,
      completedCount: 1,
      totalCount: 1
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz"]}>
        <Routes>
          <Route path="/quiz" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 2, name: "Start here" })).toBeInTheDocument();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Start quiz" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Retry quiz" })).not.toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
  });

  it("submits answers and renders the results view without a next quiz action", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue(sampleQuizPath);
    fetchQuizDetailMock.mockResolvedValue(sampleQuizDetail);
    fetchQuizFeedbackMock.mockResolvedValue({
      feedback: "Your result is **2/2**.\n\n## Question review\n\n1. **What does decentralisation change first?**\n\nYour answer: It removes network ownership from one central actor. ✅\n\nCorrect answer: It removes network ownership from one central actor.\n\nExplanation: It changes who controls the ledger.\n\n2. **What should a beginner protect before anything else?**\n\nYour answer: Their private keys or seed phrase. ✅\n\nCorrect answer: Their private keys or seed phrase.\n\nExplanation: Private keys control access to funds.\n\n## Weak points to reinforce\n\n- Keep reinforcing private key ownership and decentralisation.\n\n## Quick memory cues\n\n- Decentralisation changes who controls the ledger.\n- Private keys protect access to funds."
    });
    submitQuizAnswersMock.mockResolvedValue({
      attemptId: 55,
      totalScore: 2,
      maxScore: 2,
      passScore: 2,
      passed: true,
      correctCount: 2,
      questionCount: 2,
      results: [
        {
          questionId: 11,
          selectedOptionId: 101,
          correctOptionId: 101,
          isCorrect: true,
          scoreAwarded: 1,
          explanation: "It changes who controls the ledger."
        },
        {
          questionId: 12,
          selectedOptionId: 103,
          correctOptionId: 103,
          isCorrect: true,
          scoreAwarded: 1,
          explanation: "Private keys control access to funds."
        }
      ]
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz/1"]}>
        <Routes>
          <Route path="/quiz/:quizId" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 3, name: "What does decentralisation change first?" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Previous" })).not.toBeInTheDocument();

    await user.click(screen.getByLabelText("It removes network ownership from one central actor."));
    expect(await screen.findByRole("heading", { level: 3, name: "What should a beginner protect before anything else?" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Their private keys or seed phrase."));

    await waitFor(() => {
      expect(submitQuizAnswersMock).toHaveBeenCalledWith(1, {
        answers: [
          { questionId: 11, selectedOptionId: 101 },
          { questionId: 12, selectedOptionId: 103 }
        ]
      });
    });
    expect(await screen.findByRole("heading", { level: 1, name: "Beginner Basics Results" })).toBeInTheDocument();
    expect(screen.getByText("Pass mark")).toBeInTheDocument();
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
    expect(screen.getAllByText("2/2")).toHaveLength(2);
    const viewResultButton = screen.getByRole("button", { name: "View result" });
    const retakeButton = screen.getByRole("button", { name: "Retake quiz" });
    expect(viewResultButton.compareDocumentPosition(retakeButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start next quiz" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Question review" })).not.toBeInTheDocument();

    await user.click(viewResultButton);

    // Feedback is lazy-loaded from the attempt record, so the result view should not request it before the CTA is used.
    expect(fetchQuizFeedbackMock).toHaveBeenCalledWith(1, 55);
    expect(await screen.findByRole("heading", { level: 4, name: "Question review" })).toBeInTheDocument();
    expect(screen.getByText("Weak points to reinforce")).toBeInTheDocument();
    expect(screen.getByText("Quick memory cues")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "View result" })).not.toBeInTheDocument();
  });

  it("locks each question after the first selection so the answer cannot be changed during auto-advance", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue(sampleQuizPath);
    fetchQuizDetailMock.mockResolvedValue(sampleQuizDetail);

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz/1"]}>
        <Routes>
          <Route path="/quiz/:quizId" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    const incorrectOption = await screen.findByLabelText("It guarantees every token price will rise.");
    const correctOption = screen.getByLabelText("It removes network ownership from one central actor.");

    await user.click(incorrectOption);

    expect(incorrectOption).toBeChecked();
    expect(incorrectOption).toBeDisabled();
    expect(correctOption).toBeDisabled();

    await user.click(screen.getByText("It removes network ownership from one central actor."));

    expect(incorrectOption).toBeChecked();
    expect(correctOption).not.toBeChecked();
  });

  it("shows thinking state while loading feedback and keeps action buttons in place until feedback arrives", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue(sampleQuizPath);
    fetchQuizDetailMock.mockResolvedValue(sampleQuizDetail);

    let resolveFeedback: ((value: { feedback: string }) => void) | null = null;
    fetchQuizFeedbackMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          // Hold the promise open so the test can assert on the intermediate loading layout before resolution.
          resolveFeedback = resolve;
        })
    );
    submitQuizAnswersMock.mockResolvedValue({
      attemptId: 55,
      totalScore: 2,
      maxScore: 2,
      passScore: 2,
      passed: true,
      correctCount: 2,
      questionCount: 2,
      results: []
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz/1"]}>
        <Routes>
          <Route path="/quiz/:quizId" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 3, name: "What does decentralisation change first?" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("It removes network ownership from one central actor."));
    expect(await screen.findByRole("heading", { level: 3, name: "What should a beginner protect before anything else?" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Their private keys or seed phrase."));
    expect(await screen.findByRole("button", { name: "View result" })).toBeInTheDocument();
    const topBackToPathLink = screen.getByRole("link", { name: "Back to path" });

    await user.click(screen.getByRole("button", { name: "View result" }));

    expect(await screen.findByText("Thinking")).toBeInTheDocument();
    // While feedback is loading, the action row is intentionally withheld to avoid duplicate clicks and layout jumps.
    expect(screen.queryByRole("button", { name: "View result" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retake quiz" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start next quiz" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to path" })).toBe(topBackToPathLink);

    resolveFeedback?.({
      feedback: "Your result is **2/2**.\n\n## Question review\n\n1. **One**\n\nYour answer: A ✅\n\nCorrect answer: A\n\nExplanation: A.\n\n## Weak points to reinforce\n\n- None.\n\n## Quick memory cues\n\n- Cue."
    });

    expect(await screen.findByRole("heading", { level: 4, name: "Question review" })).toBeInTheDocument();
    const retakeButton = screen.getByRole("button", { name: "Retake quiz" });
    const movedBackToPathLink = screen.getByRole("link", { name: "Back to path" });

    expect(topBackToPathLink).not.toBeInTheDocument();
    expect(movedBackToPathLink).not.toBe(topBackToPathLink);
    expect(retakeButton.compareDocumentPosition(movedBackToPathLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("shows retry UI when quiz feedback fails without blocking retake", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchQuizPathMock.mockResolvedValue(sampleQuizPath);
    fetchQuizDetailMock.mockResolvedValue(sampleQuizDetail);
    fetchQuizFeedbackMock.mockRejectedValue(new Error("Feedback is temporarily unavailable."));
    submitQuizAnswersMock.mockResolvedValue({
      attemptId: 55,
      totalScore: 2,
      maxScore: 2,
      passScore: 2,
      passed: true,
      correctCount: 2,
      questionCount: 2,
      results: []
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/quiz/1"]}>
        <Routes>
          <Route path="/quiz/:quizId" element={<QuizPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 3, name: "What does decentralisation change first?" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("It removes network ownership from one central actor."));
    expect(await screen.findByRole("heading", { level: 3, name: "What should a beginner protect before anything else?" })).toBeInTheDocument();
    await user.click(screen.getByLabelText("Their private keys or seed phrase."));
    await user.click(await screen.findByRole("button", { name: "View result" }));

    expect(await screen.findByText("Feedback is temporarily unavailable.")).toBeInTheDocument();
    // Failure keeps surrounding result actions available because the learner can still retry feedback or retake immediately.
    expect(screen.getByRole("button", { name: "Try again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retake quiz" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start next quiz" })).not.toBeInTheDocument();
  });

  it("scrolls the next question into view after auto-advancing", async () => {
    const user = userEvent.setup();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    const scrollIntoViewMock = vi.fn();
    // Resolve the scheduled frame immediately so the test can observe the scroll side effect without waiting on the browser clock.
    const requestAnimationFrameSpy = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    const cancelAnimationFrameSpy = vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => {});

    // JSDOM has no native scroll implementation, so replace it with a spy and assert the intended alignment request.
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoViewMock
    });

    try {
      useAuthMock.mockReturnValue({
        isAuthenticated: true,
        isLoading: false
      });
      fetchQuizPathMock.mockResolvedValue(sampleQuizPath);
      fetchQuizDetailMock.mockResolvedValue(sampleQuizDetail);

      renderWithI18n(
        <MemoryRouter initialEntries={["/quiz/1"]}>
          <Routes>
            <Route path="/quiz/:quizId" element={<QuizPage />} />
          </Routes>
        </MemoryRouter>
      );

      // Assert against the question copy itself because the compact session layout no longer renders a separate "Question X" heading.
      expect(await screen.findByRole("heading", { level: 3, name: "What does decentralisation change first?" })).toBeInTheDocument();
      scrollIntoViewMock.mockClear();

      await user.click(screen.getByLabelText("It removes network ownership from one central actor."));

      expect(await screen.findByRole("heading", { level: 3, name: "What should a beginner protect before anything else?" })).toBeInTheDocument();
      await waitFor(() => {
        expect(scrollIntoViewMock).toHaveBeenCalledWith({
          behavior: "smooth",
          block: "start"
        });
      });
    } finally {
      Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
        configurable: true,
        value: originalScrollIntoView
      });
      requestAnimationFrameSpy.mockRestore();
      cancelAnimationFrameSpy.mockRestore();
    }
  });
});
