/**
 * syntheticFill.ts — Browser-side synthetic minute candle engine.
 *
 * Takes real hourly OHLC anchor candles from the API and fills each
 * one-hour gap with 60 synthetic minute-level candles using geometric
 * Brownian motion with mean reversion toward the next hourly close.
 *
 * Key properties:
 *   - Deterministic: same hourly anchors always produce the same minute path.
 *   - No API calls: runs entirely in the browser after the initial load.
 *   - Anchor-true: minute 59 of each hour snaps exactly to the next hourly close.
 *   - Lightweight Charts compatible: outputs `time` as Unix seconds.
 */

import type { ReplayCandle } from "../../types/marketReplay";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface MinuteCandle {
  /** Unix timestamp in seconds — required by TradingView Lightweight Charts. */
  time: number;
  open: number;  // GBP float
  high: number;
  low: number;
  close: number;
}

// ── Seeded PRNG ───────────────────────────────────────────────────────────────

/**
 * Simple linear congruential generator seeded by a number.
 * Same seed → same sequence → deterministic chart output.
 */
function seededRandom(seed: number): () => number {
  let s = seed >>> 0; // coerce to uint32
  return function () {
    s = Math.imul(s, 1664525) + 1013904223;
    s = s >>> 0; // keep as uint32
    return s / 4294967296;
  };
}

// ── Core fill ─────────────────────────────────────────────────────────────────

/**
 * Generates 60 synthetic minute candles that bridge `fromCandle` to `toCandle`.
 * The open of minute 0 is the close of `fromCandle`.
 * The close of minute 59 is exactly the close of `toCandle`.
 */
/**
 * Resolve the best GBP price for a candle, preferring micropence precision
 * for assets that have fallen below £0.01 (e.g. LUNA post-collapse).
 * pence → GBP  OR  micropence / 10000 → GBP (4 decimal places).
 */
function candleCloseGBP(candle: ReplayCandle): number {
  if (candle.c > 1) return candle.c / 100;
  // c is at the £0.01 floor — use micropence if available for real precision
  if (candle.cm !== undefined && candle.cm > 0) return candle.cm / 10_000;
  return candle.c / 100; // fallback (returns 0.01 or 0)
}

export function fillHourWithMinutes(
  fromCandle: ReplayCandle,
  toCandle: ReplayCandle,
): MinuteCandle[] {
  const fromDate = new Date(fromCandle.date);
  const fromTs = fromDate.getTime() / 1000; // Unix seconds

  const startPrice = candleCloseGBP(fromCandle);
  const targetPrice = candleCloseGBP(toCandle);

  // Seed based on the from-candle timestamp for determinism
  const rand = seededRandom(fromDate.getTime() / 1000);

  const candles: MinuteCandle[] = [];
  let currentPrice = startPrice;

  for (let minute = 0; minute < 60; minute++) {
    const ts = fromTs + minute * 60;

    const open = currentPrice;

    // Mean reversion toward where price needs to be by end of hour
    const meanReversionForce = (targetPrice - currentPrice) * 0.08;

    // Small noise scaled to price level
    const noise = currentPrice * 0.0015 * (rand() * 2 - 1);

    currentPrice = currentPrice + meanReversionForce + noise;

    // Final minute snaps exactly to the target close
    if (minute === 59) {
      currentPrice = targetPrice;
    }

    const close = currentPrice;
    const high = Math.max(open, close) * (1 + rand() * 0.001);
    const low = Math.min(open, close) * (1 - rand() * 0.001);

    // Rounding: for prices >= £0.01 round to 2 dp; for sub-penny keep 6 dp
    // so the chart doesn't collapse all values to £0.00.
    const decimals = close >= 0.01 ? 100 : 1_000_000;
    candles.push({
      time: ts,
      open:  Math.round(open  * decimals) / decimals,
      high:  Math.round(high  * decimals) / decimals,
      low:   Math.round(low   * decimals) / decimals,
      close: Math.round(close * decimals) / decimals,
    });
  }

  return candles;
}

// ── Full expansion ─────────────────────────────────────────────────────────────

/**
 * Expands an array of hourly candles into minute-level candles.
 *
 * - All complete hours (all pairs except the last) get a full 60 minutes.
 * - The current (last) hour is truncated to the number of minutes that have
 *   elapsed within it according to `currentSimulatedDatetime`.
 *
 * Returns an array of MinuteCandle sorted by ascending time.
 */
export function expandToMinutes(
  hourlyCandles: ReplayCandle[],
  currentSimulatedDatetime: Date,
): MinuteCandle[] {
  if (hourlyCandles.length < 2) return [];

  const allMinutes: MinuteCandle[] = [];

  // Fill all complete inter-hour gaps
  for (let i = 0; i < hourlyCandles.length - 2; i++) {
    const filled = fillHourWithMinutes(hourlyCandles[i], hourlyCandles[i + 1]);
    allMinutes.push(...filled);
  }

  // For the second-to-last → last gap (the current open hour), only show
  // minutes up to the current simulated time within that hour.
  const prevHour = hourlyCandles[hourlyCandles.length - 2];
  const currentHour = hourlyCandles[hourlyCandles.length - 1];
  const allCurrentHour = fillHourWithMinutes(prevHour, currentHour);

  const currentHourDate = new Date(currentHour.date);
  const minutesIntoCurrentHour = Math.floor(
    (currentSimulatedDatetime.getTime() - currentHourDate.getTime()) / 60_000,
  );

  // Show at least 1 minute so the chart always has the current candle visible
  const visibleCount = Math.max(1, Math.min(minutesIntoCurrentHour, 60));
  allMinutes.push(...allCurrentHour.slice(0, visibleCount));

  return allMinutes;
}

// ── Full-scenario expansion (no truncation) ────────────────────────────────────

/**
 * Expands the complete hourly candle array into minute candles without
 * truncating at the current simulated time. Used for pre-loading the full
 * animation path on initial load.
 */
export function expandAllToMinutes(hourlyCandles: ReplayCandle[]): MinuteCandle[] {
  if (hourlyCandles.length < 2) return [];
  const allMinutes: MinuteCandle[] = [];
  for (let i = 0; i < hourlyCandles.length - 1; i++) {
    allMinutes.push(...fillHourWithMinutes(hourlyCandles[i], hourlyCandles[i + 1]));
  }
  return allMinutes;
}

/**
 * Returns the number of minute candles that should be visible given a
 * progress fraction in [0, 1].
 */
export function getVisibleMinuteCount(allMinutes: MinuteCandle[], progressFraction: number): number {
  return Math.floor(allMinutes.length * Math.min(progressFraction, 1.0));
}
