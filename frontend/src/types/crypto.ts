import type { SUPPORTED_COINS, SUPPORTED_FIAT_CURRENCIES } from "../constants/crypto";

export type CryptoCoinId = (typeof SUPPORTED_COINS)[number];

export type FiatCurrency = (typeof SUPPORTED_FIAT_CURRENCIES)[number];

// Tone drives the shared visual language for legend dots, line colors, and comparison accents.
export type CryptoTone = "bitcoin" | "ethereum" | "solana" | "ripple";

export interface CryptoMarketAsset {
  // Table-oriented market snapshot for one asset at the latest successful refresh.
  coinId: CryptoCoinId;
  symbol: string;
  name: string;
  tone: CryptoTone;
  officialWebsite: string;
  currentPrice: number | null;
  change24h: number | null;
  change7d: number | null;
  marketCap: number | null;
  totalVolume: number | null;
  high24h: number | null;
  low24h: number | null;
  lastUpdatedAt: string | null;
}

export interface CryptoChartPoint {
  // Chart points are already normalized server-side/front-end-side for relative intraday comparisons.
  timestamp: string;
  price: number;
  relativeChange: number;
}

export interface CryptoChartSeries {
  coinId: CryptoCoinId;
  symbol: string;
  name: string;
  tone: CryptoTone;
  points: CryptoChartPoint[];
}

export interface CryptoDashboardData {
  // Complete page payload returned by the market dashboard endpoint.
  assets: CryptoMarketAsset[];
  chartSeries: CryptoChartSeries[];
  lastSuccessfulSyncAt: string | null;
  isStale: boolean;
  staleReason: string | null;
}

export interface CryptoDashboardState {
  // Local view state keeps stale/failure presentation separate from the raw data payload.
  data: CryptoDashboardData | null;
  isLoading: boolean;
  error: string | null;
  isStale: boolean;
}
