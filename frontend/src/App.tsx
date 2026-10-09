import { type CSSProperties, useEffect, useRef, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import { ChatWidget } from "./components/ChatWidget";
import { ProtectedQuizRoute } from "./components/ProtectedQuizRoute";
import { ScrollToTopOnRouteChange } from "./components/ScrollToTopOnRouteChange";
import { SUPPORTED_LOCALES, type Locale } from "./i18n/config";
import { useI18n } from "./i18n/provider";
import { CryptoMarketStructurePage } from "./pages/CryptoMarketStructurePage";
import { HomePage } from "./pages/HomePage";
import { LearnPage } from "./pages/LearnPage";
import { RisksPage } from "./pages/RisksPage";
import { LoginPage } from "./pages/LoginPage";
import { SignUpPage } from "./pages/SignUpPage";
import { useAuth } from "./store/authStore";
import { useChatStore } from "./store/chatStore";
import { DictionaryPage } from "./pages/DictionaryPage";
import { QuizPage } from "./pages/QuizPage";
import { fetchLearnCatalog, fetchLearnProgress } from "./utils/learn";
import { fetchQuizPath } from "./utils/quiz";
import { DashboardPage } from "./pages/DashboardPage";
import { TradingFloorPage } from "./features/trading-floor/TradingFloorPage";
import { CrashPage } from "./pages/CrashPage";
import { MarketReplayPage } from "./features/market-replay/MarketReplayPage";
import { VolatilityChallengePage } from "./features/volatility-challenge/VolatilityChallengePage";
import { LeaderboardPage } from "./pages/LeaderboardPage";
import { ProfilePage } from "./pages/ProfilePage";
import { CrashTimelinePage as EditorialCrashTimelinePage } from "./features/crash-timeline/CrashTimelinePage";

const AVATAR_PALETTE = [
  "#1a73e8",
  "#188038",
  "#c5221f",
  "#e37400",
  "#9334e6",
  "#00796b",
  "#b06000",
  "#0b57d0"
];

const THEME_STORAGE_KEY = "crypto-or-no-crypto-theme-preference-v1";

type ThemePreference = "light" | "dark" | "system";

interface ProfileProgressMetric {
  completed: number;
  total: number;
}

interface ProfileProgressState {
  learn: ProfileProgressMetric;
  quiz: ProfileProgressMetric;
  isLoading: boolean;
}

function getStoredThemePreference(): ThemePreference {
  // Read from storage lazily so the first render can honor the user's last choice without a follow-up repaint.
  if (typeof window === "undefined") {
    return "system";
  }

  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return stored === "light" || stored === "dark" || stored === "system" ? stored : "system";
}

function getSystemTheme(): Exclude<ThemePreference, "system"> {
  // SSR shells fall back to light so the client can reconcile once browser media queries become available.
  if (typeof window === "undefined") {
    return "light";
  }

  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function resolveTheme(preference: ThemePreference): Exclude<ThemePreference, "system"> {
  // Keep the persisted preference and the applied document theme separate so "system" can still resolve to a concrete palette.
  return preference === "system" ? getSystemTheme() : preference;
}

function getDisplayLabel(displayName?: string, email?: string): string {
  // The avatar button and dropdown header both need one stable non-empty label even for partially configured accounts.
  const nextDisplayName = displayName?.trim();
  if (nextDisplayName) {
    return nextDisplayName;
  }

  return email?.trim() || "User";
}

function getAvatarInitial(label: string): string {
  // Prefer a Latin letter when available so mixed labels such as emails still produce a cleaner single-character badge.
  const matchedCharacter = label.trim().match(/[A-Za-z]/u)?.[0];
  return (matchedCharacter ?? label.trim().charAt(0) ?? "U").toUpperCase();
}

function getAvatarColor(label: string): string {
  // Derive colors from the label itself so the badge stays visually stable across sessions without persisting extra profile state.
  const normalizedLabel = label.trim().toLowerCase();
  const hash = Array.from(normalizedLabel).reduce((total, character, index) => {
    return total + character.charCodeAt(0) * (index + 1);
  }, 0);

  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

function clampProgress(completed: number, total: number): ProfileProgressMetric {
  // Defensive normalization keeps partially loaded or malformed API payloads from rendering impossible progress bars.
  const safeTotal = Number.isFinite(total) && total > 0 ? Math.floor(total) : 0;
  const safeCompleted = Number.isFinite(completed) && completed > 0 ? Math.floor(completed) : 0;

  if (safeTotal === 0) {
    return {
      completed: 0,
      total: 0
    };
  }

  return {
    completed: Math.min(safeCompleted, safeTotal),
    total: safeTotal
  };
}

function createProfileProgressState(): ProfileProgressState {
  // Keep one shared empty shape so menu-open fetches can transition between idle and loading without ad-hoc fallbacks.
  return {
    learn: { completed: 0, total: 0 },
    quiz: { completed: 0, total: 0 },
    isLoading: false
  };
}

function getProgressPercent({ completed, total }: ProfileProgressMetric): number {
  // Return a rounded whole-number percentage because the compact dropdown meter has no room for decimal noise.
  if (total <= 0) {
    return 0;
  }

  return Math.round((completed / total) * 100);
}

function App() {
  // Read auth state once at the shell level so header actions can react without prop-drilling through routes.
  const { isAuthenticated, isLoading: isAuthLoading, logout, user } = useAuth();
  const { locale, localeLabel, setLocale, tx } = useI18n();
  const {
    state: { dockedWidth, isDocked, isWidgetOpen }
  } = useChatStore();
  const hasDockedSidebar = isDocked && isWidgetOpen;
  // Reuse one derived identity bundle so the compact avatar trigger and expanded menu header never disagree.
  const displayLabel = getDisplayLabel(user?.profile.display_name, user?.email);
  const avatarInitial = getAvatarInitial(displayLabel);
  const avatarColor = getAvatarColor(displayLabel);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => getStoredThemePreference());
  const [profileProgress, setProfileProgress] = useState<ProfileProgressState>(createProfileProgressState);
  const userMenuRef = useRef<HTMLDivElement | null>(null);
  const appShellStyle = {
    ["--chatbot-layout-offset" as const]: hasDockedSidebar ? `${dockedWidth}px` : "0px"
  } as CSSProperties;
  const userAvatarStyle = {
    ["--user-avatar-color" as const]: avatarColor
  } as CSSProperties;

  useEffect(() => {
    // Write the resolved theme to the root dataset so all CSS tokens switch together without route-level plumbing.
    const root = document.documentElement;
    const applyTheme = (): void => {
      root.dataset.theme = resolveTheme(themePreference);
    };

    applyTheme();
    window.localStorage.setItem(THEME_STORAGE_KEY, themePreference);

    if (themePreference !== "system") {
      return undefined;
    }

    // Only subscribe to system theme changes while the preference delegates to the OS.
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (): void => {
      applyTheme();
    };

    mediaQuery.addEventListener("change", handleChange);
    return () => {
      mediaQuery.removeEventListener("change", handleChange);
    };
  }, [themePreference]);

  useEffect(() => {
    if (!isAuthenticated || !isUserMenuOpen) {
      return undefined;
    }

    // Guard post-await state writes so quickly closing the menu or swapping accounts does not flash stale progress.
    let cancelled = false;

    const loadProfileProgress = async (): Promise<void> => {
      setProfileProgress((current) => ({
        ...current,
        isLoading: true
      }));

      // Load learn catalog, learn completion, and quiz-path progress together so the dropdown opens with one coherent snapshot.
      const [catalogResult, learnProgressResult, quizPathResult] = await Promise.allSettled([
        fetchLearnCatalog(),
        fetchLearnProgress(),
        fetchQuizPath()
      ]);

      if (cancelled) {
        return;
      }

      setProfileProgress((current) => {
        const nextLearn = (() => {
          if (catalogResult.status !== "fulfilled" || learnProgressResult.status !== "fulfilled") {
            // Preserve the last stable learn numbers if either dependency fails so the menu does not regress to zero.
            return current.learn;
          }

          const totalUnits = catalogResult.value.tracks.reduce((sum, track) => sum + track.units.length, 0);
          return clampProgress(learnProgressResult.value.completedUnitExternalIds.length, totalUnits);
        })();

        const nextQuiz = (() => {
          if (quizPathResult.status !== "fulfilled") {
            // Quiz progress can refresh independently, so keep the previous metric when only this request errors.
            return current.quiz;
          }

          return clampProgress(quizPathResult.value.completedCount, quizPathResult.value.totalCount);
        })();

        return {
          learn: nextLearn,
          quiz: nextQuiz,
          isLoading: false
        };
      });
    };

    void loadProfileProgress();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isUserMenuOpen, user?.id]);

  useEffect(() => {
    if (!isUserMenuOpen) {
      return undefined;
    }

    // Close the floating menu on outside clicks or Escape so it behaves like a lightweight popover rather than a persistent panel.
    const handlePointerDown = (event: MouseEvent): void => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsUserMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isUserMenuOpen]);

  const handleThemeSelect = (nextTheme: ThemePreference): void => {
    // Keep selection handling tiny so each menu option can stay declarative in JSX.
    setThemePreference(nextTheme);
  };

  const handleLogout = async (): Promise<void> => {
    // Close first so auth transitions never leave the stale dropdown floating over the guest header.
    setIsUserMenuOpen(false);
    await logout();
  };

  const handleUserMenuNavigate = (): void => {
    // Collapse the dropdown immediately so route changes do not leave the menu hanging over the next page.
    setIsUserMenuOpen(false);
  };

  const handleLanguageSelect = (nextLocale: Locale): void => {
    setLocale(nextLocale);
  };

  const learnPercent = getProgressPercent(profileProgress.learn);
  const quizPercent = getProgressPercent(profileProgress.quiz);
  // Show a lightweight pending state only before the first successful payload lands; later refreshes keep the last known numbers visible.
  const isLearnProgressPending = profileProgress.isLoading && profileProgress.learn.total === 0;
  const isQuizProgressPending = profileProgress.isLoading && profileProgress.quiz.total === 0;

  return (
    <div className={`app-shell ${hasDockedSidebar ? "with-chat-sidebar" : ""}`} style={appShellStyle}>
      {/* Route transitions should reset scroll so each page starts from its heading instead of inheriting deep scroll positions. */}
      <ScrollToTopOnRouteChange />
      <aside className="side-nav">
        <div className="side-nav-brand">
          <h1>Coin Wise Academy</h1>
        </div>

        <nav aria-label="Primary navigation" className="side-nav-links">
          <NavLink to="/" end>
            {tx("Home")}
          </NavLink>

          <div className="side-nav-group">
            <div className="side-nav-group-label">{tx("Study")}</div>
            <NavLink to="/market">{tx("Market")}</NavLink>
            <NavLink to="/learn">{tx("Learn")}</NavLink>
            <NavLink to="/quiz">{tx("Quiz")}</NavLink>
            <NavLink to="/dictionary">{tx("Dictionary")}</NavLink>
          </div>

          <div className="side-nav-group">
            <div className="side-nav-group-label">{tx("Scenarios")}</div>
            <NavLink to="/crashes">{tx("Timeline")}</NavLink>
            <NavLink to="/covid-crash">{tx("Crash Lab")}</NavLink>
            <NavLink to="/market-replay">{tx("Market Replay")}</NavLink>
          </div>
        </nav>
      </aside>

      <div className="main-panel">
        <header className="app-topbar">
          <div className="app-topbar-spacer" aria-hidden="true" />

          <div className="top-right-actions">
            {/* Keep header chrome stable during auth boot so the page does not flash between guest/user states. */}
            {isAuthLoading ? null : isAuthenticated ? (
              <div className="auth-user-menu" ref={userMenuRef}>
                {/* Collapse account actions behind the avatar so the topbar stays compact while still exposing theme/logout controls. */}
                <button
                  aria-expanded={isUserMenuOpen}
                  aria-haspopup="menu"
                  aria-label={`${tx("User")} avatar for ${displayLabel}`}
                  className="auth-user-avatar auth-user-avatar-button"
                  onClick={() => {
                    setIsUserMenuOpen((current) => !current);
                  }}
                  style={userAvatarStyle}
                  title={displayLabel}
                  type="button"
                >
                  {avatarInitial}
                </button>

                {isUserMenuOpen ? (
                  <div aria-label={tx("User menu")} className="auth-user-dropdown" role="menu">
                    <div className="auth-user-dropdown-header">
                      <p className="auth-user-dropdown-name">{displayLabel}</p>
                      <p className="auth-user-dropdown-email">{user?.email ?? ""}</p>
                    </div>

                    {/* Keep theme choices inline with the account menu so the shell owns appearance changes globally. */}
                    <div
                      aria-label={tx("Theme preference")}
                      className="auth-user-theme-toggle"
                      data-theme-preference={themePreference}
                      role="group"
                    >
                      <button
                        aria-pressed={themePreference === "light"}
                        className={`auth-user-theme-option ${themePreference === "light" ? "active" : ""}`}
                        onClick={() => handleThemeSelect("light")}
                        type="button"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
                          <path
                            d="M12 2.75v2.5M12 18.75v2.5M21.25 12h-2.5M5.25 12h-2.5M18.54 5.46l-1.77 1.77M7.23 16.77l-1.77 1.77M18.54 18.54l-1.77-1.77M7.23 7.23L5.46 5.46"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </button>
                      <button
                        aria-pressed={themePreference === "dark"}
                        className={`auth-user-theme-option ${themePreference === "dark" ? "active" : ""}`}
                        onClick={() => handleThemeSelect("dark")}
                        type="button"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path
                            d="M14.5 3.1a8.9 8.9 0 1 0 6.4 15.3A9.6 9.6 0 0 1 14.5 3.1Z"
                            fill="none"
                            stroke="currentColor"
                            strokeLinejoin="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </button>
                      <button
                        aria-pressed={themePreference === "system"}
                        className={`auth-user-theme-option ${themePreference === "system" ? "active" : ""}`}
                        onClick={() => handleThemeSelect("system")}
                        type="button"
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <rect
                            x="4.25"
                            y="5.25"
                            width="15.5"
                            height="11.5"
                            rx="2"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                          />
                          <path
                            d="M9.5 19.25h5M12 16.75v2.5"
                            fill="none"
                            stroke="currentColor"
                            strokeLinecap="round"
                            strokeWidth="1.8"
                          />
                        </svg>
                      </button>
                    </div>

                    <div aria-hidden="true" className="auth-user-dropdown-divider" />

                    <div className="auth-user-progress-section">
                      <div
                        aria-label={`${tx("Learn")} progress ${profileProgress.learn.completed} of ${profileProgress.learn.total}, ${learnPercent}% complete`}
                        className="auth-user-progress-row"
                      >
                        <span className="auth-user-progress-label">{tx("learn")}</span>
                        <div
                          aria-hidden="true"
                          className={`auth-user-progress-track ${isLearnProgressPending ? "is-loading" : ""}`}
                          style={{ ["--profile-progress-value" as const]: `${learnPercent}%` }}
                        />
                        <span className="auth-user-progress-value">
                          {/* Keep the compact meter readable while data is pending instead of exposing a misleading 0%. */}
                          {isLearnProgressPending ? "..." : `${learnPercent}%`}
                        </span>
                      </div>

                      <div
                        aria-label={`${tx("Quiz")} progress ${profileProgress.quiz.completed} of ${profileProgress.quiz.total}, ${quizPercent}% complete`}
                        className="auth-user-progress-row"
                      >
                        <span className="auth-user-progress-label">{tx("quiz")}</span>
                        <div
                          aria-hidden="true"
                          className={`auth-user-progress-track ${isQuizProgressPending ? "is-loading" : ""}`}
                          style={{ ["--profile-progress-value" as const]: `${quizPercent}%` }}
                        />
                        <span className="auth-user-progress-value">
                          {/* Mirror the learn placeholder treatment so both meters feel like one intentionally grouped module. */}
                          {isQuizProgressPending ? "..." : `${quizPercent}%`}
                        </span>
                      </div>
                    </div>

                    <div aria-hidden="true" className="auth-user-dropdown-divider" />

                    <Link
                      className="auth-user-menu-link"
                      onClick={handleUserMenuNavigate}
                      role="menuitem"
                      to="/dashboard"
                    >
                      {tx("Quiz dashboard")}
                    </Link>

                    <div aria-label={tx("Language preference")} className="auth-user-language-section" role="group">
                      <div className="auth-user-language-header">
                        <span className="auth-user-language-label">{tx("Language")}</span>
                        <span className="auth-user-language-value">{localeLabel}</span>
                      </div>

                      <div className="auth-user-language-options">
                        {SUPPORTED_LOCALES.map((supportedLocale) => (
                          <button
                            key={supportedLocale}
                            aria-pressed={locale === supportedLocale}
                            className={`auth-user-language-option ${locale === supportedLocale ? "active" : ""}`}
                            onClick={() => handleLanguageSelect(supportedLocale)}
                            type="button"
                          >
                            {supportedLocale === "zh-CN" ? "简体中文" : "English"}
                          </button>
                        ))}
                      </div>

                      <p className="auth-user-language-note">{tx("Refresh the page after changing language.")}</p>
                    </div>

                    <div aria-hidden="true" className="auth-user-dropdown-divider" />

                    <button className="auth-user-logout-button" onClick={() => void handleLogout()} type="button">
                      {tx("Logout")}
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <NavLink to="/login" className="login-button">
                {tx("Login")}
              </NavLink>
            )}
          </div>
        </header>

        <main className="content-area">
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route
              path="/quiz"
              element={
                <ProtectedQuizRoute>
                  <QuizPage />
                </ProtectedQuizRoute>
              }
            />
            <Route
              path="/quiz/:quizId"
              element={
                <ProtectedQuizRoute>
                  <QuizPage />
                </ProtectedQuizRoute>
              }
            />
            {/* Dedicated route keeps the large live-data module isolated from the simpler static pages. */}
            <Route path="/market" element={<CryptoMarketStructurePage />} />
            <Route path="/market-structure" element={<Navigate replace to="/market" />} />
            <Route
              path="/learn"
              element={
                <ProtectedQuizRoute>
                  <LearnPage />
                </ProtectedQuizRoute>
              }
            />
            <Route
              path="/learn/:unitExternalId"
              element={
                <ProtectedQuizRoute>
                  <LearnPage />
                </ProtectedQuizRoute>
              }
            />
            <Route path="/risks" element={<RisksPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignUpPage />} />
            <Route path="/dictionary" element={<DictionaryPage />} />
            <Route
              path="/dashboard"
              element={
                <ProtectedQuizRoute>
                  <DashboardPage />
                </ProtectedQuizRoute>
              }
            />
            <Route path="/trading-floor" element={<TradingFloorPage />} />
            <Route path="/covid-crash" element={<CrashPage />} />
            <Route path="/volatility" element={<VolatilityChallengePage />} />
            <Route path="/market-replay" element={<MarketReplayPage />} />
            <Route path="/crashes" element={<EditorialCrashTimelinePage />} />
            <Route path="/crash-timeline" element={<EditorialCrashTimelinePage />} />
            <Route path="/leaderboard" element={<LeaderboardPage />} />
            <Route path="/profile" element={<ProfilePage />} />
          </Routes>
        </main>
      </div>

      <ChatWidget />
    </div>
  );
}

export default App;
