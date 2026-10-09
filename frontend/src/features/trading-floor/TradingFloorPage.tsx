import { useCallback, useEffect, useState } from "react";
import type { TradingAttempt, TradingScenario } from "../../types/trading";
import { fetchScenarios, startAttempt } from "../../utils/tradingFloor";
import { useAuth } from "../../store/authStore";
import { ScenarioCard } from "./ScenarioCard";
import { ScenarioPlayer } from "./ScenarioPlayer";
import { TradingFloorLeaderboard } from "./TradingFloorLeaderboard";

type PageState =
  | { view: "lobby" }
  | { view: "loading-attempt"; slug: string }
  | { view: "playing"; attempt: TradingAttempt; scenario: TradingScenario | null };

export function TradingFloorPage() {
  const { isAuthenticated } = useAuth();
  const [scenarios, setScenarios] = useState<TradingScenario[]>([]);
  const [pageState, setPageState] = useState<PageState>({ view: "lobby" });
  const [loadingSlug, setLoadingSlug] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [scenariosLoading, setScenariosLoading] = useState(true);

  // Load scenario list once on mount.
  useEffect(() => {
    let cancelled = false;
    setScenariosLoading(true);
    fetchScenarios()
      .then((data) => {
        if (!cancelled) {
          setScenarios(data);
          setScenariosLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setScenariosLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handlePlay = useCallback(
    async (slug: string) => {
      if (!isAuthenticated) {
        setLoadError("Please log in to play a scenario.");
        return;
      }
      setLoadingSlug(slug);
      setLoadError(null);
      try {
        const attempt = await startAttempt(slug);
        const scenario = scenarios.find((s) => s.slug === slug) ?? null;
        setPageState({ view: "playing", attempt, scenario });
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : "Failed to start scenario.");
      } finally {
        setLoadingSlug(null);
      }
    },
    [isAuthenticated, scenarios],
  );

  const handleAttemptUpdate = useCallback((updated: TradingAttempt) => {
    setPageState((prev) => ({
      view: "playing",
      attempt: updated,
      scenario: prev.view === "playing" ? prev.scenario : null,
    }));
  }, []);

  const handleRestart = useCallback(async () => {
    if (pageState.view !== "playing") return;
    const slug = pageState.attempt.scenario_slug;
    setPageState({ view: "lobby" });
    // Give the lobby a tick to render, then auto-start a fresh attempt.
    await handlePlay(slug);
  }, [pageState, handlePlay]);

  const handleBack = useCallback(() => {
    setPageState({ view: "lobby" });
    setLoadError(null);
  }, []);

  // ── Playing ──────────────────────────────────────────────────────────────────
  if (pageState.view === "playing") {
    const { attempt, scenario } = pageState;
    return (
      <div className="tf-page ds-page ds-page-enter">
        <ScenarioPlayer
          attempt={attempt}
          scenarioAccentColor={scenario?.accent_color ?? "#0052ff"}
          scenarioVolatilityProfile={scenario?.volatility_profile ?? "normal"}
          onAttemptUpdate={handleAttemptUpdate}
          onRestart={handleRestart}
          onBack={handleBack}
        />
      </div>
    );
  }

  // ── Lobby ─────────────────────────────────────────────────────────────────────
  return (
    <div className="tf-page ds-page ds-page-enter">
      <div className="tf-lobby">
        <div className="tf-lobby-hero">
          <div className="tf-lobby-hero-icon" aria-hidden="true">📈</div>
          <h1 className="tf-lobby-title">Trading Floor</h1>
          <p className="tf-lobby-sub">
            Branching consequence simulator — every choice has real consequences.
            <br />
            Make the decisions, live with the outcomes, and learn the principles that separate
            disciplined traders from impulsive ones.
          </p>
          {!isAuthenticated && (
            <p className="tf-lobby-auth-hint">
              <a href="/login">Log in</a> to play and track your score on the leaderboard.
            </p>
          )}
        </div>

        {loadError && <p className="tf-lobby-error">{loadError}</p>}

        <section className="tf-scenarios-section">
          <h2 className="tf-scenarios-heading">Scenarios</h2>
          {scenariosLoading ? (
            <div className="tf-scenarios-loading">Loading scenarios…</div>
          ) : scenarios.length === 0 ? (
            <div className="tf-scenarios-empty">No scenarios available yet.</div>
          ) : (
            <div className="tf-scenarios-grid">
              {scenarios.map((s) => (
                <ScenarioCard
                  key={s.id}
                  scenario={s}
                  onPlay={handlePlay}
                  isLoading={loadingSlug === s.slug}
                />
              ))}
            </div>
          )}
        </section>

        <section className="tf-lb-section">
          <TradingFloorLeaderboard />
        </section>
      </div>
    </div>
  );
}
