import { useEffect, useRef } from 'react';
import { createChart, IChartApi, ISeriesApi } from 'lightweight-charts';
import type { GFCMultiCandle, GFCTick } from '../../../types/covidCrash';

const ASSET_COLORS: Record<string, string> = {
  FTSE: '#3B82F6',
  RBS:  '#EF4444',
  BP:   '#22C55E',
  GOLD: '#F59E0B',
  GILT: '#9CA3AF',
};

interface MultiAssetChartProps {
  candles: GFCMultiCandle[];
  assets: string[];
  /** Live tick to append to the chart. Null when round not active. */
  liveTick?: GFCTick | null;
}

export function MultiAssetChart({ candles, assets, liveTick }: MultiAssetChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesMap = useRef<Record<string, ISeriesApi<'Line'>>>({});
  const startPrices = useRef<Record<string, number>>({});

  // Initialise chart once
  useEffect(() => {
    if (!containerRef.current) return;
    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth,
      height: 280,
      layout: {
        background: { color: 'transparent' },
        textColor: '#9CA3AF',
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.05)' },
        horzLines: { color: 'rgba(255,255,255,0.05)' },
      },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)' },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)' },
      crosshair: { mode: 1 },
    });

    for (const asset of assets) {
      const series = chart.addLineSeries({
        color: ASSET_COLORS[asset] ?? '#888',
        lineWidth: 2,
        title: asset,
        priceLineVisible: false,
        lastValueVisible: true,
      });
      seriesMap.current[asset] = series;
    }

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ width: containerRef.current.clientWidth });
      }
    });
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, []);

  // Load candle data
  useEffect(() => {
    if (!candles.length || !chartRef.current) return;

    // Record start prices for normalisation
    const first = candles[0];
    for (const asset of assets) {
      const entry = first[asset] as { o: number; h: number; l: number; c: number } | undefined;
      startPrices.current[asset] = entry?.o ?? 1;
    }

    for (const asset of assets) {
      const series = seriesMap.current[asset];
      if (!series) continue;
      const basePrice = startPrices.current[asset] || 1;
      const data = candles
        .filter(c => {
          const e = c[asset] as { o: number; h: number; l: number; c: number } | undefined;
          return e !== undefined;
        })
        .map(c => {
          const e = c[asset] as { o: number; h: number; l: number; c: number };
          return {
            time: c.date as string,
            value: (e.c / basePrice) * 100,
          };
        });
      series.setData(data);
    }

    chartRef.current.timeScale().fitContent();
  }, [candles]);

  // Append live tick as a point
  useEffect(() => {
    if (!liveTick || !chartRef.current) return;
    // Use the last candle date + a pseudo-time offset
    if (!candles.length) return;
    // We skip live tick charting here — prices are already shown in the portfolio panel.
    // In a more sophisticated implementation we'd use a realtime bar series.
  }, [liveTick]);

  return (
    <div className="gfc-chart-wrap">
      <div ref={containerRef} className="gfc-chart-container" />
      <div className="gfc-chart-legend">
        {assets.map(asset => (
          <div key={asset} className="gfc-chart-legend-item">
            <span className="gfc-chart-legend-dot" style={{ background: ASSET_COLORS[asset] }} />
            <span className="gfc-chart-legend-label">{asset}</span>
          </div>
        ))}
        <span className="gfc-chart-legend-note">Normalised to 100 at start</span>
      </div>
    </div>
  );
}
