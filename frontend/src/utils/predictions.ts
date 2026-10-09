import type { CreatePredictionPayload, Prediction, PredictionsResponse } from "../types/predictions";
import type { PredictionAsset } from "../types/predictions";
import { getStoredLocale } from "../i18n/config";
import { API_BASE_URL } from "./api";
import { fetchWithCsrf } from "./api";

export interface LivePricePoint {
  timestamp: string; // ISO 8601 UTC string
  price: number;
}

export interface OHLCPoint {
  ts: number;   // Unix ms integer
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface LivePriceResult {
  asset: string;
  /** Parsed float — backend returns a Decimal string */
  price: number;
  change_24h: number;
  /** 7-day hourly history (~168 pts, reconstructed timestamps). Used for 24H/7D ranges. */
  history: LivePricePoint[];
  /** 24h high-res history (~288 pts at 5-min intervals, real UNIX timestamps). Used for 1H/4H. */
  history_hires: LivePricePoint[];
  /** 30-min OHLC candles for the last 24h (real high/low/open/close, visible wicks). */
  ohlc_1d: OHLCPoint[];
  /** 4-hour OHLC candles for the last 7 days. */
  ohlc_7d: OHLCPoint[];
  timestamp: string;
}

export async function fetchLivePrice(asset: PredictionAsset): Promise<LivePriceResult> {
  const res = await fetch(`${API_BASE_URL}/api/predictions/live-price/?asset=${asset}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", "Accept-Language": getStoredLocale() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(data.detail ?? `Live price unavailable (${res.status}).`);
  }
  const data = await res.json() as {
    asset: string;
    price: string;
    change_24h: number;
    history: LivePricePoint[];
    history_hires: LivePricePoint[];
    ohlc_1d: OHLCPoint[];
    ohlc_7d: OHLCPoint[];
    timestamp: string;
  };
  return {
    asset: data.asset,
    price: parseFloat(data.price),
    change_24h: data.change_24h,
    history: data.history ?? [],
    history_hires: data.history_hires ?? [],
    ohlc_1d: data.ohlc_1d ?? [],
    ohlc_7d: data.ohlc_7d ?? [],
    timestamp: data.timestamp,
  };
}

// ─── Binance klines-based chart data ─────────────────────────────────────────

export interface ChartCandle {
  time: number;   // Unix ms (open time of the bucket)
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface ChartDataResult {
  asset: string;
  range: string;
  interval: string;
  candles: ChartCandle[];
  last_price: number | null;
  timestamp: string;
}

export type ChartRangeKey = "1H" | "4H" | "24H" | "7D";

export async function fetchChartData(asset: PredictionAsset, range: ChartRangeKey): Promise<ChartDataResult> {
  const res = await fetch(`${API_BASE_URL}/api/predictions/chart/?asset=${asset}&range=${range}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", "Accept-Language": getStoredLocale() },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({})) as { detail?: string };
    throw new Error(data.detail ?? `Chart data unavailable (${res.status}).`);
  }
  return res.json() as Promise<ChartDataResult>;
}

export interface SimpleLivePriceResult {
  asset: string;
  price: number;
  timestamp: string;
}

export async function fetchSimpleLivePrice(asset: PredictionAsset): Promise<SimpleLivePriceResult> {
  const res = await fetch(`${API_BASE_URL}/api/predictions/live-price/?asset=${asset}`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", "Accept-Language": getStoredLocale() },
  });
  if (!res.ok) throw new Error(`Live price unavailable (${res.status}).`);
  const data = await res.json() as { asset: string; price: string; timestamp: string };
  return { asset: data.asset, price: parseFloat(data.price), timestamp: data.timestamp };
}

const BASE = `${API_BASE_URL}/api/predictions`;

export async function fetchPredictions(): Promise<PredictionsResponse> {
  const res = await fetch(`${BASE}/`, {
    method: "GET",
    credentials: "include",
    headers: { Accept: "application/json", "Accept-Language": getStoredLocale() },
  });
  if (!res.ok) {
    throw new Error(`Failed to load predictions (${res.status}).`);
  }
  return res.json() as Promise<PredictionsResponse>;
}

export async function createPrediction(payload: CreatePredictionPayload): Promise<Prediction> {
  const res = await fetchWithCsrf(`/api/predictions/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (res.status === 409) {
    const data = await res.json() as { detail?: string };
    throw new Error(data.detail ?? "You already have a pending prediction for this asset.");
  }
  if (res.status === 503) {
    const data = await res.json() as { detail?: string };
    throw new Error(data.detail ?? "Live market price is temporarily unavailable. Please try again later.");
  }
  if (!res.ok) {
    let msg = `Failed to create prediction (${res.status}).`;
    try {
      const data = await res.json() as Record<string, unknown>;
      const first = Object.values(data)[0];
      if (typeof first === "string") msg = first;
      else if (Array.isArray(first) && typeof first[0] === "string") msg = first[0];
    } catch { /* ignore parse errors */ }
    throw new Error(msg);
  }
  return res.json() as Promise<Prediction>;
}

/** Format a number as USD with 2 decimal places */
export function fmtUsd(val: number | string): string {
  const num = typeof val === "string" ? parseFloat(val) : val;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}
