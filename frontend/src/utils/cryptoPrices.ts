import { SUPPORTED_COINS } from "../constants/crypto";
import type {
  CryptoChartPoint,
  CryptoChartSeries,
  CryptoCoinId,
  CryptoDashboardData,
  CryptoMarketAsset,
  CryptoTone,
  FiatCurrency
} from "../types/crypto";
import { buildApiUrl } from "./api";

type CoinDescriptor = {
  symbol: string;
  name: string;
  tone: CryptoTone;
  officialWebsite: string;
};

type DashboardApiResponse = Partial<CryptoDashboardData> & Record<string, unknown>;

// Keep fallback display metadata client-side so partially missing backend fields still render a complete dashboard.
const COIN_METADATA: Record<CryptoCoinId, CoinDescriptor> = {
  bitcoin: {
    symbol: "BTC",
    name: "Bitcoin",
    tone: "bitcoin",
    officialWebsite: "https://bitcoin.org"
  },
  ethereum: {
    symbol: "ETH",
    name: "Ethereum",
    tone: "ethereum",
    officialWebsite: "https://ethereum.org"
  },
  solana: {
    symbol: "SOL",
    name: "Solana",
    tone: "solana",
    officialWebsite: "https://solana.com"
  },
  ripple: {
    symbol: "XRP",
    name: "XRP",
    tone: "ripple",
    officialWebsite: "https://xrpl.org"
  }
};

function normalizeNumber(value: unknown): number | null {
  // Only accept finite numbers so NaN/Infinity never leak into chart math or formatted copy.
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeIsoTimestamp(value: unknown): string | null {
  // Preserve valid timestamp strings as-is and let presentation formatting happen at the component layer.
  return typeof value === "string" && value.length > 0 ? value : null;
}

function isSupportedCoinId(value: unknown): value is CryptoCoinId {
  // Runtime guard keeps unknown backend ids from entering strongly typed UI branches.
  return typeof value === "string" && SUPPORTED_COINS.includes(value as CryptoCoinId);
}

async function fetchJson<T>(url: URL): Promise<T> {
  // Shared fetch wrapper keeps credentials/include behavior aligned with the rest of the SPA API utilities.
  const response = await fetch(url.toString(), {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Unable to load crypto market data right now.");
  }

  return (await response.json()) as T;
}

type FetchCryptoDashboardOptions = {
  // Manual table refresh uses this to tell the backend to bypass its short-lived in-memory cache.
  forceRefresh?: boolean;
};

function toAsset(entry: Record<string, unknown> | undefined, coinId: CryptoCoinId): CryptoMarketAsset {
  // Normalize upstream/backend field names into the exact shape consumed by the comparison table.
  const descriptor = COIN_METADATA[coinId];

  return {
    coinId,
    symbol: typeof entry?.symbol === "string" ? entry.symbol : descriptor.symbol,
    name: typeof entry?.name === "string" ? entry.name : descriptor.name,
    tone: typeof entry?.tone === "string" ? (entry.tone as CryptoTone) : descriptor.tone,
    officialWebsite: typeof entry?.officialWebsite === "string" ? entry.officialWebsite : descriptor.officialWebsite,
    currentPrice: normalizeNumber(entry?.current_price),
    change24h: normalizeNumber(entry?.price_change_percentage_24h),
    change7d: normalizeNumber(entry?.price_change_percentage_7d_in_currency),
    marketCap: normalizeNumber(entry?.market_cap),
    totalVolume: normalizeNumber(entry?.total_volume),
    high24h: normalizeNumber(entry?.high_24h),
    low24h: normalizeNumber(entry?.low_24h),
    lastUpdatedAt: normalizeIsoTimestamp(entry?.last_updated)
  };
}

function toChartSeries(entry: Record<string, unknown> | undefined, coinId: CryptoCoinId): CryptoChartSeries {
  const descriptor = COIN_METADATA[coinId];
  // Drop malformed points individually so one bad datapoint does not discard the rest of a usable series.
  const points = Array.isArray(entry?.points)
    ? entry.points.flatMap((point): CryptoChartPoint[] => {
      if (!point || typeof point !== "object") {
        return [];
      }

      const timestamp = normalizeIsoTimestamp((point as Record<string, unknown>).timestamp);
      const price = normalizeNumber((point as Record<string, unknown>).price);
      const relativeChange = normalizeNumber((point as Record<string, unknown>).relativeChange);

      if (timestamp === null || price === null || relativeChange === null) {
        return [];
      }

      return [
        {
          timestamp,
          price,
          relativeChange
        }
      ];
    })
    : [];

  return {
    coinId,
    symbol: typeof entry?.symbol === "string" ? entry.symbol : descriptor.symbol,
    name: typeof entry?.name === "string" ? entry.name : descriptor.name,
    tone: typeof entry?.tone === "string" ? (entry.tone as CryptoTone) : descriptor.tone,
    points
  };
}

function normalizeAssetEntry(entry: unknown): CryptoMarketAsset | null {
  // Accept only objects with supported ids so unknown payload fragments fail closed.
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  if (!isSupportedCoinId(record.coinId)) {
    return null;
  }

  return {
    // Support both camelCase and snake_case source fields because tests and backend may provide either form.
    ...toAsset(
      {
        ...record,
        current_price: record.currentPrice,
        price_change_percentage_24h: record.change24h,
        price_change_percentage_7d_in_currency: record.change7d,
        market_cap: record.marketCap,
        total_volume: record.totalVolume,
        high_24h: record.high24h,
        low_24h: record.low24h,
        last_updated: record.lastUpdatedAt
      },
      record.coinId
    )
  };
}

function normalizeChartSeriesEntry(entry: unknown): CryptoChartSeries | null {
  // Chart series use the same id gate as assets so the legend/table/order all stay in lockstep.
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as Record<string, unknown>;
  if (!isSupportedCoinId(record.coinId)) {
    return null;
  }

  return toChartSeries(record, record.coinId);
}

function normalizeDashboardData(payload: DashboardApiResponse): CryptoDashboardData {
  // Re-index by coin id first so output ordering can always follow SUPPORTED_COINS rather than response order.
  const assetEntriesById = new Map<CryptoCoinId, CryptoMarketAsset>();
  const chartSeriesEntriesById = new Map<CryptoCoinId, CryptoChartSeries>();

  if (Array.isArray(payload.assets)) {
    payload.assets.forEach((entry) => {
      const normalized = normalizeAssetEntry(entry);
      if (normalized) {
        assetEntriesById.set(normalized.coinId, normalized);
      }
    });
  }

  if (Array.isArray(payload.chartSeries)) {
    payload.chartSeries.forEach((entry) => {
      const normalized = normalizeChartSeriesEntry(entry);
      if (normalized) {
        chartSeriesEntriesById.set(normalized.coinId, normalized);
      }
    });
  }

  return {
    // Fill missing entries with empty shells so the page can still render every row and legend item predictably.
    assets: SUPPORTED_COINS.map((coinId) => assetEntriesById.get(coinId) ?? toAsset(undefined, coinId)),
    chartSeries: SUPPORTED_COINS.map((coinId) => chartSeriesEntriesById.get(coinId) ?? toChartSeries(undefined, coinId)),
    lastSuccessfulSyncAt: normalizeIsoTimestamp(payload.lastSuccessfulSyncAt),
    isStale: Boolean(payload.isStale),
    staleReason: typeof payload.staleReason === "string" ? payload.staleReason : null
  };
}

export async function fetchCryptoDashboardData(
  fiatCurrency: FiatCurrency,
  options: FetchCryptoDashboardOptions = {}
): Promise<CryptoDashboardData> {
  // Build the endpoint from the shared API base so dev/prod host overrides keep working automatically.
  const url = buildApiUrl("/api/market/crypto-dashboard");
  url.searchParams.set("currency", fiatCurrency);
  if (options.forceRefresh) {
    // Keep the override explicit in the query string so backend view/service tests can assert the bypass path directly.
    url.searchParams.set("force", "1");
  }

  const payload = await fetchJson<DashboardApiResponse>(url);
  return normalizeDashboardData(payload);
}
