import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  CrashAttempt, GFCAttemptState, GFCTick, GFCNewsFlash, GFCMultiCandle,
} from '../../types/covidCrash';
import { advanceCrash, buyMultiCrash, sellMultiCrash } from '../../utils/covidCrash';
import { formatGBP } from './lib/format';
import { MultiAssetChart } from './components/MultiAssetChart';
import { MultiAssetPortfolioPanel } from './components/MultiAssetPortfolioPanel';
import { MultiAssetOrderPanel } from './components/MultiAssetOrderPanel';
import { CountdownTimer } from './components/CountdownTimer';
import { GFCNewsFlashModal } from './components/GFCNewsFlashModal';
import { useI18n } from '../../i18n/provider';

const ROUND_DURATION = 90; // seconds

// Round labels for GFC
const ROUND_LABELS: Record<number, string> = {
  0: 'Round 1 — Sep 2008',
  1: 'Round 2 — Sep 29',
  2: 'Round 3 — Oct 7',
  3: 'Round 4 — Oct 27',
  4: 'Round 5 — Jan 2009',
  5: 'Round 6 — Mar 2009',
};

interface RoundEndOverlayProps {
  roundIndex: number;
  closingPrices: Record<string, number>;
  portfolioValue: number;
  startingBalance: number;
  onContinue: () => void;
}

function RoundEndOverlay({ roundIndex, closingPrices, portfolioValue, startingBalance, onContinue }: RoundEndOverlayProps) {
  const { tx } = useI18n();
  useEffect(() => {
    const timer = setTimeout(onContinue, 3500);
    return () => clearTimeout(timer);
  }, [onContinue]);

  const delta = portfolioValue - startingBalance;
  const isUp = delta >= 0;

  return (
    <div className="gfc-round-end-overlay">
      <div className="gfc-round-end-card">
        <p className="gfc-round-end-title">{tx("Round {index} complete", { index: roundIndex + 1 })}</p>
        <div className="gfc-round-end-prices">
          {Object.entries(closingPrices).map(([asset, price]) => (
            <div key={asset} className="gfc-round-end-price-row">
              <span className="gfc-round-end-asset">{asset}</span>
              <span className="gfc-round-end-price">{formatGBP(price)}</span>
            </div>
          ))}
        </div>
        <div className="gfc-round-end-portfolio">
          <span>{tx("Portfolio")}</span>
          <span className={isUp ? 'is-up' : 'is-down'}>{formatGBP(portfolioValue)}</span>
        </div>
        <p className="gfc-round-end-loading">{tx("Loading next round…")}</p>
      </div>
    </div>
  );
}

interface GFCScenarioPlayerProps {
  attempt: CrashAttempt;
  onAttemptUpdate: (attempt: CrashAttempt) => void;
  onBack: () => void;
}

export function GFCScenarioPlayer({ attempt, onAttemptUpdate, onBack }: GFCScenarioPlayerProps) {
  const { tx, formatDate } = useI18n();
  const { scenario, current_round } = attempt;
  const state = attempt.state as unknown as GFCAttemptState;
  const assets = scenario.available_assets ?? ['FTSE', 'RBS', 'BP', 'GOLD', 'GILT'];

  // Live ticking state
  const [tickIndex, setTickIndex] = useState(0);
  const [currentPrices, setCurrentPrices] = useState<Record<string, number>>(
    current_round?.asset_closing_prices ?? {}
  );

  // Timer
  const [remainingSeconds, setRemainingSeconds] = useState(ROUND_DURATION);
  const [timerRunning, setTimerRunning] = useState(true);

  // News flash
  const [activeFlash, setActiveFlash] = useState<GFCNewsFlash | null>(null);
  const shownFlashes = useRef<Set<string>>(new Set());

  // UI state
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [showRoundEnd, setShowRoundEnd] = useState(false);
  const [roundEndData, setRoundEndData] = useState<{ prices: Record<string, number>; value: number } | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const ticks: GFCTick[] = current_round?.intraday_ticks ?? [];
  const newsFlashes: GFCNewsFlash[] = current_round?.news_flashes ?? [];

  // Reset state when round changes
  useEffect(() => {
    setTickIndex(0);
    setCurrentPrices(current_round?.asset_closing_prices ?? {});
    setRemainingSeconds(ROUND_DURATION);
    setTimerRunning(true);
    shownFlashes.current = new Set();
    setActiveFlash(null);
  }, [attempt.current_round_index]);

  // Tick animation — one tick every 2 seconds
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isPaused = !timerRunning || !!activeFlash || attempt.is_complete;

  useEffect(() => {
    if (!ticks.length || isPaused) return;
    if (tickRef.current) return;

    tickRef.current = setInterval(() => {
      setTickIndex(prev => {
        const next = prev + 1;
        if (next >= ticks.length) {
          clearInterval(tickRef.current!);
          tickRef.current = null;
          return prev;
        }
        const tick = ticks[next];
        setCurrentPrices({
          FTSE: tick.FTSE ?? 0,
          RBS: tick.RBS ?? 0,
          BP: tick.BP ?? 0,
          GOLD: tick.GOLD ?? 0,
          GILT: tick.GILT ?? 0,
        });
        return next;
      });
    }, 2000);

    return () => {
      if (tickRef.current) {
        clearInterval(tickRef.current);
        tickRef.current = null;
      }
    };
  }, [isPaused, ticks.length]);

  // Check news flash triggers on tick change
  useEffect(() => {
    if (!ticks.length || !newsFlashes.length) return;
    const currentTick = ticks[tickIndex];
    if (!currentTick) return;

    for (const flash of newsFlashes) {
      const flashId = `${attempt.current_round_index}-${flash.trigger_offset_seconds}`;
      if (
        !shownFlashes.current.has(flashId) &&
        currentTick.offset_seconds >= flash.trigger_offset_seconds
      ) {
        shownFlashes.current.add(flashId);
        setTimerRunning(false);
        setActiveFlash(flash);
        // Stop tick animation while flash is shown
        if (tickRef.current) {
          clearInterval(tickRef.current);
          tickRef.current = null;
        }
        break;
      }
    }
  }, [tickIndex]);

  const handleDismissFlash = useCallback(() => {
    setActiveFlash(null);
    setTimerRunning(true);
  }, []);

  const handleTimerTick = useCallback((remaining: number) => {
    setRemainingSeconds(remaining);
  }, []);

  const handleEndRound = useCallback(async () => {
    if (isAdvancing) return;
    setIsAdvancing(true);
    setTimerRunning(false);

    try {
      const resp = await advanceCrash(attempt.id);
      const updatedAttempt = resp.attempt;

      // Show round end overlay briefly
      if (!updatedAttempt.is_complete) {
        const prevRound = attempt.current_round;
        setRoundEndData({
          prices: prevRound?.asset_closing_prices ?? {},
          value: (updatedAttempt.state as unknown as GFCAttemptState).total_value_pence,
        });
        setShowRoundEnd(true);
      }

      onAttemptUpdate(updatedAttempt);
    } catch (e) {
      console.error('End round failed', e);
    } finally {
      setIsAdvancing(false);
    }
  }, [attempt, isAdvancing, onAttemptUpdate]);

  const handleTimerComplete = useCallback(() => {
    setTimerRunning(false);
    void handleEndRound();
  }, [handleEndRound]);

  const handleBuy = useCallback(async (asset: string, amountPence: number) => {
    setIsSubmitting(true);
    setTradeError(null);
    try {
      const currentTick = ticks[tickIndex];
      const offset = currentTick?.offset_seconds;
      const resp = await buyMultiCrash(attempt.id, asset, amountPence, offset);
      onAttemptUpdate(resp.attempt);
    } catch (e: unknown) {
      setTradeError(e instanceof Error ? e.message : tx("Trade failed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [attempt.id, ticks, tickIndex, onAttemptUpdate]);

  const handleSell = useCallback(async (asset: string, units: number) => {
    setIsSubmitting(true);
    setTradeError(null);
    try {
      const currentTick = ticks[tickIndex];
      const offset = currentTick?.offset_seconds;
      const resp = await sellMultiCrash(attempt.id, asset, units, offset);
      onAttemptUpdate(resp.attempt);
    } catch (e: unknown) {
      setTradeError(e instanceof Error ? e.message : tx("Trade failed"));
    } finally {
      setIsSubmitting(false);
    }
  }, [attempt.id, ticks, tickIndex, onAttemptUpdate]);

  const roundIndex = attempt.current_round_index;
  const roundLabel = tx(ROUND_LABELS[roundIndex] ?? `Round ${roundIndex + 1}`);
  const candles = (attempt.all_candles ?? []) as unknown as GFCMultiCandle[];

  if (attempt.is_complete) {
    // Completed state — ScenarioComplete handles this from parent
    return null;
  }

  return (
    <div className="gfc-player">
      {/* Header */}
      <div className="gfc-player-header">
        <button className="cc-player-back" onClick={onBack} type="button">← {tx("Lobby")}</button>
        <div className="gfc-player-header-center">
          <span className="cc-player-scenario-title">{tx(scenario.title)}</span>
          <span className="gfc-round-label">{roundLabel}</span>
        </div>
        <CountdownTimer
          totalSeconds={ROUND_DURATION}
          remainingSeconds={remainingSeconds}
          paused={isPaused}
          onTick={handleTimerTick}
          onComplete={handleTimerComplete}
        />
      </div>

      {/* Context bar */}
      {current_round?.structural_signal_text && (
        <div className="cc-signal-banner cc-signal-banner--warning">
          <span className="cc-signal-banner-icon" aria-hidden="true">⚠</span>
          {tx(current_round.structural_signal_text)}
        </div>
      )}

      {/* Main layout: left=chart+context, right=order+portfolio */}
      <div className="gfc-player-body">
        {/* Left column */}
        <div className="gfc-player-left">
          <MultiAssetChart
            candles={candles}
            assets={assets}
          />

          {current_round && (
            <div className="gfc-context-card">
              <p className="gfc-context-date">
                {formatDate(new Date(`${current_round.scenario_date}T00:00:00`), {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
              </p>
              <p className="gfc-context-text">{tx(current_round.context_paragraph)}</p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="gfc-player-right">
          <MultiAssetOrderPanel
            state={state}
            assets={assets}
            currentPrices={currentPrices}
            isSubmitting={isSubmitting}
            onBuy={handleBuy}
            onSell={handleSell}
            onEndRound={() => void handleEndRound()}
          />
          <MultiAssetPortfolioPanel state={state} assets={assets} />
        </div>
      </div>

      {tradeError && (
        <div className="cc-trade-error">{tradeError}</div>
      )}

      {/* News flash modal */}
      {activeFlash && (
        <GFCNewsFlashModal flash={activeFlash} onDismiss={handleDismissFlash} />
      )}

      {/* Round end overlay */}
      {showRoundEnd && roundEndData && (
        <RoundEndOverlay
          roundIndex={roundIndex}
          closingPrices={roundEndData.prices}
          portfolioValue={roundEndData.value}
          startingBalance={attempt.scenario.starting_balance_pence ?? 1_000_000}
          onContinue={() => setShowRoundEnd(false)}
        />
      )}
    </div>
  );
}
