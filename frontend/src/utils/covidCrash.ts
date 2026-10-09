import type {
  CrashAttempt,
  CrashAdvanceResponse,
  CrashBrokerSelectResponse,
  CrashMoveResponse,
  CrashScenario,
  CrashTradeResponse,
  GFCBuyResult,
  GFCSellResult,
} from "../types/covidCrash";
import { getStoredLocale } from "../i18n/config";

export interface CrashScenariosResponse {
  scenarios: CrashScenario[];
  cumulative_balance_pence: number;
}
import { API_BASE_URL, fetchWithCsrf } from "./api";

// Default to same-origin API calls so local dev and reverse-proxy deployments share one URL shape.
const BASE = `${API_BASE_URL}/api/covid-crash`;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: {
      "Accept-Language": getStoredLocale(),
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// CSRF wrapper for state-mutating requests.
async function apiMutate<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetchWithCsrf(`/api/covid-crash${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function fetchCrashScenarios(): Promise<CrashScenariosResponse> {
  return apiFetch<CrashScenariosResponse>("/scenarios/");
}

export async function fetchCrashAttempt(attemptId: number): Promise<CrashAttempt> {
  return apiFetch<CrashAttempt>(`/attempts/${attemptId}/`);
}

// ── Mutate ────────────────────────────────────────────────────────────────────

export async function startCrashAttempt(scenarioId: number): Promise<CrashAttempt> {
  return apiMutate<CrashAttempt>("/attempts/start/", {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId }),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Select a broker for Scenario 4. Must be called before any trading in Round 0.
 * broker_choice: 'trading_forge' | 'highford_latham'
 */
export async function selectBrokerCrash(
  attemptId: number,
  brokerChoice: "trading_forge" | "highford_latham",
): Promise<CrashBrokerSelectResponse> {
  return apiMutate<CrashBrokerSelectResponse>(`/attempts/${attemptId}/select-broker/`, {
    method: "POST",
    body: JSON.stringify({ broker_choice: brokerChoice }),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Buy asset at the current round price.
 * @param useMargin  If true, uses 2x leverage (Trading Forge / Scenario 4 only).
 */
export async function buyCrash(
  attemptId: number,
  amountPence: number,
  useMargin = false,
): Promise<CrashTradeResponse> {
  return apiMutate<CrashTradeResponse>(`/attempts/${attemptId}/buy/`, {
    method: "POST",
    body: JSON.stringify({ amount_pence: amountPence, use_margin: useMargin }),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Sell asset at the current round price.
 * For S4: btcQuantitySatoshis is actually integer share count.
 * @param source  'auto' (default) — FTX for S3, self-custody for S1/S2.
 *                'ftx' — sell from FTX (S3 only, not allowed when halted).
 *                'self_custody' — sell from hardware wallet (S3 only).
 *                S4 ignores source (single position bucket).
 */
export async function sellCrash(
  attemptId: number,
  btcQuantitySatoshis: number,
  source: "auto" | "ftx" | "self_custody" = "auto",
): Promise<CrashTradeResponse> {
  return apiMutate<CrashTradeResponse>(`/attempts/${attemptId}/sell/`, {
    method: "POST",
    body: JSON.stringify({ btc_quantity_satoshis: btcQuantitySatoshis, source }),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Move BTC between FTX and self-custody. Costs £15 per transfer.
 * Only valid for Scenario 3 before withdrawals are halted.
 */
export async function moveCrash(
  attemptId: number,
  btcQuantitySatoshis: number,
  direction: "to_self_custody" | "to_ftx",
): Promise<CrashMoveResponse> {
  return apiMutate<CrashMoveResponse>(`/attempts/${attemptId}/move/`, {
    method: "POST",
    body: JSON.stringify({ btc_quantity_satoshis: btcQuantitySatoshis, direction }),
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Advance to the next round (or complete the scenario if on the final round).
 * Returns the updated attempt plus event flags for S3 FTX and S4 broker events.
 */
export async function advanceCrash(attemptId: number): Promise<CrashAdvanceResponse> {
  return apiMutate<CrashAdvanceResponse>(`/attempts/${attemptId}/advance/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
}

/** Buy an asset in Scenario 5 (GFC multi-asset). */
export async function buyMultiCrash(
  attemptId: number,
  asset: string,
  amountPence: number,
  intradayOffsetSeconds?: number,
): Promise<{ action_executed: GFCBuyResult; attempt: CrashAttempt }> {
  const body: Record<string, unknown> = { asset, amount_pence: amountPence };
  if (intradayOffsetSeconds !== undefined) {
    body.intraday_offset_seconds = intradayOffsetSeconds;
  }
  const resp = await fetch(`/api/covid-crash/attempts/${attemptId}/buy-multi/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Buy multi failed');
  }
  return resp.json() as Promise<{ action_executed: GFCBuyResult; attempt: CrashAttempt }>;
}

/** Sell an asset in Scenario 5 (GFC multi-asset). */
export async function sellMultiCrash(
  attemptId: number,
  asset: string,
  unitsToSell: number,
  intradayOffsetSeconds?: number,
): Promise<{ action_executed: GFCSellResult; attempt: CrashAttempt }> {
  const body: Record<string, unknown> = { asset, units_to_sell: unitsToSell };
  if (intradayOffsetSeconds !== undefined) {
    body.intraday_offset_seconds = intradayOffsetSeconds;
  }
  const resp = await fetch(`/api/covid-crash/attempts/${attemptId}/sell-multi/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? 'Sell multi failed');
  }
  return resp.json() as Promise<{ action_executed: GFCSellResult; attempt: CrashAttempt }>;
}
