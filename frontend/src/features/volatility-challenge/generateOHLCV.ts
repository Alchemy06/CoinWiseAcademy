/**
 * generateOHLCV.ts
 *
 * Two ways to build OHLCV data for the Volatility Challenge chart:
 *
 * 1. buildOHLCVFromHistory()  — primary path.
 *    Converts real {timestamp, price} API history points into OHLCV candles.
 *    Synthetic candle detail (wicks, sub-bucket interpolation) uses a seeded
 *    PRNG keyed to the actual price data, so the same API response always
 *    produces the same chart shape.
 *
 * 2. generateOHLCV()          — deterministic fallback.
 *    Used when API history is too sparse.  The PRNG seed is derived from
 *    asset + range + the current full-window epoch, so the shape is stable
 *    within the same chart window (e.g. 1 h for 1H, 7 d for 7D) and only
 *    re-randomises after a new window starts.
 *
 * In both cases the last candle is rescaled so its close equals the live
 * API price exactly, preventing a spike on the first live-candle update.
 */

// ─── public types ─────────────────────────────────────────────────────────────

export interface OHLCVCandle {
  /** Unix timestamp in SECONDS (lightweight-charts requirement) */
  time:  number;
  open:  number;
  high:  number;
  low:   number;
  close: number;
}

export interface VolumeBar {
  time:  number;
  value: number;
  color: string;
}

export interface OHLCVData {
  candles:  OHLCVCandle[];
  volume:   VolumeBar[];
  /** Opening price of the first candle — used for % change calculation */
  firstOpen: number;
}

export type RangeKey = "1H" | "4H" | "24H" | "7D";

export const RANGE_CONFIG: Record<
  RangeKey,
  { bucketMs: number; count: number; label: string }
> = {
  "1H":  { bucketMs: 60_000,     count: 60, label: "1 min"  },
  "4H":  { bucketMs: 300_000,    count: 48, label: "5 min"  },
  "24H": { bucketMs: 1_800_000,  count: 48, label: "30 min" },
  "7D":  { bucketMs: 14_400_000, count: 42, label: "4 hr"   },
};

// ─── internal helpers ─────────────────────────────────────────────────────────

/** Fast linear-congruential PRNG.  Returns a function that yields [0, 1). */
export function makePRNG(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return (): number => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

/**
 * Stable seed that changes only once per full chart window.
 *   - 1H  range → seed changes once per 60 min
 *   - 4H  range → seed changes once per 4 h
 *   - 24H range → seed changes once per 24 h
 *   - 7D  range → seed changes once per 7 d
 *
 * Within the same window every page refresh gives the same random walk.
 */
function windowSeed(asset: string, range: RangeKey): number {
  const { bucketMs, count } = RANGE_CONFIG[range];
  const windowMs = bucketMs * count;
  const epoch    = Math.floor(Date.now() / windowMs);
  return fnv1a(`${asset}|${range}|${epoch}`);
}

/**
 * Derive a seed from the actual API price points.
 * Rounds timestamps to the nearest minute and prices to the nearest dollar
 * so minor float jitter between requests does not change the seed.
 */
function historySeed(pts: { ts: number; price: number }[]): number {
  let str = "";
  for (const { ts, price } of pts) {
    str += `${Math.round(ts / 60_000)}:${Math.round(price)}|`;
  }
  return fnv1a(str);
}

/** FNV-1a 32-bit hash. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h = (h ^ str.charCodeAt(i)) >>> 0;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * Linear interpolation across real data points.
 * Returns the interpolated price at timestamp `ts`.
 */
function interpolate(
  pts: { ts: number; price: number }[],
  ts:  number,
): number {
  if (pts.length === 0) return 0;
  if (ts <= pts[0].ts)                  return pts[0].price;
  if (ts >= pts[pts.length - 1].ts)    return pts[pts.length - 1].price;

  // Binary-ish: find surrounding pair
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].ts >= ts) {
      const prev = pts[i - 1];
      const next = pts[i];
      const t    = (ts - prev.ts) / (next.ts - prev.ts);
      return prev.price + (next.price - prev.price) * t;
    }
  }
  return pts[pts.length - 1].price;
}

/** Apply anchor rescaling in-place so the last candle closes at anchorPrice. */
function applyAnchor(
  candles:  OHLCVCandle[],
  firstOpen: number,
  anchorPrice: number,
): { candles: OHLCVCandle[]; firstOpen: number } {
  const lastClose = candles[candles.length - 1]?.close ?? anchorPrice;
  if (lastClose <= 0) return { candles, firstOpen };

  const scale = anchorPrice / lastClose;
  for (const c of candles) {
    c.open  *= scale;
    c.high  *= scale;
    c.low   *= scale;
    c.close *= scale;
  }
  return { candles, firstOpen: firstOpen * scale };
}

// ─── primary path: real history → OHLCV ─────────────────────────────────────

/**
 * Convert real API history points to OHLCV candles.
 *
 * Returns null when history is too sparse (< 2 valid points, or no point
 * in the second half of the chart window) — the caller should fall back to
 * generateOHLCV().
 *
 * @param rawPoints   Array of { timestamp, price } from fetchLivePrice()
 * @param range       Selected chart timeframe
 * @param anchorPrice Current live price; pins the last candle's close
 */
export function buildOHLCVFromHistory(
  rawPoints: { timestamp: string; price: number }[],
  range: RangeKey,
  anchorPrice?: number,
): OHLCVData | null {
  const { bucketMs, count } = RANGE_CONFIG[range];

  // Parse, validate and sort
  const pts = rawPoints
    .map(p => ({ ts: new Date(p.timestamp).getTime(), price: p.price }))
    .filter(p => Number.isFinite(p.ts) && Number.isFinite(p.price) && p.price > 0)
    .sort((a, b) => a.ts - b.ts);

  if (pts.length < 2) return null;

  const now       = Date.now();
  const midWindow = now - (count * bucketMs) / 2;

  // Require at least one real point in the recent half of the chart
  if (!pts.some(p => p.ts >= midWindow)) return null;

  const rng = makePRNG(historySeed(pts));

  const candles: OHLCVCandle[] = [];
  const volume:  VolumeBar[]   = [];
  let firstOpen = 0;

  for (let i = count - 1; i >= 0; i--) {
    const bStart  = Math.floor((now - i * bucketMs) / bucketMs) * bucketMs;
    const bEnd    = bStart + bucketMs;
    const timeSec = Math.floor(bStart / 1000);

    // Real data points that fall inside this bucket
    const inside = pts.filter(p => p.ts >= bStart && p.ts < bEnd);

    // Interpolated prices at bucket boundaries (using all real points)
    const pOpen  = interpolate(pts, bStart);
    const pClose = interpolate(pts, bEnd);
    const pMid   = interpolate(pts, bStart + bucketMs / 2);

    let open: number, close: number, high: number, low: number;

    if (inside.length >= 2) {
      // Genuine intra-bucket OHLCV from multiple real points
      open  = inside[0].price;
      close = inside[inside.length - 1].price;
      high  = Math.max(...inside.map(p => p.price));
      low   = Math.min(...inside.map(p => p.price));
      // Add small deterministic wicks
      const body = Math.abs(close - open);
      high += rng() * (body * 0.25 + pMid * 0.0002);
      low  -= rng() * (body * 0.25 + pMid * 0.0002);
    } else if (inside.length === 1) {
      // One real point: use as close, open from interpolation
      open  = pOpen;
      close = inside[0].price;
      const body = Math.abs(close - open);
      high  = Math.max(open, close) + rng() * (body * 0.3 + pMid * 0.0003);
      low   = Math.min(open, close) - rng() * (body * 0.3 + pMid * 0.0003);
    } else {
      // No real data: purely interpolated candle
      open  = pOpen;
      close = pClose;
      const body = Math.abs(close - open);
      high  = Math.max(open, close) + rng() * (body * 0.4 + pMid * 0.0003);
      low   = Math.min(open, close) - rng() * (body * 0.4 + pMid * 0.0003);
    }

    // Safety clamps
    high = Math.max(high, Math.max(open, close));
    low  = Math.min(low,  Math.min(open, close));
    if (low <= 0) low = Math.min(open, close) * 0.998;

    if (i === count - 1) firstOpen = open;

    const isGreen = close >= open;
    const moveMag = pMid > 0 ? Math.abs(close - open) / pMid : 0;
    const vol     = (40 + rng() * 80) * (1 + moveMag * 80);

    candles.push({ time: timeSec, open, high, low, close });
    volume.push({
      time:  timeSec,
      value: vol,
      color: isGreen ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)",
    });
  }

  if (anchorPrice !== undefined && anchorPrice > 0) {
    const result = applyAnchor(candles, firstOpen, anchorPrice);
    return { candles: result.candles, volume, firstOpen: result.firstOpen };
  }

  return { candles, volume, firstOpen };
}

// ─── fallback: deterministic seeded random walk ───────────────────────────────

const BASE_PRICES: Record<string, number> = {
  BTC: 78_000,
  ETH: 2_200,
};

/**
 * Generate a plausible OHLCV dataset using a deterministic PRNG.
 *
 * The seed is derived from asset + range + the current time-window epoch,
 * so the same chart shape is returned on every page refresh within the same
 * chart window.  The shape only changes when a full window elapses.
 *
 * @param anchorPrice  When provided, rescales all prices so the final candle
 *   closes at this value — eliminates the "spike on first live update" bug.
 */
export function generateOHLCV(
  asset: string,
  range: RangeKey,
  anchorPrice?: number,
): OHLCVData {
  const { bucketMs, count } = RANGE_CONFIG[range];
  const base = anchorPrice ?? (BASE_PRICES[asset] ?? 50_000);

  // Use a stable, deterministic PRNG instead of Math.random()
  const rng = makePRNG(windowSeed(asset, range));

  const volFrac =
    range === "1H"  ? 0.0008 :
    range === "4H"  ? 0.0018 :
    range === "24H" ? 0.0040 :
    /* 7D */          0.0090;
  const volAbs = base * volFrac;

  const now     = Date.now();
  const candles: OHLCVCandle[] = [];
  const volume:  VolumeBar[]   = [];

  let price     = base * (0.97 + rng() * 0.06);
  let firstOpen = price;

  for (let i = count - 1; i >= 0; i--) {
    const bucketTs = Math.floor((now - i * bucketMs) / bucketMs) * bucketMs;
    const timeSec  = Math.floor(bucketTs / 1000);

    const open      = price;
    const drift     = 0.00008;
    const direction = (rng() - 0.5 + drift) * 2;
    const bodyScale = 0.2 + Math.pow(rng(), 1.5) * 1.8;
    const close     = Math.max(open + direction * volAbs * bodyScale, base * 0.5);

    const bodyHi    = Math.max(open, close);
    const bodyLo    = Math.min(open, close);
    const high      = bodyHi + rng() * volAbs * 0.6;
    const low       = bodyLo - rng() * volAbs * 0.6;

    const moveMag   = Math.abs(close - open) / volAbs;
    const vol       = (40 + rng() * 80) * (1 + moveMag * 1.5);

    if (i === count - 1) firstOpen = open;

    const isGreen = close >= open;
    candles.push({ time: timeSec, open, high, low, close });
    volume.push({
      time:  timeSec,
      value: vol,
      color: isGreen ? "rgba(34,197,94,0.45)" : "rgba(239,68,68,0.45)",
    });

    price = close;
  }

  if (anchorPrice !== undefined && anchorPrice > 0) {
    const result = applyAnchor(candles, firstOpen, anchorPrice);
    return { candles: result.candles, volume, firstOpen: result.firstOpen };
  }

  return { candles, volume, firstOpen };
}
