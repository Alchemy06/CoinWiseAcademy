import { useEffect, useEffectEvent, useRef, useState } from "react";
import { CRYPTO_REFRESH_INTERVAL_MS } from "../../constants/crypto";
import { useI18n } from "../../i18n/provider";
import type { TranslationParams } from "../../i18n/messages";
import type {
  CryptoChartSeries,
  CryptoCoinId,
  CryptoDashboardState,
  CryptoMarketAsset,
  CryptoTone,
  FiatCurrency
} from "../../types/crypto";
import { fetchCryptoDashboardData } from "../../utils/cryptoPrices";

type TrendCopy = {
  quote: string;
};

type Translator = (source: string, params?: TranslationParams) => string;

const DISPLAY_SEGMENT_COUNT = 8;
const DISPLAY_NODE_COUNT = DISPLAY_SEGMENT_COUNT + 1;
const Y_TICK_TARGET = 6;
const DAY_IN_MS = 24 * 60 * 60 * 1000;
const SESSION_STEP_MS = DAY_IN_MS / DISPLAY_SEGMENT_COUNT;

// Fixed chart dimensions keep the SVG math simple while CSS handles responsive overflow for smaller screens.
const CHART_LAYOUT = {
  width: 880,
  height: 388,
  top: 24,
  right: 26,
  bottom: 88,
  left: 78
} as const;

const MARKER_BY_TONE: Record<CryptoTone, "circle" | "triangle" | "square" | "diamond"> = {
  bitcoin: "circle",
  ethereum: "triangle",
  solana: "square",
  ripple: "diamond"
};

function createInitialDashboardState(): CryptoDashboardState {
  // Start in a loading state so the page can immediately render its shell before the first network response lands.
  return {
    data: null,
    isLoading: true,
    error: null,
    isStale: false
  };
}

function formatCurrency(value: number | null, currency: FiatCurrency, compact = false): string {
  // Use one formatter path for table, toolbar, and narrative copy so values stay visually consistent.
  if (value === null) {
    return "—";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: currency.toUpperCase(),
    currencyDisplay: "narrowSymbol",
    notation: compact ? "compact" : "standard",
    maximumFractionDigits: compact ? 1 : value >= 1 ? 2 : 4,
    minimumFractionDigits: compact ? 0 : value >= 1 ? 2 : 4
  }).format(value);
}

function formatPercent(value: number | null): string {
  // Keep positive values explicitly signed because the chart/table compare assets side by side.
  if (value === null) {
    return "—";
  }

  const prefix = value > 0 ? "+" : "";
  return `${prefix}${value.toFixed(2)}%`;
}

function formatSyncLabel(value: string | null): string {
  // Toolbar copy distinguishes "never loaded" from "last loaded at" without needing a second status field.
  if (!value) {
    return "Waiting for the first live market snapshot.";
  }

  return `Updated ${new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(new Date(value))}`;
}

function RefreshGlyph({ isSpinning }: { isSpinning: boolean }) {
  // Keep the refresh icon inline so the table action can match the same thin-stroke language as the chat controls.
  return (
    <svg
      aria-hidden="true"
      className={isSpinning ? "is-spinning" : undefined}
      fill="none"
      viewBox="0 0 24 24"
    >
      <path
        d="M3.75 12.5a8.25 8.25 0 1 0 2.9-6.3"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.85"
      />
      <path
        d="M3.75 3.75v5.5h5.5"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.85"
      />
    </svg>
  );
}

function parseTimestamp(value: string): number {
  // Centralize timestamp parsing so chart helpers all use the same millisecond representation.
  return new Date(value).getTime();
}

function formatSessionTickLabel(timestamp: number, index: number, totalCount: number): string {
  // Force the closing label to 24:00 so the x-axis reads as a full-day session instead of rolling into the next day.
  if (index === totalCount - 1) {
    return "24:00";
  }

  const date = new Date(timestamp);
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");

  return `${hour}:${minute}`;
}

function formatAxisPercent(value: number, step: number): string {
  // Decimal precision follows tick size so labels stay clean across both calm and volatile sessions.
  const normalizedValue = Object.is(value, -0) ? 0 : value;
  const decimals = step >= 1 ? 0 : step >= 0.25 ? 1 : 2;
  const prefix = normalizedValue > 0 ? "+" : "";

  return `${prefix}${normalizedValue.toFixed(decimals)}%`;
}

function formatAssetList(names: string[], tx: Translator): string {
  // Keep short inline lists readable without pulling in Intl.ListFormat for this tiny fixed set of assets.
  if (names.length <= 1) {
    return names[0] ?? "";
  }

  if (names.length === 2) {
    return tx("{first} and {second}", { first: names[0], second: names[1] });
  }

  return tx("{leading}, and {last}", {
    leading: names.slice(0, -1).join(", "),
    last: names.at(-1) ?? ""
  });
}

function getRelativeMoveContext(asset: CryptoMarketAsset, assets: CryptoMarketAsset[], tx: Translator): string {
  // Compare only assets with live 24h data so the narrative never invents rankings from partial payloads.
  const rankedAssets = assets
    .filter((candidate): candidate is CryptoMarketAsset & { change24h: number } => candidate.change24h !== null)
    .toSorted((left, right) => right.change24h - left.change24h);

  if (rankedAssets.length <= 1) {
    // Ranking language is meaningless until at least two assets have comparable intraday moves.
    return tx("Cross-asset leadership is limited while comparable 24h data fills in.");
  }

  const selectedRank = rankedAssets.findIndex((candidate) => candidate.coinId === asset.coinId);
  if (selectedRank === -1) {
    // Selected asset may still be missing live 24h change even while peers have data, so fail closed.
    return tx("Cross-asset leadership is limited while comparable 24h data fills in.");
  }

  // Reuse the same ranked list for tie detection so every branch speaks from one consistent ordering source.
  const leaderChange = rankedAssets[0].change24h;
  const laggardChange = rankedAssets.at(-1)?.change24h ?? rankedAssets[0].change24h;
  const leaders = rankedAssets.filter((candidate) => candidate.change24h === leaderChange);
  const laggards = rankedAssets.filter((candidate) => candidate.change24h === laggardChange);
  const isLeader = leaders.some((candidate) => candidate.coinId === asset.coinId);
  const isLaggard = laggards.some((candidate) => candidate.coinId === asset.coinId);

  if (leaders.length > 1) {
    // Call out ties only when the selected asset participates; otherwise the note should stay focused on itself.
    return isLeader
      ? tx("{asset} is tied for the strongest 24h move in this set.", { asset: asset.name })
      : tx("{assets} are tied for the strongest 24h move today.", {
          assets: formatAssetList(leaders.map((candidate) => candidate.name), tx)
        });
  }

  if (isLeader) {
    // Only the current leader gets the direct "strongest mover" phrasing so other tabs do not repeat it.
    return tx("{asset} is currently the strongest 24h mover in this set.", { asset: asset.name });
  }

  if (laggards.length > 1 && isLaggard) {
    // Mirror the tie wording on the downside so the weakest slot behaves consistently with the leader slot.
    return tx("{asset} is tied for the weakest 24h move in this set.", { asset: asset.name });
  }

  if (isLaggard) {
    // Keep the weakest case self-contained instead of restating who leads the board.
    return tx("{asset} is currently the weakest 24h mover in this set.", { asset: asset.name });
  }

  // Mid-pack assets get a compact ordinal read rather than a repeated callout of the current leader.
  return tx("{asset} ranks {rank} of {total} on 24h performance today.", {
    asset: asset.name,
    rank: selectedRank + 1,
    total: rankedAssets.length
  });
}

function buildTrendCopy(asset: CryptoMarketAsset, assets: CryptoMarketAsset[], currency: FiatCurrency, tx: Translator): TrendCopy {
  // Narrative copy is derived from the same quantitative fields shown elsewhere so the prose stays auditable.
  const dayTone =
    asset.change24h === null
      ? tx("is unreadable")
      : asset.change24h >= 3
        ? tx("is pressing higher")
        : asset.change24h > 0
          ? tx("is slightly firmer")
          : asset.change24h <= -3
            ? tx("is under pressure")
            : asset.change24h < 0
              ? tx("is fading")
              : tx("is flat");

  const rangeTone =
    asset.currentPrice !== null &&
    asset.high24h !== null &&
    asset.low24h !== null &&
    asset.high24h !== asset.low24h
      ? (() => {
          const ratio = (asset.currentPrice - asset.low24h) / (asset.high24h - asset.low24h);

          if (ratio >= 0.67) {
            return tx("Price is trading in the upper portion of the day range.");
          }

          if (ratio <= 0.33) {
            return tx("Price is sitting near the lower edge of the day range.");
          }

          return tx("Price is holding around the middle of the day range.");
        })()
      : tx("Day range positioning is limited.");

  const weeklyTone =
    asset.change7d === null ? tx("7d read unavailable.") : tx("{change} over 7d.", { change: formatPercent(asset.change7d) });
  // Add one relative-performance sentence so the panel reacts to the latest market ordering without hard-coded coin lore.
  const relativeMoveContext = getRelativeMoveContext(asset, assets, tx);

  return {
    quote: tx("{asset} {dayTone}. {price} now, {change24h} today. {weeklyTone} {rangeTone} {relativeMoveContext}", {
      asset: asset.name,
      dayTone,
      price: formatCurrency(asset.currentPrice, currency),
      change24h: formatPercent(asset.change24h),
      weeklyTone,
      rangeTone,
      relativeMoveContext
    })
  };
}

function getChartFrame() {
  // Split outer SVG bounds from inner plot area once so later geometry helpers can stay argument-light.
  const { width, height, top, right, bottom, left } = CHART_LAYOUT;

  return {
    width,
    height,
    top,
    left,
    plotWidth: width - left - right,
    plotHeight: height - top - bottom
  };
}

function getNiceStep(rawStep: number): number {
  // Round into human-friendly steps so percentage ticks look editorial rather than purely mathematical.
  if (!Number.isFinite(rawStep) || rawStep <= 0) {
    return 1;
  }

  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const normalized = rawStep / magnitude;

  if (normalized <= 1) {
    return magnitude;
  }

  if (normalized <= 2) {
    return 2 * magnitude;
  }

  if (normalized <= 2.5) {
    return 2.5 * magnitude;
  }

  if (normalized <= 5) {
    return 5 * magnitude;
  }

  return 10 * magnitude;
}

function getTickValues(series: CryptoChartSeries[]): { tickValues: number[]; minValue: number; maxValue: number; step: number } {
  // Base the y-axis on relative change because absolute prices are not comparable across these assets.
  const values = series.flatMap((item) => item.points.map((point) => point.relativeChange));
  let minValue = Math.min(...values, 0);
  let maxValue = Math.max(...values, 0);

  if (minValue === maxValue) {
    // Flat series still need vertical breathing room or every point would collapse onto a single line.
    const padding = Math.max(Math.abs(minValue) * 0.12, 1);
    minValue -= padding;
    maxValue += padding;
  }

  const paddedSpread = maxValue - minValue;
  const padding = Math.max(paddedSpread * 0.1, 0.5);
  const paddedMin = minValue - padding;
  const paddedMax = maxValue + padding;
  const step = getNiceStep((paddedMax - paddedMin) / (Y_TICK_TARGET - 1));
  const scaledMin = Math.floor(paddedMin / step) * step;
  const scaledMax = Math.ceil(paddedMax / step) * step;
  const tickValues: number[] = [];

  for (let value = scaledMin; value <= scaledMax + step / 2; value += step) {
    tickValues.push(Number(value.toFixed(6)));
  }

  return {
    tickValues,
    minValue: scaledMin,
    maxValue: scaledMax,
    step
  };
}

function getSessionWindow(referenceTimestamp: number): { tickValues: number[]; minTimestamp: number; maxTimestamp: number } {
  // Normalize every chart to a midnight-to-midnight window for easier cross-asset visual comparison.
  const windowStart = new Date(referenceTimestamp);
  windowStart.setHours(0, 0, 0, 0);

  const minTimestamp = windowStart.getTime();
  const maxTimestamp = minTimestamp + DAY_IN_MS;
  const tickValues = Array.from({ length: DISPLAY_NODE_COUNT }, (_, index) => minTimestamp + SESSION_STEP_MS * index);

  return {
    tickValues,
    minTimestamp,
    maxTimestamp
  };
}

function getPointX(timestamp: number, minTimestamp: number, maxTimestamp: number, left: number, plotWidth: number): number {
  // Guard the denominator so partially empty time ranges cannot produce NaN coordinates.
  return left + ((timestamp - minTimestamp) / Math.max(maxTimestamp - minTimestamp, 1)) * plotWidth;
}

function getPointY(value: number, min: number, max: number, top: number, plotHeight: number): number {
  return top + ((max - value) / Math.max(max - min, 1)) * plotHeight;
}

function interpolatePriceAtTimestamp(points: CryptoChartSeries["points"], timestamp: number): number | null {
  // Resampling needs linear interpolation because the incoming sparkline rarely lands on our exact session ticks.
  if (points.length === 0) {
    return null;
  }

  const firstPointTimestamp = parseTimestamp(points[0].timestamp);
  const lastPointTimestamp = parseTimestamp(points.at(-1)?.timestamp ?? points[0].timestamp);

  if (timestamp < firstPointTimestamp || timestamp > lastPointTimestamp) {
    return null;
  }

  if (timestamp <= firstPointTimestamp) {
    return points[0].price;
  }

  for (let index = 1; index < points.length; index += 1) {
    const previousPoint = points[index - 1];
    const currentPoint = points[index];
    const previousTimestamp = parseTimestamp(previousPoint.timestamp);
    const currentTimestamp = parseTimestamp(currentPoint.timestamp);

    if (timestamp === currentTimestamp) {
      return currentPoint.price;
    }

    if (timestamp < currentTimestamp) {
      // Interpolate within the enclosing segment so each series can align to the shared x-axis grid.
      const ratio = (timestamp - previousTimestamp) / Math.max(currentTimestamp - previousTimestamp, 1);
      return previousPoint.price + (currentPoint.price - previousPoint.price) * ratio;
    }
  }

  return points.at(-1)?.price ?? null;
}

function resampleSeriesForSession(series: CryptoChartSeries, tickValues: number[]): CryptoChartSeries {
  // Rebuild each series onto the shared session ticks before plotting so line/marker alignment is deterministic.
  if (series.points.length === 0) {
    return {
      ...series,
      points: []
    };
  }

  const sampledPoints = tickValues
    .map((timestamp) => {
      const price = interpolatePriceAtTimestamp(series.points, timestamp);

      return price === null
        ? null
        : {
            timestamp: new Date(timestamp).toISOString(),
            price,
            relativeChange: 0
          };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null);

  const baseline = sampledPoints[0]?.price ?? null;

  return {
    ...series,
    points: sampledPoints.map((point) => ({
      ...point,
      // Relative change is recomputed after resampling so the chart baseline matches the first visible session point.
      relativeChange: baseline ? ((point.price - baseline) / baseline) * 100 : 0
    }))
  };
}

function buildChartPolyline(
  series: CryptoChartSeries,
  min: number,
  max: number,
  minTimestamp: number,
  maxTimestamp: number,
  left: number,
  top: number,
  plotWidth: number,
  plotHeight: number
): string {
  // SVG polyline expects a flat "x,y x,y" string, so precompute it once per rendered series.
  return series.points
    .map((point) => {
      const x = getPointX(parseTimestamp(point.timestamp), minTimestamp, maxTimestamp, left, plotWidth);
      const y = getPointY(point.relativeChange, min, max, top, plotHeight);
      return `${x},${y}`;
    })
    .join(" ");
}

function renderSeriesMarker(tone: CryptoTone, x: number, y: number, key: string) {
  // Match each asset with a distinct marker shape so the lines remain distinguishable even without color.
  const marker = MARKER_BY_TONE[tone];
  const className = `market-series-point tone-${tone}`;
  const size = 7.2;

  if (marker === "triangle") {
    return <polygon className={className} key={key} points={`${x},${y - size * 0.72} ${x - size * 0.78},${y + size * 0.56} ${x + size * 0.78},${y + size * 0.56}`} />;
  }

  if (marker === "square") {
    return <rect className={className} height={size * 1.32} key={key} rx={1.2} width={size * 1.32} x={x - (size * 1.32) / 2} y={y - (size * 1.32) / 2} />;
  }

  if (marker === "diamond") {
    return <rect className={className} height={size * 1.26} key={key} rx={1} transform={`translate(${x} ${y}) rotate(45) translate(${-((size * 1.26) / 2)} ${-((size * 1.26) / 2)})`} width={size * 1.26} />;
  }

  return <circle className={className} cx={x} cy={y} key={key} r={size * 0.56} />;
}

function ChartPanel({
  assets,
  chartSeries
}: {
  assets: CryptoMarketAsset[];
  chartSeries: CryptoChartSeries[];
}) {
  const { tx } = useI18n();
  // Hide the chart entirely until at least one usable series arrives; the empty state explains the blank area.
  const visibleSeries = chartSeries.filter((item) => item.points.length > 0);

  if (visibleSeries.length === 0) {
    return (
      <div className="market-empty-state">
        <p>{tx("Chart data will appear here after the first successful refresh.")}</p>
      </div>
    );
  }

  const latestTimestamp = Math.max(...visibleSeries.flatMap((series) => series.points.map((point) => parseTimestamp(point.timestamp))));
  // Convert every asset onto the same intraday session window before deriving axes and plotting geometry.
  const sessionWindow = getSessionWindow(latestTimestamp);
  const sessionSeries = visibleSeries.map((series) => resampleSeriesForSession(series, sessionWindow.tickValues));
  const { tickValues, minValue, maxValue, step } = getTickValues(sessionSeries);
  const { width, height, left, top, plotWidth, plotHeight } = getChartFrame();
  const { tickValues: timeTickValues, minTimestamp, maxTimestamp } = sessionWindow;
  const xAxisY = top + plotHeight;

  return (
    <>
      <div className="market-chart-legend" aria-label={tx("Market chart legend")}>
        {assets.map((asset) => (
          <article className={`market-legend-item tone-${asset.tone}`} key={asset.coinId}>
            <span className={`market-legend-dot shape-${MARKER_BY_TONE[asset.tone]}`} />
            <span className="market-legend-name">{asset.name}</span>
          </article>
        ))}
      </div>

      <div className="market-chart-wrap">
        <svg aria-label={tx("24 hour normalized market chart")} className="market-chart" viewBox={`0 0 ${width} ${height}`}>
          <text
            className="market-axis-title"
            textAnchor="middle"
            transform={`translate(24 ${top + plotHeight / 2}) rotate(-90)`}
          >
            {tx("Relative move (%)")}
          </text>

          {tickValues.map((value) => {
            const y = getPointY(value, minValue, maxValue, top, plotHeight);

            return (
              <g key={value}>
                <line className="market-grid-line" x1={left} x2={left + plotWidth} y1={y} y2={y} />
                <line className="market-axis-tick" x1={left - 6} x2={left} y1={y} y2={y} />
                <text className="market-axis-label" textAnchor="end" x={left - 10} y={y + 4}>
                  {formatAxisPercent(value, step)}
                </text>
              </g>
            );
          })}

          <line className="market-axis-stroke" x1={left} x2={left} y1={top} y2={xAxisY} />
          <line className="market-axis-stroke" x1={left} x2={left + plotWidth} y1={xAxisY} y2={xAxisY} />

          {sessionSeries.map((series) => (
            <g key={series.coinId}>
              <polyline
                className={`market-series-line tone-${series.tone}`}
                fill="none"
                points={buildChartPolyline(series, minValue, maxValue, minTimestamp, maxTimestamp, left, top, plotWidth, plotHeight)}
              />
              {series.points.map((point) => {
                const x = getPointX(parseTimestamp(point.timestamp), minTimestamp, maxTimestamp, left, plotWidth);
                const y = getPointY(point.relativeChange, minValue, maxValue, top, plotHeight);
                return renderSeriesMarker(series.tone, x, y, `${series.coinId}-${point.timestamp}`);
              })}
            </g>
          ))}

          {timeTickValues.map((timestamp, labelIndex) => {
            const x = getPointX(timestamp, minTimestamp, maxTimestamp, left, plotWidth);
            // Future ticks stay visible so the axis always spans 24 hours even if the newest refresh was mid-session.
            const isFutureTick = timestamp > latestTimestamp;

            return (
              <g key={`${timestamp}-${labelIndex}`}>
                <line className={isFutureTick ? "market-axis-tick is-future" : "market-axis-tick"} x1={x} x2={x} y1={xAxisY} y2={xAxisY + 6} />
                <text
                  className={isFutureTick ? "market-axis-label market-axis-label-time is-future" : "market-axis-label market-axis-label-time"}
                  textAnchor={labelIndex === 0 ? "start" : labelIndex === timeTickValues.length - 1 ? "end" : "middle"}
                  x={x}
                  y={xAxisY + 34}
                >
                  {formatSessionTickLabel(timestamp, labelIndex, timeTickValues.length)}
                </text>
              </g>
            );
          })}

          <text className="market-axis-title" textAnchor="middle" x={left + plotWidth / 2} y={height - 8}>
            {tx("00:00 to 24:00")}
          </text>
        </svg>
      </div>
    </>
  );
}

function TrendPanel({
  assets,
  fiatCurrency,
  selectedCoinId,
  onSelectCoin
}: {
  assets: CryptoMarketAsset[];
  fiatCurrency: FiatCurrency;
  selectedCoinId: CryptoCoinId;
  onSelectCoin: (coinId: CryptoCoinId) => void;
}) {
  const { tx } = useI18n();
  // Keep the selected asset stable across refreshes as long as it still exists in the latest payload.
  const selectedAsset = assets.find((asset) => asset.coinId === selectedCoinId) ?? assets[0];

  if (!selectedAsset) {
    return (
      <div className="market-empty-state">
        <p>{tx("Trend commentary will appear after the first successful refresh.")}</p>
      </div>
    );
  }

  const trendCopy = buildTrendCopy(selectedAsset, assets, fiatCurrency, tx);

  return (
    <>
      <div className="trend-switch-row">
        <div className="trend-switch" role="tablist" aria-label={tx("Select asset trend note")}>
          {assets.map((asset) => (
            <button
              aria-selected={asset.coinId === selectedAsset.coinId}
              className={asset.coinId === selectedAsset.coinId ? "is-active" : ""}
              key={asset.coinId}
              onClick={() => onSelectCoin(asset.coinId)}
              role="tab"
              type="button"
            >
              {asset.name}
            </button>
          ))}
        </div>
      </div>

      <div className="trend-quote-block">
        <p className="trend-quote-text">{trendCopy.quote}</p>
        <footer className="trend-quote-footer">
          <span>{tx("CoinGecko data")}</span>
          <a href={selectedAsset.officialWebsite} rel="noreferrer" target="_blank">
            {tx("Official")}
          </a>
        </footer>
      </div>
    </>
  );
}

function ComparisonTable({ assets, fiatCurrency }: { assets: CryptoMarketAsset[]; fiatCurrency: FiatCurrency }) {
  const { tx } = useI18n();
  // The table is the dense factual companion to the more narrative chart and trend panels above it.
  if (assets.length === 0) {
    return (
      <div className="market-empty-state">
        <p>{tx("Comparison rows will appear after the first successful refresh.")}</p>
      </div>
    );
  }

  return (
    <div className="market-table-wrap">
      <table className="comparison-table">
        <thead>
          <tr>
            <th>{tx("Asset")}</th>
            <th>{tx("Spot price")}</th>
            <th>24h</th>
            <th>7d</th>
            <th>{tx("Market cap")}</th>
            <th>{tx("24h volume")}</th>
          </tr>
        </thead>
        <tbody>
          {assets.map((asset) => (
            <tr key={asset.coinId}>
              <th scope="row">
                <div className="comparison-asset-cell">
                  <div>
                    <strong>{asset.name}</strong>
                    <span>{asset.symbol.toUpperCase()}</span>
                  </div>
                </div>
              </th>
              <td>{formatCurrency(asset.currentPrice, fiatCurrency)}</td>
              <td className={asset.change24h !== null && asset.change24h >= 0 ? "is-positive" : "is-negative"}>{formatPercent(asset.change24h)}</td>
              <td className={asset.change7d !== null && asset.change7d >= 0 ? "is-positive" : "is-negative"}>{formatPercent(asset.change7d)}</td>
              <td>{formatCurrency(asset.marketCap, fiatCurrency, true)}</td>
              <td>{formatCurrency(asset.totalVolume, fiatCurrency, true)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function CryptoMarketStructureModule() {
  const { tx } = useI18n();
  const [fiatCurrency, setFiatCurrency] = useState<FiatCurrency>("gbp");
  const [selectedCoinId, setSelectedCoinId] = useState<CryptoCoinId>("bitcoin");
  const [dashboardState, setDashboardState] = useState<CryptoDashboardState>(() => createInitialDashboardState());
  // Manual refresh gets its own small pending state so the table action can animate without blocking the whole module shell.
  const [isManualRefreshPending, setIsManualRefreshPending] = useState(false);
  // Incrementing generation ids lets late async responses fail closed after currency switches or effect teardown.
  const refreshGenerationRef = useRef(0);

  const loadDashboardData = useEffectEvent(async (preserveExistingData: boolean, manual = false, generation = refreshGenerationRef.current) => {
    if (manual) {
      setIsManualRefreshPending(true);
    }

    // When refreshing an existing snapshot, keep it on-screen and only update the banner/loading status around it.
    setDashboardState((current) => ({
      data: preserveExistingData ? current.data : null,
      isLoading: true,
      error: null,
      isStale: false
    }));

    try {
      // Manual refreshes bypass the short backend cache while passive refreshes keep using the cheaper cached path.
      const data = await fetchCryptoDashboardData(fiatCurrency, { forceRefresh: manual });

      if (refreshGenerationRef.current !== generation) {
        // Ignore responses that belong to an older currency/effect generation so stale payloads cannot overwrite the latest view.
        return;
      }

      setDashboardState({
        data,
        isLoading: false,
        // Backend stale responses reuse the error banner area as a non-fatal warning surface.
        error: data.isStale ? data.staleReason ?? "Live data is temporarily stale. Showing the last successful refresh." : null,
        isStale: data.isStale
      });
    } catch {
      if (refreshGenerationRef.current !== generation) {
        return;
      }

      setDashboardState((current) => ({
        data: preserveExistingData ? current.data : null,
        isLoading: false,
        // Refresh failures degrade into a stale warning only when we still have something meaningful to show.
        error: preserveExistingData && current.data ? "Live data is temporarily stale. Showing the last successful refresh." : "Unable to load live crypto market data right now.",
        isStale: preserveExistingData && current.data !== null
      }));
    } finally {
      // Reset the button affordance only for the still-active generation so obsolete requests cannot clear a newer spinner.
      if (manual && refreshGenerationRef.current === generation) {
        setIsManualRefreshPending(false);
      }
    }
  });

  useEffect(() => {
    // Each currency change gets a fresh generation so focus/poll/manual responses from the previous currency are ignored.
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;
    setIsManualRefreshPending(false);

    async function runRefresh(preserveExistingData: boolean) {
      await loadDashboardData(preserveExistingData, false, generation);
    }

    void runRefresh(false);

    function handleWindowFocus() {
      // Focus regain is a cheap signal that the user wants fresher data without waiting for the next poll tick.
      void runRefresh(true);
    }

    function handleVisibilityChange() {
      if (document.hidden) {
        return;
      }

      // Visibility change covers tab switches where focus events are inconsistent across browsers.
      void runRefresh(true);
    }

    // Poll in the background while also refreshing on foreground return so the page feels current without hammering.
    const intervalId = window.setInterval(() => {
      void runRefresh(true);
    }, CRYPTO_REFRESH_INTERVAL_MS);
    window.addEventListener("focus", handleWindowFocus);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      refreshGenerationRef.current += 1;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleWindowFocus);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [fiatCurrency]);

  useEffect(() => {
    // Currency switches or partial payloads should not leave the trend tab pointing at a now-missing asset id.
    if (!dashboardState.data) {
      return;
    }

    if (!dashboardState.data.assets.some((asset) => asset.coinId === selectedCoinId)) {
      setSelectedCoinId(dashboardState.data.assets[0]?.coinId ?? "bitcoin");
    }
  }, [dashboardState.data, selectedCoinId]);

  const assets = dashboardState.data?.assets ?? [];
  const chartSeries = dashboardState.data?.chartSeries ?? [];
  const isRefreshDisabled = dashboardState.isLoading;
  const refreshButtonLabel = isManualRefreshPending ? tx("Refreshing market snapshot") : tx("Refresh market snapshot");

  return (
    <section className="market-module market-page-shell" aria-labelledby="market-module-title">
      <div className="market-header">
        <div className="market-header-copy">
          <h1 id="market-module-title">
            <span>{tx("A live read on crypto")}</span>
            <span>{tx("market structure")}</span>
          </h1>
          <p>{tx("Track relative performance, spot price moves, and short-term context across major assets in one place.")}</p>
        </div>

        <div aria-hidden="true" className="market-header-divider" />

        <div className="market-toolbar">
          <div className="market-switch" aria-label={tx("Select quote currency")} role="group">
            <button
              aria-pressed={fiatCurrency === "gbp"}
              className={fiatCurrency === "gbp" ? "is-active" : ""}
              onClick={() => setFiatCurrency("gbp")}
              type="button"
            >
              <span>GBP</span>
            </button>
            <button
              aria-pressed={fiatCurrency === "usd"}
              className={fiatCurrency === "usd" ? "is-active" : ""}
              onClick={() => setFiatCurrency("usd")}
              type="button"
            >
              <span>USD</span>
            </button>
          </div>

          <div className="market-sync" role="status">
            <p>{dashboardState.isLoading && !dashboardState.data ? tx("Loading market...") : formatSyncLabel(dashboardState.data?.lastSuccessfulSyncAt ?? null)}</p>
          </div>
        </div>
      </div>

      {dashboardState.error ? <p className={dashboardState.isStale ? "market-status-banner is-warning" : "market-status-banner is-error"}>{dashboardState.error}</p> : null}

      <article className="market-panel market-chart-panel">
        <div className="market-panel-head">
          <div>
            <h2>{tx("24-hour relative performance")}</h2>
          </div>
        </div>
        <ChartPanel assets={assets} chartSeries={chartSeries} />
      </article>

      <article className="market-panel market-trend-panel">
        <div className="market-panel-head">
          <div>
            <h2>{tx("The short read behind the move")}</h2>
          </div>
        </div>
        <TrendPanel assets={assets} fiatCurrency={fiatCurrency} onSelectCoin={setSelectedCoinId} selectedCoinId={selectedCoinId} />
      </article>

      <article className="market-panel market-table-panel">
        <div className="market-panel-head">
          <div>
            <h2>{tx("Side-by-side market snapshot")}</h2>
          </div>
          {/* Reuse the shared tooltip bubble so this new action reads like part of the same UI system as the chat controls. */}
          <span className="chatbot-tooltip-anchor tone-light market-snapshot-refresh-tooltip">
            <button
              aria-busy={isManualRefreshPending}
              aria-label={refreshButtonLabel}
              className={isManualRefreshPending ? "market-snapshot-refresh is-spinning" : "market-snapshot-refresh"}
              disabled={isRefreshDisabled}
              onClick={() => {
                void loadDashboardData(true, true, refreshGenerationRef.current);
              }}
              title={tx("Check live prices now")}
              type="button"
            >
              <RefreshGlyph isSpinning={isManualRefreshPending} />
            </button>
            <span aria-hidden="true" className="chatbot-tooltip-bubble" role="tooltip">
              {tx("Refresh prices")}
            </span>
          </span>
        </div>
        <ComparisonTable assets={assets} fiatCurrency={fiatCurrency} />
      </article>
    </section>
  );
}
