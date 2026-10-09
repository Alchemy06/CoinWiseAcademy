/**
 * ReplayPriceChart.tsx — Lightweight Charts candlestick chart for Market Replay.
 *
 * Accepts minute-level candles with Unix timestamp `time` fields (as produced
 * by the syntheticFill engine). Distinct from PriceChart.tsx (which uses
 * date strings for the COVID Crash feature).
 *
 * Features:
 *   - Buy/sell action markers (green up arrow / red down arrow)
 *   - Theme-aware colours
 *   - ResizeObserver for responsive width
 *   - Logarithmic Y-axis option
 */

import { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  UTCTimestamp,
  SeriesMarker,
  Time,
} from "lightweight-charts";
import type { MinuteCandle } from "./syntheticFill";
import type { ReplayActionLogEntry } from "../../types/marketReplay";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 320;

// ── Theme helpers ─────────────────────────────────────────────────────────────

function isDarkMode(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

function priceFormatter(p: number): string {
  if (p <= 0)       return "£0";
  if (p < 0.00005)  return `£${p.toFixed(6)}`;
  if (p < 0.005)    return `£${p.toFixed(4)}`;
  if (p < 1)        return `£${p.toFixed(2)}`;
  if (p < 100)      return `£${p.toFixed(0)}`;
  return `£${Math.round(p).toLocaleString("en-GB")}`;
}

function chartOptions(dark: boolean, logScale: boolean) {
  const grid = dark ? "rgba(43,49,57,0.6)" : "rgba(236,238,242,0.8)";
  const axis = dark ? "#2B3139" : "#eceef2";
  const text = dark ? "#6B7A99" : "#6B7A99";
  const bg   = dark ? "#181A20" : "#ffffff";

  return {
    layout: {
      background: { color: bg },
      textColor: text,
      fontSize: 11,
    },
    grid: {
      vertLines: { color: grid },
      horzLines: { color: grid },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: {
        color: dark ? "#5a6a8a" : "#9097A4",
        labelBackgroundColor: dark ? "#2B3139" : "#9097A4",
      },
      horzLine: {
        color: dark ? "#5a6a8a" : "#9097A4",
        labelBackgroundColor: dark ? "#2B3139" : "#9097A4",
      },
    },
    rightPriceScale: {
      borderColor: axis,
      mode: logScale ? 1 : 0,
    },
    timeScale: {
      borderColor: axis,
      rightOffset: 6,
      fixLeftEdge: true,
      timeVisible: true,
      secondsVisible: false,
    },
    localization: {
      priceFormatter,
    },
  } as const;
}

// ── Marker builder ────────────────────────────────────────────────────────────

function buildMarkers(actionLog: ReplayActionLogEntry[]): SeriesMarker<Time>[] {
  const markers: SeriesMarker<Time>[] = [];

  for (const entry of actionLog) {
    // Convert the stored ISO datetime to a Unix timestamp (seconds) for the chart
    const ts = Math.floor(new Date(entry.simulated_date).getTime() / 1000) as UTCTimestamp;
    markers.push({
      time: ts as Time,
      position: entry.action === "buy" ? "belowBar" : "aboveBar",
      color: entry.action === "buy" ? "#0ECB81" : "#E8354A",
      shape: entry.action === "buy" ? "arrowUp" : "arrowDown",
      text: entry.action === "buy" ? "B" : "S",
      size: 1,
    });
  }

  // Lightweight Charts requires markers in ascending time order
  markers.sort((a, b) => Number(a.time) - Number(b.time));

  return markers;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface ReplayPriceChartProps {
  minuteCandles: MinuteCandle[];
  actionLog: ReplayActionLogEntry[];
  logScale?: boolean;
  assetName?: string;
}

export function ReplayPriceChart({
  minuteCandles,
  actionLog,
  logScale = false,
  assetName = "BTC",
}: ReplayPriceChartProps) {
  const containerRef   = useRef<HTMLDivElement>(null);
  const chartRef       = useRef<IChartApi | null>(null);
  const seriesRef      = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const initializedRef = useRef(false);
  const prevLengthRef  = useRef(0);

  // ── Create chart once ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const dark = isDarkMode();
    const chart = createChart(containerRef.current, {
      ...chartOptions(dark, logScale),
      width: containerRef.current.clientWidth,
      height: CHART_HEIGHT,
    });

    const series = chart.addCandlestickSeries({
      upColor:          "#0ECB81",
      downColor:        "#E8354A",
      borderUpColor:    "#0ECB81",
      borderDownColor:  "#E8354A",
      wickUpColor:      "#0ECB81",
      wickDownColor:    "#E8354A",
    });

    chartRef.current  = chart;
    seriesRef.current = series;

    // Responsive resize
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chart.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current     = null;
      seriesRef.current    = null;
      initializedRef.current = false;
      prevLengthRef.current  = 0;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [logScale]);

  // ── Update data whenever candles / actionLog change ────────────────────────
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || minuteCandles.length === 0) return;

    const newCount  = minuteCandles.length;
    const prevCount = prevLengthRef.current;

    if (!initializedRef.current || newCount <= prevCount) {
      // Full reset: first load, or candle count went backwards (e.g. chart recreated)
      series.setData(
        minuteCandles.map((c) => ({
          time:  c.time as UTCTimestamp,
          open:  c.open,
          high:  c.high,
          low:   c.low,
          close: c.close,
        })),
      );
      initializedRef.current = true;
    } else {
      // Incremental: only push the newly visible candles
      for (let i = prevCount; i < newCount; i++) {
        const c = minuteCandles[i];
        series.update({ time: c.time as UTCTimestamp, open: c.open, high: c.high, low: c.low, close: c.close });
      }
    }

    prevLengthRef.current = newCount;
    series.setMarkers(buildMarkers(actionLog));
  }, [minuteCandles, actionLog]);

  return (
    <div
      ref={containerRef}
      aria-label={`${assetName}/GBP minute candlestick chart`}
      style={{ width: "100%", height: CHART_HEIGHT }}
    />
  );
}
