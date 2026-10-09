// Keep supported assets ordered so tables, legends, and backend payload normalization stay visually consistent.
export const SUPPORTED_COINS = ["bitcoin", "ethereum", "solana", "ripple"] as const;

// Frontend and backend intentionally share the same narrow currency set for simpler cache keys and copy.
export const SUPPORTED_FIAT_CURRENCIES = ["gbp", "usd"] as const;

// Poll every five minutes: frequent enough for a dashboard, infrequent enough to avoid noisy background churn.
export const CRYPTO_REFRESH_INTERVAL_MS = 300_000;
