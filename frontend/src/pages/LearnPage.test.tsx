import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProtectedQuizRoute } from "../components/ProtectedQuizRoute";
import { I18nProvider } from "../i18n/provider";
import type { LearnCatalogResponse, LearnProgressResponse } from "../types/learn";
import type { QuizPathResponse } from "../types/quiz";
import { LearnPage } from "./LearnPage";

const useAuthMock = vi.fn();
const fetchLearnCatalogMock = vi.fn<() => Promise<LearnCatalogResponse>>();
const fetchLearnProgressMock = vi.fn<() => Promise<LearnProgressResponse>>();
const fetchQuizPathMock = vi.fn<() => Promise<QuizPathResponse>>();
const markLearnUnitDoneMock = vi.fn<(unitExternalId: string) => Promise<{ unitExternalId: string; completedAt: string }>>();
const intersectionObservers: MockIntersectionObserver[] = [];
const scrollToMock = vi.fn();
const scrollIntoViewMock = vi.fn();

vi.mock("../store/authStore", () => ({
  useAuth: () => useAuthMock()
}));

vi.mock("../utils/learn", () => ({
  fetchLearnCatalog: () => fetchLearnCatalogMock(),
  fetchLearnProgress: () => fetchLearnProgressMock(),
  markLearnUnitDone: (unitExternalId: string) => markLearnUnitDoneMock(unitExternalId)
}));

vi.mock("../utils/quiz", () => ({
  fetchQuizPath: () => fetchQuizPathMock()
}));

const sampleCatalog: LearnCatalogResponse = {
  tracks: [
    {
      externalId: "track-beginner",
      title: "Beginner",
      level: "beginner",
      orderIndex: 1,
      units: [
        {
          externalId: "beginner-01",
          title: "Wallet Basics",
          level: "beginner",
          orderIndex: 1,
          excerpt: "Learn the wallet mental model before you move money.",
          estimatedMinutes: 5,
          bodyMarkdown: [
            "# Wallet Basics",
            "",
            "Understand the wallet before you use it.",
            "",
            "## Core checks",
            "",
            "1. Verify the destination",
            "2. Confirm the network",
            "",
            "### FAQ",
            "",
            "> Never rush a transfer.",
            "",
            "Use **care** before moving funds.",
            "",
            "#### Access to global funds",
            "",
            "Built by _ConsenSys_ and [ENS](https://example.test)."
          ].join("\n"),
          quizExternalId: "quiz-beginner-01"
        },
        {
          externalId: "beginner-02",
          title: "Sending Assets",
          level: "beginner",
          orderIndex: 2,
          excerpt: "Send assets carefully and verify every destination.",
          estimatedMinutes: 6,
          bodyMarkdown: "# Sending Assets\n\nAlways verify the receiving address.",
          quizExternalId: "quiz-beginner-02"
        }
      ]
    },
    {
      externalId: "track-intermediate",
      title: "Intermediate",
      level: "intermediate",
      orderIndex: 2,
      units: [
        {
          externalId: "intermediate-01",
          title: "Bridge Risk",
          level: "intermediate",
          orderIndex: 1,
          excerpt: "Read the operational and custody trade-offs.",
          estimatedMinutes: 7,
          bodyMarkdown: "# Bridge Risk\n\nBridge risk grows when trust assumptions change.",
          quizExternalId: "quiz-intermediate-01"
        }
      ]
    }
  ]
};

const sampleQuizPath: QuizPathResponse = {
  quizzes: [
    {
      id: 11,
      externalId: "quiz-beginner-01",
      lessonTitle: "Wallet Basics",
      title: "Wallet Basics Quiz",
      description: "Check the wallet basics.",
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
      id: 12,
      externalId: "quiz-beginner-02",
      lessonTitle: "Sending Assets",
      title: "Sending Assets Quiz",
      description: "Check transfer safety.",
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
      id: 21,
      externalId: "quiz-intermediate-01",
      lessonTitle: "Bridge Risk",
      title: "Bridge Risk Quiz",
      description: "Check bridge risk understanding.",
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
  recommendedQuizId: 11,
  completedCount: 0,
  totalCount: 3
};

function LoginProbe() {
  const location = useLocation();
  return <p>{typeof location.state === "object" && location.state && "from" in location.state ? String((location.state as { from?: { pathname?: string } }).from?.pathname ?? "") : ""}</p>;
}

const renderWithI18n = (ui: Parameters<typeof render>[0]) => render(<I18nProvider>{ui}</I18nProvider>);

class MockIntersectionObserver {
  callback: IntersectionObserverCallback;
  observedElements = new Set<Element>();

  constructor(callback: IntersectionObserverCallback) {
    // Keep a registry of every observer so tests can manually drive the end-of-reading completion signal.
    this.callback = callback;
    intersectionObservers.push(this);
  }

  disconnect() {
    this.observedElements.clear();
  }

  observe(element: Element) {
    this.observedElements.add(element);
  }

  takeRecords(): IntersectionObserverEntry[] {
    return [];
  }

  unobserve(element: Element) {
    this.observedElements.delete(element);
  }
}

function triggerIntersection(element: Element, isIntersecting = true) {
  // Fire only observers that actually watch this sentinel so one test trigger cannot leak into unrelated cases.
  intersectionObservers.forEach((observer) => {
    if (!observer.observedElements.has(element)) {
      return;
    }

    observer.callback([
      {
        isIntersecting,
        target: element,
        intersectionRatio: isIntersecting ? 1 : 0
      } as IntersectionObserverEntry
    ], observer as unknown as IntersectionObserver);
  });
}

describe("LearnPage", () => {
  beforeEach(() => {
    // Reset every shared observer/mock so route-detail tests cannot inherit completion state from earlier cases.
    intersectionObservers.length = 0;
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    Object.defineProperty(window, "scrollTo", {
      value: scrollToMock,
      writable: true
    });
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      value: scrollIntoViewMock,
      writable: true
    });
    scrollToMock.mockReset();
    scrollIntoViewMock.mockReset();
    useAuthMock.mockReset();
    fetchLearnCatalogMock.mockReset();
    fetchLearnProgressMock.mockReset();
    fetchQuizPathMock.mockReset();
    markLearnUnitDoneMock.mockReset();
    fetchQuizPathMock.mockResolvedValue(sampleQuizPath);
  });

  it("redirects unauthenticated users to login while preserving the original learn destination", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/beginner-01"]}>
        <Routes>
          <Route path="/login" element={<LoginProbe />} />
          <Route
            path="/learn/:unitExternalId"
            element={
              <ProtectedQuizRoute>
                <LearnPage />
              </ProtectedQuizRoute>
            }
          />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("/learn/beginner-01")).toBeInTheDocument();
  });

  it("renders the learn hub with recommended lesson, grouped chapters, and done labels", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: ["beginner-01"]
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn"]}>
        <Routes>
          <Route path="/learn" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: /Read the core crypto ideas before you test them/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Beginner" })).toBeInTheDocument();
    expect(screen.getAllByText("Sending Assets")).toHaveLength(2);
    expect(screen.getByText("1 of 3 lessons done")).toBeInTheDocument();
    expect(screen.getAllByText("Done")).toHaveLength(1);
    expect(screen.queryByText("Send assets carefully and verify every destination.")).not.toBeInTheDocument();
  });

  it("shows an English completion state in the hero when every lesson is done", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: ["beginner-01", "beginner-02", "intermediate-01"]
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn"]}>
        <Routes>
          <Route path="/learn" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByText("Completed")).toBeInTheDocument();
    expect(screen.getByText("You have completed every lesson in the current path.")).toBeInTheDocument();
    expect(screen.queryByText("已完成")).not.toBeInTheDocument();
  });

  it("scrolls to the top when entering a lesson detail page", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: []
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/beginner-01"]}>
        <Routes>
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Wallet Basics" })).toBeInTheDocument();
    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    });
  });

  it("removes the generic chapter label from lesson pages", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: []
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/beginner-01"]}>
        <Routes>
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Wallet Basics" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 2, name: "Chapter" })).not.toBeInTheDocument();
  });

  it("does not duplicate track title and level labels in the lesson header", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: []
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/intermediate-01"]}>
        <Routes>
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Bridge Risk" })).toBeInTheDocument();
    expect(screen.getAllByText("Intermediate")).toHaveLength(1);
  });

  it("marks a lesson as done from the detail view and keeps the done state after returning to the hub", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: []
    });
    markLearnUnitDoneMock.mockResolvedValue({
      unitExternalId: "beginner-01",
      completedAt: "2026-04-10T12:00:00Z"
    });

    const view = renderWithI18n(
      <MemoryRouter initialEntries={["/learn/beginner-01"]}>
        <Routes>
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Wallet Basics" })).toBeInTheDocument();
    const sentinel = view.container.querySelector(".learn-reading-end-sentinel");
    expect(sentinel).not.toBeNull();
    // Simulate reaching the footer sentinel so the detail page auto-completes the lesson just like a real reader would.
    triggerIntersection(sentinel as Element);

    await waitFor(() => {
      expect(markLearnUnitDoneMock).toHaveBeenCalledWith("beginner-01");
    });
    expect((await screen.findAllByText("Done")).length).toBe(1);

    await user.click(screen.getByRole("link", { name: "Back to learn" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Beginner" })).toBeInTheDocument();
    expect(screen.getAllByText("Done")).toHaveLength(1);
  });

  it("returns to the originating track section instead of preserving the footer scroll position", async () => {
    const user = userEvent.setup();
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: []
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/intermediate-01"]}>
        <Routes>
          <Route path="/learn" element={<LearnPage />} />
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Bridge Risk" })).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: "Back to learn" }));

    expect(await screen.findByRole("heading", { level: 2, name: "Intermediate" })).toBeInTheDocument();
    // The hub should restore section context directly rather than relying on browser scroll restoration from the detail route.
    expect(scrollIntoViewMock).toHaveBeenCalledWith({
      block: "start",
      behavior: "auto"
    });
  });

  it("keeps only the quiz link in the footer when the user reaches the last lesson", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: ["beginner-01", "beginner-02"]
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/intermediate-01"]}>
        <Routes>
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Bridge Risk" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to quiz" })).toHaveAttribute("href", "/quiz/21");
    expect(screen.queryByRole("link", { name: "Next lesson" })).not.toBeInTheDocument();
  });

  it("falls back to the quiz hub when the lesson quiz is missing from the live path", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: []
    });
    // Remove the lesson quiz from the live path to prove the footer CTA degrades to the generic quiz hub.
    fetchQuizPathMock.mockResolvedValue({
      ...sampleQuizPath,
      quizzes: sampleQuizPath.quizzes.filter((quiz) => quiz.externalId !== "quiz-beginner-01")
    });

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/beginner-01"]}>
        <Routes>
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Wallet Basics" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to quiz" })).toHaveAttribute("href", "/quiz");
  });

  it("keeps lesson content visible when learn progress fails to load", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockRejectedValue(new Error("Unable to load lesson completion right now."));

    renderWithI18n(
      <MemoryRouter initialEntries={["/learn/beginner-01"]}>
        <Routes>
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Wallet Basics" })).toBeInTheDocument();
    expect(screen.getByText("Understand the wallet before you use it.")).toBeInTheDocument();
  });

  it("renders lesson markdown with downgraded headings, ordered steps, quotes, and bold text", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false
    });
    fetchLearnCatalogMock.mockResolvedValue(sampleCatalog);
    fetchLearnProgressMock.mockResolvedValue({
      completedUnitExternalIds: []
    });

    const view = renderWithI18n(
      <MemoryRouter initialEntries={["/learn/beginner-01"]}>
        <Routes>
          <Route path="/learn/:unitExternalId" element={<LearnPage />} />
        </Routes>
      </MemoryRouter>
    );

    expect(await screen.findByRole("heading", { level: 1, name: "Wallet Basics" })).toBeInTheDocument();
    // Source headings stay one level below the page title so the lesson body preserves a clean article outline.
    expect(screen.getByRole("heading", { level: 2, name: "Wallet Basics" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Core checks" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 4, name: "FAQ" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 5, name: "Access to global funds" })).toBeInTheDocument();
    expect(view.container.querySelector("ol.learn-rich-text-list.ordered")).not.toBeNull();
    expect(screen.getByText("Never rush a transfer.")).toBeInTheDocument();
    expect(view.container.querySelector(".learn-rich-text strong")?.textContent).toBe("care");
    expect(view.container.querySelector(".learn-rich-text em")?.textContent).toBe("ConsenSys");
    expect(view.container.querySelector(".learn-rich-text a")?.textContent).toBe("ENS");
    expect(view.container.querySelector(".learn-rich-text")).not.toBeNull();
  });
});
