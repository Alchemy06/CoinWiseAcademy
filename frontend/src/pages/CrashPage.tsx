import { useCallback, useEffect, useMemo, useState } from "react";
import type { CrashAttempt, CrashScenario } from "../types/covidCrash";
import { fetchCrashScenarios, startCrashAttempt } from "../utils/covidCrash";
import { useAuth } from "../store/authStore";
import { CrashLobby } from "../features/covid-crash/CrashLobby";
import { CrashScenarioPlayer } from "../features/covid-crash/CrashScenarioPlayer";
import { useI18n } from "../i18n/provider";

type PageView =
  | { view: "lobby" }
  | { view: "playing"; attempt: CrashAttempt };

export function CrashPage() {
  const { tx } = useI18n();
  const { isAuthenticated } = useAuth();
  const [scenarios, setScenarios] = useState<CrashScenario[]>([]);
  const [cumulativeBalancePence, setCumulativeBalancePence] = useState<number | undefined>(undefined);
  const [scenariosLoading, setScenariosLoading] = useState(true);
  const [pageView, setPageView] = useState<PageView>({ view: "lobby" });
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [isRestarting, setIsRestarting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const translatedScenarios = useMemo<CrashScenario[]>(
    () =>
      scenarios.map((scenario) => ({
        ...scenario,
        title: tx(scenario.title),
        subtitle: tx(scenario.subtitle),
        historical_period: tx(scenario.historical_period),
        lesson_tag: tx(scenario.lesson_tag),
        asset_name: tx(scenario.asset_name),
        asset_unit_label: tx(scenario.asset_unit_label),
      })),
    [scenarios, tx],
  );

  // Fetch scenario list once on mount.
  useEffect(() => {
    let cancelled = false;
    setScenariosLoading(true);
    fetchCrashScenarios()
      .then(({ scenarios: list, cumulative_balance_pence }) => {
        if (!cancelled) {
          setScenarios(list);
          setCumulativeBalancePence(cumulative_balance_pence);
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
    async (scenarioId: number) => {
      if (!isAuthenticated) {
        setLoadError(tx("Please log in to play a scenario."));
        return;
      }
      setLoadingId(scenarioId);
      setLoadError(null);
      try {
        const attempt = await startCrashAttempt(scenarioId);
        setPageView({ view: "playing", attempt });
      } catch (err: unknown) {
        setLoadError(err instanceof Error ? err.message : tx("Failed to start scenario."));
      } finally {
        setLoadingId(null);
      }
    },
    [isAuthenticated],
  );

  const handleAttemptUpdate = useCallback((updated: CrashAttempt) => {
    setPageView({ view: "playing", attempt: updated });
  }, []);

  const handleBack = useCallback(() => {
    // Re-fetch scenarios to get the updated wallet balance after completing a scenario.
    fetchCrashScenarios()
      .then(({ scenarios: list, cumulative_balance_pence }) => {
        setScenarios(list);
        setCumulativeBalancePence(cumulative_balance_pence);
      })
      .catch(() => {/* keep stale data on error */});

    setPageView({ view: "lobby" });
    setLoadError(null);
  }, []);

  // Called from the ScenarioComplete overlay.
  // Since the current attempt is complete, startCrashAttempt creates a fresh one.
  const handlePlayAgain = useCallback(async () => {
    if (pageView.view !== "playing") return;
    const scenarioId = pageView.attempt.scenario.id;
    setIsRestarting(true);
    try {
      const fresh = await startCrashAttempt(scenarioId);
      setPageView({ view: "playing", attempt: fresh });
    } catch {
      // On failure, fall back to lobby
      setPageView({ view: "lobby" });
    } finally {
      setIsRestarting(false);
    }
  }, [pageView]);

  if (pageView.view === "playing") {
    return (
      <div className="cc-page">
        <CrashScenarioPlayer
          attempt={pageView.attempt}
          onAttemptUpdate={handleAttemptUpdate}
          onBack={handleBack}
          onPlayAgain={() => void handlePlayAgain()}
          isRestarting={isRestarting}
        />
      </div>
    );
  }

  return (
    <div className="cc-page ds-page ds-page-enter">
        <CrashLobby
        scenarios={translatedScenarios}
        isLoading={scenariosLoading}
        loadingId={loadingId}
        error={loadError}
        onPlay={(id) => void handlePlay(id)}
        cumulativeBalancePence={cumulativeBalancePence}
      />
    </div>
  );
}
