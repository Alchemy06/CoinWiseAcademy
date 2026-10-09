/**
 * PriceChart.tsx — TradingView Lightweight Charts candlestick chart.
 *
 * Renders daily OHLC candles (pence → GBP for display) with:
 *   - Buy/sell action markers (green arrow-up / red arrow-down)
 *   - Round-boundary markers (amber circle) at each decision date
 *   - Optional logarithmic Y-axis (for assets with large price ranges like LUNA)
 *   - ResizeObserver for responsive width
 *   - Theme-aware colours
 */

import { useEffect, useRef } from "react";
import { createChart, CrosshairMode } from "lightweight-charts";
import type {
  IChartApi,
  ISeriesApi,
  Time,
  SeriesMarker,
} from "lightweight-charts";
import type { CrashCandle, CrashActionLogEntry } from "../../../types/covidCrash";
import { useI18n } from "../../../i18n/provider";

// ── Constants ─────────────────────────────────────────────────────────────────

const CHART_HEIGHT = 320;

/** Fallback round dates — COVID Crash. Override via roundScenarioDates prop. */
const COVID_ROUND_DATES: Record<number, string> = {
  0: "2020-02-14",
  1: "2020-03-13",
  2: "2020-04-30",
  3: "2020-07-31",
  4: "2020-10-31",
};

// ── Theme ─────────────────────────────────────────────────────────────────────

function isDarkMode(): boolean {
  return document.documentElement.dataset.theme === "dark";
}

function priceFormatter(p: number): string {
  if (p < 0.005) return `£${p.toFixed(4)}`;
  if (p < 1)     return `£${p.toFixed(2)}`;
  if (p < 100)   return `£${p.toFixed(0)}`;
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
      // 0 = Normal, 1 = Logarithmic
      mode: logScale ? 1 : 0,
    },
    timeScale: {
      borderColor: axis,
      rightOffset: 6,
      fixLeftEdge: true,
    },
    localization: {
      priceFormatter,
    },
  } as const;
}

// ── Data transformation ────────────────────────────────────────────────────────

function toSeriesData(candles: CrashCandle[]) {
  return candles.map((c) => ({
    time:  c.date as Time,
    open:  c.o / 100,
    high:  c.h / 100,
    low:   c.l / 100,
    close: c.c / 100,
  }));
}

function buildMarkers(
  candles: CrashCandle[],
  actionLog: CrashActionLogEntry[],
  roundScenarioDates: Record<number, string>,
): SeriesMarker<Time>[] {
  const candleDateSet = new Set(candles.map((c) => c.date));
  const markers: SeriesMarker<Time>[] = [];

  // Round-boundary circles at each decision date that has appeared in all_candles
  Object.entries(roundScenarioDates).forEach(([idxStr, date]) => {
    const roundIdx = Number(idxStr);
    if (roundIdx === 0) return; // skip the first date — it's the chart start
    if (!candleDateSet.has(date)) return;
    markers.push({
      time:     date as Time,
      position: "aboveBar",
      color:    "#F5A623",
      shape:    "circle",
      text:     `R${roundIdx + 1}`,
      size:     0.5,
    });
  });

  // Buy / sell markers from action log
  for (const entry of actionLog) {
    markers.push({
      time:     entry.scenario_date as Time,
      position: entry.action === "buy" ? "belowBar" : "aboveBar",
      color:    entry.action === "buy" ? "#0ECB81" : "#E8354A",
      shape:    entry.action === "buy" ? "arrowUp" : "arrowDown",
      text:     entry.action === "buy" ? "B" : "S",
      size:     1,
    });
  }

  // lightweight-charts requires markers in ascending time order
  markers.sort((a, b) => {
    const ta = String(a.time);
    const tb = String(b.time);
    return ta < tb ? -1 : ta > tb ? 1 : 0;
  });

  return markers;
}

// ── Component ─────────────────────────────────────────────────────────────────

interface PriceChartProps {
  candles:   CrashCandle[];
  actionLog: CrashActionLogEntry[];
  /** Use logarithmic Y-axis. Required for assets with large price ranges (e.g. LUNA). */
  logScale?: boolean;
  /** Round decision dates keyed by round index. Defaults to COVID Crash dates. */
  roundScenarioDates?: Record<number, string>;
  /** Asset name shown in the legend. Defaults to "BTC". */
  assetName?: string;
  /** Average buy-in price in pence — drawn as a dashed amber horizontal line. Hidden when null/0. */
  costBasisPence?: number;
}

export function PriceChart({
  candles,
  actionLog,
  logScale = false,
  roundScenarioDates,
  assetName = "BTC",
  costBasisPence,
}: PriceChartProps) {
  const { tx } = useI18n();
  const containerRef  = useRef<HTMLDivElement>(null);
  const chartRef      = useRef<IChartApi | null>(null);
  const seriesRef     = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const costBasisRef  = useRef<ISeriesApi<"Line"> | null>(null);
  const prevCandleLen = useRef(0);

  // ── Mount: create chart and series. Recreate if logScale changes. ─────────
  useEffect(() => {
    if (!containerRef.current) return;

    const dark  = isDarkMode();
    const opts  = chartOptions(dark, logScale);
    const width = containerRef.current.clientWidth || 600;

    const chart = createChart(containerRef.current, {
      ...opts,
      width,
      height: CHART_HEIGHT,
    });

    const series = chart.addCandlestickSeries({
      upColor:       "#0ECB81",
      downColor:     "#E8354A",
      borderVisible: false,
      wickUpColor:   "#0ECB81",
      wickDownColor: "#E8354A",
    });

    const costBasisLine = chart.addLineSeries({
      color:             "#F5A623",
      lineWidth:         1,
      lineStyle:         2,
      priceLineVisible:  false,
      lastValueVisible:  false,
      crosshairMarkerVisible: false,
    });

    chartRef.current  = chart;
    seriesRef.current = series;
    costBasisRef.current = costBasisLine;
    prevCandleLen.current = 0; // reset on remount so fitContent fires again

    // Responsive width
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chartRef.current?.applyOptions({ width: entry.contentRect.width });
      }
    });
    observer.observe(containerRef.current);

    return () => {
      observer.disconnect();
      chart.remove();
      chartRef.current     = null;
      seriesRef.current    = null;
      costBasisRef.current = null;
    };
  }, [logScale]); // recreate only when scale type changes

  // ── Update: push new data whenever candles / actionLog change ────────────
  useEffect(() => {
    const series    = seriesRef.current;
    const costBasis = costBasisRef.current;
    const chart     = chartRef.current;
    if (!series || !chart || candles.length === 0) return;

    const dates = roundScenarioDates ?? COVID_ROUND_DATES;
    series.setData(toSeriesData(candles));
    series.setMarkers(buildMarkers(candles, actionLog, dates));

    if (costBasis) {
      if (costBasisPence && costBasisPence > 0) {
        const cb = costBasisPence / 100;
        costBasis.setData(candles.map((c) => ({ time: c.date as Time, value: cb })));
      } else {
        costBasis.setData([]);
      }
    }

    const isFirstLoad   = prevCandleLen.current === 0;
    const hasNewCandles = candles.length > prevCandleLen.current && prevCandleLen.current > 0;

    if (isFirstLoad) {
      chart.timeScale().fitContent();
    } else if (hasNewCandles) {
      chart.timeScale().scrollToRealTime();
      chart.timeScale().fitContent();
    }

    prevCandleLen.current = candles.length;
  }, [candles, actionLog, roundScenarioDates, costBasisPence]);

  // ── Theme sync: re-apply colours on OS/user theme switch ─────────────────
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const observer = new MutationObserver(() => {
      chartRef.current?.applyOptions(chartOptions(isDarkMode(), logScale));
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    const handleMq = () => {
      if (
        document.documentElement.dataset.theme === "system" ||
        !document.documentElement.dataset.theme
      ) {
        chartRef.current?.applyOptions(chartOptions(mq.matches, logScale));
      }
    };
    mq.addEventListener("change", handleMq);
    return () => {
      observer.disconnect();
      mq.removeEventListener("change", handleMq);
    };
  }, [logScale]);

  return (
    <div className="cc-chart-wrap">
      <div ref={containerRef} className="cc-chart-container" />
      <div className="cc-chart-legend">
        <span className="cc-chart-legend-item cc-chart-legend-item--buy">▲ {tx("Buy")}</span>
        <span className="cc-chart-legend-item cc-chart-legend-item--sell">▼ {tx("Sell")}</span>
        <span className="cc-chart-legend-item cc-chart-legend-item--round">● {tx("Round boundary")}</span>
        {costBasisPence && costBasisPence > 0 ? (
          <span className="cc-chart-legend-item cc-chart-legend-item--cost-basis">
            ╴╴ {tx("Avg entry")}
          </span>
        ) : null}
        <span className="cc-chart-legend-source">
          {tx("Daily OHLC · {asset}/GBP · Historical data", { asset: assetName })}
        </span>
      </div>
    </div>
  );
}
