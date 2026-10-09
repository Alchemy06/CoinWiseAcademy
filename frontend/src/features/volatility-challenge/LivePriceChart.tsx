/**
 * LivePriceChart.tsx — Candlestick chart for the Volatility Challenge.
 *
 * ╔══════════════════════════════════════════════════════════════════╗
 * ║  ARCHITECTURE — two-layer MVP                                    ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  Layer 1 — real historical candles loaded once on mount or       ║
 * ║            asset/range change via GET /api/predictions/chart/   ║
 * ║  Layer 2 — Binance WebSocket pushes live kline updates ~100ms   ║
 * ║            Fallback: poll /api/predictions/live-price/ if WS    ║
 * ║            is unavailable (e.g. network blocked)                 ║
 * ╠══════════════════════════════════════════════════════════════════╣
 * ║  NO ghost candles. NO fillGaps. NO fake/interpolated data.       ║
 * ║  All OHLC candles come from Binance (real data).                ║
 * ╚══════════════════════════════════════════════════════════════════╝
 */

import { useEffect, useRef, useState } from "react";
import type { PredictionAsset } from "../../types/predictions";
import {
  fetchChartData,
  fetchSimpleLivePrice,
} from "../../utils/predictions";

// ─── Binance WebSocket types ──────────────────────────────────────────────────

interface BinanceKlinePayload {
  t: number;   // kline open time (ms)
  o: string;   // open
  h: string;   // high
  l: string;   // low
  c: string;   // close (latest price)
  x: boolean;  // is this kline closed/finalised?
}

interface BinanceKlineMessage {
  e: string;           // event type — "kline"
  k: BinanceKlinePayload;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface Candle {
  ts: number;    // period-start Unix ms (wall-clock aligned to bucket boundary)
  open: number;
  high: number;
  low: number;
  close: number;
  isLive?: boolean;
}

type ChartStatus = "loading" | "live" | "reconnecting";

export type ChartRange = "1H" | "4H" | "24H" | "7D";

// ─── Timing constants ─────────────────────────────────────────────────────────

/** Bucket duration per range — must match Binance klines interval. */
const INTERVAL_MS: Record<ChartRange, number> = {
  "1H":  1  * 60_000,        // 1-min candles
  "4H":  5  * 60_000,        // 5-min candles
  "24H": 30 * 60_000,        // 30-min candles
  "7D":  4  * 60 * 60_000,   // 4-hour candles
};

/** Expected candle count — drives slot width calculation. */
const EXPECTED_CANDLES: Record<ChartRange, number> = {
  "1H":  60,
  "4H":  48,
  "24H": 48,
  "7D":  42,
};

/** X-axis tick spacing per range. */
const TICK_MS: Record<ChartRange, number> = {
  "1H":  10 * 60_000,
  "4H":  60 * 60_000,
  "24H": 4  * 60 * 60_000,
  "7D":  24 * 60 * 60_000,
};

/** Live poll interval — used only as WebSocket fallback. */
const POLL_MS = 3_000;

/** Binance WebSocket stream URL base. */
const BINANCE_WS_BASE = "wss://stream.binance.com:9443/ws";

/** Binance WebSocket symbol per asset (lowercase required by Binance). */
const WS_SYMBOL: Record<PredictionAsset, string> = {
  BTC: "btcusdt",
  ETH: "ethusdt",
};

/** Binance kline interval string per chart range. */
const WS_INTERVAL: Record<ChartRange, string> = {
  "1H":  "1m",
  "4H":  "5m",
  "24H": "30m",
  "7D":  "4h",
};

/** Visual re-render interval — keeps age counter and live candle position fresh. */
const VISUAL_TICK_MS = 500;

// ─── SVG layout ───────────────────────────────────────────────────────────────

const VW = 880, VH = 290;
const LP = 10, RP = 76, TP = 18, BP = 42;
const CW = VW - LP - RP;  // 794
const CH = VH - TP - BP;  // 230

const MIN_BODY_PX = 1.5;
const MAX_BODY_PX = 16;

// ─── Colours ─────────────────────────────────────────────────────────────────

const GREEN      = "#16a34a";
const GREEN_DARK = "#166534";
const RED        = "#dc2626";
const RED_DARK   = "#991b1b";
const DOJI_COLOR = "#6b7280";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtUsd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency", currency: "USD",
    maximumFractionDigits: n >= 1_000 ? 0 : 2,
  });
}

function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function fmtDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-GB", { month: "short", day: "numeric" });
}

function fmtAge(ms: number): string {
  const s = Math.floor(ms / 1_000);
  if (s < 5)  return "just now";
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

function tsToX(ts: number, rangeStart: number, rangeMs: number): number {
  return LP + Math.max(0, Math.min(1, (ts - rangeStart) / rangeMs)) * CW;
}

function priceToY(price: number, yMin: number, yRange: number): number {
  const t = yRange > 0 ? (price - yMin) / yRange : 0.5;
  return TP + (1 - Math.max(0, Math.min(1, t))) * CH;
}

function xTicks(rangeStart: number, now: number, intervalMs: number): number[] {
  const ticks: number[] = [];
  const first = Math.ceil(rangeStart / intervalMs) * intervalMs;
  for (let ts = first; ts <= now; ts += intervalMs) ticks.push(ts);
  return ticks;
}

/**
 * Update the rightmost candle from a live price.
 * - Same bucket: update high/low/close of the last candle.
 * - New bucket started: close the last candle, open a fresh one.
 * - Earlier than last candle: no-op (stale price).
 */
function applyLivePrice(
  candles: Candle[],
  livePrice: number,
  intervalMs: number,
  maxCandles: number,
): Candle[] {
  if (candles.length === 0) return candles;

  const now = Date.now();
  const currentBucketStart = Math.floor(now / intervalMs) * intervalMs;
  const last = candles[candles.length - 1];

  if (last.ts === currentBucketStart) {
    // Same bucket — update high/low/close of the rightmost candle.
    const updated: Candle = {
      ...last,
      high:   Math.max(last.high, livePrice),
      low:    Math.min(last.low,  livePrice),
      close:  livePrice,
      isLive: true,
    };
    return [...candles.slice(0, -1), updated];
  }

  if (currentBucketStart > last.ts) {
    // New bucket has started — close the old candle and open a new one.
    const closed: Candle = { ...last, isLive: false };
    const newCandle: Candle = {
      ts:     currentBucketStart,
      open:   last.close,
      high:   livePrice,
      low:    livePrice,
      close:  livePrice,
      isLive: true,
    };
    const combined = [...candles.slice(0, -1), closed, newCandle];
    // Keep within a sensible window (maxCandles + small buffer).
    return combined.length > maxCandles + 5
      ? combined.slice(combined.length - (maxCandles + 5))
      : combined;
  }

  // Price is from a bucket older than the last candle — ignore.
  return candles;
}

/**
 * Fill gaps in historical Binance kline data.
 *
 * Binance omits minute slots where no trades occurred (very low-volume periods).
 * Without filling, those gaps appear as completely blank/static sections on the
 * chart because lightweight-charts skips missing time slots.
 *
 * Strategy: carry the previous candle's close forward as a flat doji for every
 * missing slot — honest (no invented movement), visually continuous.
 */
function fillHistoricalGaps(candles: Candle[], intervalMs: number): Candle[] {
  if (candles.length < 2) return candles;
  const result: Candle[] = [];
  for (let i = 0; i < candles.length; i++) {
    result.push(candles[i]);
    if (i < candles.length - 1) {
      const gapMs   = candles[i + 1].ts - candles[i].ts;
      if (gapMs > intervalMs * 1.5) {
        // There's a gap — fill with flat doji candles carrying close forward.
        const prevClose = candles[i].close;
        for (let t = candles[i].ts + intervalMs; t < candles[i + 1].ts - intervalMs * 0.5; t += intervalMs) {
          result.push({
            ts:    t,
            open:  prevClose,
            high:  prevClose,
            low:   prevClose,
            close: prevClose,
          });
        }
      }
    }
  }
  return result;
}

/**
 * Apply a live Binance kline message to the candle array.
 * Binance sends the FULL real-time OHLC for the current open candle,
 * so we replace open/high/low/close directly — no approximation needed.
 * When k.x is true the candle is finalised and marked as no longer live.
 */
function applyKlineUpdate(
  candles: Candle[],
  kline: { ts: number; open: number; high: number; low: number; close: number; isClosed: boolean },
  maxCandles: number,
): Candle[] {
  if (candles.length === 0) return candles;

  const last = candles[candles.length - 1];

  if (last.ts === kline.ts) {
    // Same bucket — replace the rightmost candle with exact Binance OHLC.
    const updated: Candle = {
      ts:     kline.ts,
      open:   kline.open,
      high:   kline.high,
      low:    kline.low,
      close:  kline.close,
      isLive: !kline.isClosed,
    };
    return [...candles.slice(0, -1), updated];
  }

  if (kline.ts > last.ts) {
    // New bucket — finalise the old candle and open the incoming one.
    const closed: Candle    = { ...last, isLive: false };
    const newCandle: Candle = {
      ts:     kline.ts,
      open:   kline.open,
      high:   kline.high,
      low:    kline.low,
      close:  kline.close,
      isLive: !kline.isClosed,
    };
    const combined = [...candles.slice(0, -1), closed, newCandle];
    return combined.length > maxCandles + 5
      ? combined.slice(combined.length - (maxCandles + 5))
      : combined;
  }

  return candles; // stale kline — ignore
}

// ─── Component ────────────────────────────────────────────────────────────────

interface LivePriceChartProps {
  asset: PredictionAsset;
  onAssetChange: (a: PredictionAsset) => void;
  onPriceChange?: (price: number | null) => void;
}

export function LivePriceChart({ asset, onAssetChange, onPriceChange }: LivePriceChartProps) {
  const [range, setRange]         = useState<ChartRange>("1H");
  const [status, setStatus]       = useState<ChartStatus>("loading");
  const [candles, setCandles]     = useState<Candle[]>([]);
  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const [tick, setTick]           = useState(0);

  const onPriceChangeRef = useRef(onPriceChange);

  // Display-price smoothing — ease-out glide between two real backend values.
  const livePriceRef      = useRef<number | null>(null);
  const prevPriceRef      = useRef<number | null>(null);
  const priceChangedAtRef = useRef<number>(0);

  // Keep refs in sync on every render.
  onPriceChangeRef.current = onPriceChange;
  livePriceRef.current     = livePrice;

  // ── Effect 1 — Load history (re-runs on asset or range change) ───────────
  useEffect(() => {
    let cancelled = false;
    setStatus("loading");
    setCandles([]);
    setLivePrice(null);
    prevPriceRef.current      = null;
    priceChangedAtRef.current = 0;
    onPriceChangeRef.current?.(null);

    const intervalMs = INTERVAL_MS[range];
    const maxCandles = EXPECTED_CANDLES[range];

    fetchChartData(asset, range)
      .then(result => {
        if (cancelled) return;
        const raw: Candle[] = result.candles.map(c => ({
          ts: c.time, open: c.open, high: c.high, low: c.low, close: c.close,
        }));
        // Fill any gaps Binance left (no-trade minutes) with flat doji candles
        // so the chart has no blank/static patches.
        const loaded = fillHistoricalGaps(raw, intervalMs);
        if (result.last_price !== null) {
          const price = result.last_price;
          const applied = applyLivePrice(loaded, price, intervalMs, maxCandles);
          setCandles(applied);
          setLivePrice(price);
          onPriceChangeRef.current?.(price);
        } else {
          setCandles(loaded);
        }
        setStatus("live");
      })
      .catch(() => {
        if (!cancelled) setStatus("reconnecting");
      });

    return () => { cancelled = true; };
  }, [asset, range]);

  // ── Effect 2 — Binance WebSocket for live candle (with polling fallback) ──
  //
  // Primary: connect to Binance's public kline WebSocket stream.
  //   wss://stream.binance.com:9443/ws/btcusdt@kline_1m
  // Binance pushes a full OHLC update every time price changes (~100ms).
  // This gives near-real-time rightmost candle updates with no backend cost.
  //
  // Fallback: if WebSocket fails to open or closes with an error, we fall
  // back to polling /api/predictions/live-price/ every POLL_MS seconds.
  useEffect(() => {
    let stopped         = false;
    let ws: WebSocket | null = null;
    let fallbackId: ReturnType<typeof setInterval> | null = null;
    let reconnectId: ReturnType<typeof setTimeout>  | null = null;
    let wsConnected     = false;
    const maxCandles    = EXPECTED_CANDLES[range];
    const intervalMs    = INTERVAL_MS[range];

    // ── Shared price handler ─────────────────────────────────────────────
    function handlePrice(price: number) {
      if (stopped) return;
      const prevLive = livePriceRef.current;
      if (prevLive !== null && prevLive !== price) {
        prevPriceRef.current      = prevLive;
        priceChangedAtRef.current = Date.now();
      }
      setLivePrice(price);
      setLastFetch(Date.now());
      setStatus("live");
      onPriceChangeRef.current?.(price);
    }

    // ── Polling fallback ─────────────────────────────────────────────────
    async function pollOnce() {
      try {
        const live = await fetchSimpleLivePrice(asset);
        if (stopped || wsConnected) return; // WS came up — stop polling
        handlePrice(live.price);
        setCandles(prev => applyLivePrice(prev, live.price, intervalMs, maxCandles));
      } catch {
        if (!stopped) setStatus(prev => prev === "live" ? "reconnecting" : prev);
      }
    }

    function startFallbackPolling() {
      if (stopped || fallbackId !== null) return;
      void pollOnce();
      fallbackId = setInterval(() => { void pollOnce(); }, POLL_MS);
    }

    function stopFallbackPolling() {
      if (fallbackId !== null) { clearInterval(fallbackId); fallbackId = null; }
    }

    // ── WebSocket connection ──────────────────────────────────────────────
    function connect() {
      if (stopped) return;
      const symbol   = WS_SYMBOL[asset];
      const interval = WS_INTERVAL[range];
      const url      = `${BINANCE_WS_BASE}/${symbol}@kline_${interval}`;

      try {
        ws = new WebSocket(url);
      } catch {
        // WebSocket constructor can throw if the URL is invalid.
        startFallbackPolling();
        return;
      }

      // If the socket doesn't open within 4 seconds, start polling as fallback.
      const openTimeout = setTimeout(() => {
        if (!wsConnected && !stopped) startFallbackPolling();
      }, 4_000);

      ws.onopen = () => {
        clearTimeout(openTimeout);
        if (stopped) { ws?.close(); return; }
        wsConnected = true;
        stopFallbackPolling(); // WS is up — no need to poll
      };

      ws.onmessage = (event) => {
        if (stopped) return;
        try {
          const msg = JSON.parse(event.data as string) as BinanceKlineMessage;
          if (msg.e !== "kline") return;
          const k = msg.k;
          const price = parseFloat(k.c);
          handlePrice(price);
          setCandles(prev => applyKlineUpdate(prev, {
            ts:       k.t,
            open:     parseFloat(k.o),
            high:     parseFloat(k.h),
            low:      parseFloat(k.l),
            close:    price,
            isClosed: k.x,
          }, maxCandles));
        } catch { /* ignore malformed frames */ }
      };

      ws.onclose = () => {
        clearTimeout(openTimeout);
        wsConnected = false;
        if (stopped) return;
        setStatus(prev => prev === "live" ? "reconnecting" : prev);
        // Reconnect after 2 seconds; use polling in the meantime.
        startFallbackPolling();
        reconnectId = setTimeout(() => {
          stopFallbackPolling();
          connect();
        }, 2_000);
      };

      ws.onerror = () => {
        // onclose fires after onerror — let that handle reconnection.
        clearTimeout(openTimeout);
      };
    }

    connect();

    return () => {
      stopped = true;
      if (reconnectId !== null) clearTimeout(reconnectId);
      stopFallbackPolling();
      ws?.close();
    };
  }, [asset, range]);

  // ── Effect 3 — Visual tick (500 ms re-render for live feel) ─────────────
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), VISUAL_TICK_MS);
    return () => clearInterval(id);
  }, []);

  // ── Derived display values ────────────────────────────────────────────────

  // `tick` drives re-renders so `now` stays fresh.
  void tick;

  const now          = Date.now();
  const intervalMs   = INTERVAL_MS[range];
  const rangeMs      = intervalMs * EXPECTED_CANDLES[range];
  const rangeStart   = now - rangeMs;

  // Smooth display price — ease-out glide between two real backend values.
  const displayPrice = (() => {
    if (livePrice === null) return null;
    const prev = prevPriceRef.current;
    if (prev === null || priceChangedAtRef.current === 0) return livePrice;
    const elapsed = Date.now() - priceChangedAtRef.current;
    const t = Math.min(1, elapsed / POLL_MS);
    const eased = 1 - (1 - t) * (1 - t); // ease-out quadratic
    return prev + (livePrice - prev) * eased;
  })();

  // ── Y-axis scale ─────────────────────────────────────────────────────────

  let rawMin = Infinity, rawMax = -Infinity;
  for (const c of candles) {
    if (c.low  < rawMin) rawMin = c.low;
    if (c.high > rawMax) rawMax = c.high;
  }
  if (!Number.isFinite(rawMin)) { rawMin = livePrice ?? 0; rawMax = (livePrice ?? 1) + 1; }
  const rawRng = (rawMax - rawMin) || (rawMin * 0.005) || 1;
  const pad    = rawRng * 0.04;
  const yMin   = rawMin - pad;
  const yMax   = rawMax + pad;
  const yRange = yMax - yMin;

  // ── Candle slot dimensions ────────────────────────────────────────────────

  const numSlots   = EXPECTED_CANDLES[range];
  const slotPx     = CW / Math.max(numSlots, 1);
  const bodyPx     = Math.max(MIN_BODY_PX, Math.min(MAX_BODY_PX, slotPx * 0.65));
  const halfBodyPx = bodyPx / 2;

  // ── Trend / price display ─────────────────────────────────────────────────

  const firstOpen  = candles.length > 0 ? candles[0].open  : null;
  const lastClose  = candles.length > 0 ? candles[candles.length - 1].close : null;
  const trendUp    = firstOpen !== null && lastClose !== null && lastClose > firstOpen;
  const trendFlat  = firstOpen !== null && lastClose !== null && lastClose === firstOpen;
  const pctChange  = firstOpen && lastClose && firstOpen !== 0
    ? ((lastClose - firstOpen) / firstOpen) * 100 : null;
  const priceClass  = trendFlat ? "" : trendUp ? "is-up" : "is-down";
  const headerColor = trendFlat ? DOJI_COLOR : trendUp ? GREEN : RED;
  const livePriceY  = displayPrice !== null ? priceToY(displayPrice, yMin, yRange) : null;

  // ── Axes ──────────────────────────────────────────────────────────────────

  const ticks   = xTicks(rangeStart, now, TICK_MS[range]);
  const timeFmt = range === "7D" ? fmtDay : fmtTime;

  const yLabelCount = 5;
  const yLabels = Array.from({ length: yLabelCount + 1 }, (_, i) => {
    const price = yMin + (yRange * i) / yLabelCount;
    return { price, y: priceToY(price, yMin, yRange) };
  }).reverse();

  // ── Status-derived display strings ────────────────────────────────────────

  const isLoading      = status === "loading";
  const isReconnecting = status === "reconnecting";
  const hasData        = candles.length > 0 || livePrice !== null;

  const liveLabel = isReconnecting ? "RECONNECTING" : "LIVE";
  const dotClass  = status === "live" ? "is-live" : "";

  const realCount = candles.filter(c => !c.isLive).length;
  const liveCount = candles.filter(c => c.isLive).length;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="vc-chart-card">
      {/* ── Header ── */}
      <div className="vc-chart-header">
        {/* Asset selector */}
        <div className="vc-chart-tabs" role="tablist" aria-label="Select asset">
          {(["BTC", "ETH"] as PredictionAsset[]).map(a => (
            <button
              key={a} role="tab" aria-selected={asset === a} type="button"
              className={`vc-chart-tab ${asset === a ? "is-active" : ""}`}
              onClick={() => onAssetChange(a)}
            >{a}</button>
          ))}
        </div>

        {/* Price display */}
        <div className="vc-chart-price">
          {isLoading && !hasData && (
            <span className="vc-chart-price-skeleton">Connecting…</span>
          )}
          {!isLoading && livePrice !== null && (
            <>
              <span className={`vc-chart-price-value ${priceClass}`}>
                {isReconnecting ? "~" : ""}{fmtUsd(displayPrice ?? livePrice)}
              </span>
              {pctChange !== null && (
                <span className={`vc-chart-price-pct ${priceClass}`}>
                  {trendUp ? "▲" : trendFlat ? "—" : "▼"}{" "}
                  {Math.abs(pctChange).toFixed(3)}%
                  <span className="vc-chart-window-lbl"> ({range})</span>
                </span>
              )}
            </>
          )}
          {isReconnecting && livePrice === null && (
            <span className="vc-chart-price-skeleton">Reconnecting…</span>
          )}
        </div>

        {/* Range selector */}
        <div className="vc-chart-tabs" role="tablist" aria-label="Select time range">
          {(["1H", "4H", "24H", "7D"] as ChartRange[]).map(r => (
            <button
              key={r} role="tab" aria-selected={range === r} type="button"
              className={`vc-chart-tab ${range === r ? "is-active" : ""}`}
              onClick={() => setRange(r)}
            >{r}</button>
          ))}
        </div>

        {/* Live / reconnecting indicator */}
        <div className="vc-chart-live" aria-live="polite" aria-atomic="true">
          <span className={`vc-chart-live-dot ${dotClass}`} aria-hidden="true" />
          <span
            className="vc-chart-live-label"
            style={isReconnecting ? { color: "#f59e0b" } : undefined}
          >
            {liveLabel}
          </span>
          {lastFetch !== null && (
            <span className="vc-chart-age" key={tick}>{fmtAge(Date.now() - lastFetch)}</span>
          )}
        </div>
      </div>

      {/* ── SVG Chart ── */}
      <div className="vc-chart-svg-wrap" aria-hidden="true">
        <svg
          viewBox={`0 0 ${VW} ${VH}`}
          className="vc-chart-svg vc-chart-svg--candles"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <clipPath id="vc-candle-clip">
              <rect x={LP} y={TP} width={CW} height={CH} />
            </clipPath>
          </defs>

          {/* Horizontal grid lines */}
          {yLabels.map(({ y }, i) => (
            <line
              key={i} x1={LP} y1={y} x2={LP + CW} y2={y}
              stroke="var(--vc-grid)" strokeWidth="0.6" strokeDasharray="3,6"
            />
          ))}

          {/* Chart border */}
          <line x1={LP} y1={TP} x2={LP} y2={TP + CH} stroke="var(--vc-axis)" strokeWidth="0.8" />
          <line x1={LP} y1={TP + CH} x2={LP + CW} y2={TP + CH} stroke="var(--vc-axis)" strokeWidth="0.8" />

          {/* ── Candles ── */}
          <g clipPath="url(#vc-candle-clip)">
            {candles.map(candle => {
              // Center the candle in its bucket using the bucket midpoint.
              const cx = tsToX(candle.ts + intervalMs / 2, rangeStart, rangeMs);

              const openY  = priceToY(candle.open,  yMin, yRange);
              const closeY = priceToY(candle.close, yMin, yRange);
              const highY  = priceToY(candle.high,  yMin, yRange);
              const lowY   = priceToY(candle.low,   yMin, yRange);

              const isDoji  = Math.abs(candle.close - candle.open) / Math.max(candle.open, 0.01) < 0.0001;
              const isGreen = candle.close >= candle.open;
              const fill    = isDoji ? DOJI_COLOR : isGreen ? GREEN : RED;
              const stroke  = isDoji ? DOJI_COLOR : isGreen ? GREEN_DARK : RED_DARK;

              const bodyTop = Math.min(openY, closeY);
              const bodyBot = Math.max(openY, closeY);
              const bodyH   = Math.max(3, bodyBot - bodyTop);

              return (
                <g key={candle.ts}>
                  <line x1={cx} y1={highY} x2={cx} y2={lowY} stroke={stroke} strokeWidth="1.2" />
                  <rect
                    x={cx - halfBodyPx} y={bodyTop}
                    width={bodyPx} height={bodyH}
                    fill={fill} stroke={stroke} strokeWidth="0.5"
                    fillOpacity={candle.isLive ? 0.72 : 1}
                  />
                </g>
              );
            })}
          </g>

          {/* ── Live price dashed line + label ── */}
          {livePriceY !== null && !isLoading && (
            <g>
              <line
                x1={LP} y1={livePriceY} x2={LP + CW} y2={livePriceY}
                stroke={headerColor} strokeWidth="1"
                strokeDasharray="4,5" opacity={isReconnecting ? 0.4 : 0.6}
              />
              <rect
                x={LP + CW + 2} y={livePriceY - 10}
                width={RP - 4} height={20} rx="3"
                fill={headerColor} opacity={isReconnecting ? 0.6 : 1}
              />
              <text
                x={LP + CW + (RP / 2) + 1} y={livePriceY + 3.5}
                fontSize="9" fill="#fff" fontWeight="700"
                textAnchor="middle" fontFamily="monospace"
              >
                {displayPrice !== null
                  ? (displayPrice >= 1_000 ? displayPrice.toFixed(0) : displayPrice.toFixed(2))
                  : ""}
              </text>
            </g>
          )}

          {/* ── X-axis ticks ── */}
          {ticks.map(ts => {
            const x = tsToX(ts, rangeStart, rangeMs);
            if (x < LP + 26 || x > LP + CW - 26) return null;
            return (
              <g key={ts}>
                <line x1={x} y1={TP + CH} x2={x} y2={TP + CH + 4} stroke="var(--vc-axis)" strokeWidth="0.8" />
                <text x={x} y={VH - 10} fontSize="9" fill="var(--vc-axis)" textAnchor="middle">
                  {timeFmt(ts)}
                </text>
              </g>
            );
          })}

          {/* ── Y-axis labels ── */}
          {yLabels.map(({ price, y }, i) => (
            <text key={i} x={VW - 4} y={y + 3.5} fontSize="8" fill="var(--vc-axis)" textAnchor="end">
              {fmtUsd(price)}
            </text>
          ))}

          {/* ── State overlays ── */}

          {/* Initial loading — no data yet */}
          {isLoading && !hasData && (
            <text x={VW / 2} y={VH / 2} fontSize="13" fill="var(--vc-axis)" opacity="0.5" textAnchor="middle">
              Connecting to live market…
            </text>
          )}

          {/* No candles yet but we have a price */}
          {!isLoading && candles.length === 0 && livePrice !== null && (
            <text x={VW / 2} y={VH / 2} fontSize="12" fill="var(--vc-axis)" opacity="0.45" textAnchor="middle">
              Accumulating {range} data — chart will appear shortly
            </text>
          )}

          {/* Reconnecting badge — chart stays visible */}
          {isReconnecting && hasData && (
            <g>
              <rect x={LP + 6} y={TP + 6} width={100} height={18} rx="3"
                fill="#f59e0b" opacity="0.18" />
              <text x={LP + 56} y={TP + 18} fontSize="9" fill="#b45309"
                fontWeight="700" textAnchor="middle">
                ⟳ RECONNECTING
              </text>
            </g>
          )}
        </svg>
      </div>

      {/* ── Footer ── */}
      <div className="vc-chart-footer">
        <span className="vc-chart-footer-note">
          {range} · {realCount} real{liveCount > 0 ? " + 1 live" : ""} candles · Binance klines · {intervalMs / 60_000}-min buckets
        </span>
        <span className="vc-chart-footer-hint">
          History from REST · live candle from Binance WebSocket (~100ms) · visual tick every {VISUAL_TICK_MS}ms
        </span>
      </div>
    </div>
  );
}
