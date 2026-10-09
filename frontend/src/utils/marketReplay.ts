import type {
  ReplayAttemptPayload,
  ReplayScenario,
  ReplayTradeResponse,
} from "../types/marketReplay";
import { getStoredLocale } from "../i18n/config";
import { API_BASE_URL, fetchWithCsrf } from "./api";

const BASE = `${API_BASE_URL}/api/market-replay`;

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

async function apiMutate<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetchWithCsrf(`/api/market-replay${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// ── Read ──────────────────────────────────────────────────────────────────────

export async function fetchReplayScenarios(): Promise<ReplayScenario[]> {
  return apiFetch<ReplayScenario[]>("/scenarios/");
}

export async function fetchReplayScenario(id: number): Promise<ReplayScenario> {
  return apiFetch<ReplayScenario>(`/scenarios/${id}/`);
}

export async function fetchReplayAttemptState(
  attemptId: number,
  since?: string,
  allCandles?: boolean,
): Promise<ReplayAttemptPayload> {
  const params = new URLSearchParams();
  if (since) params.set("since", since);
  if (allCandles) params.set("all_candles", "true");
  const qs = params.toString() ? `?${params.toString()}` : "";
  return apiFetch<ReplayAttemptPayload>(`/attempts/${attemptId}/state/${qs}`);
}

// ── Mutate ────────────────────────────────────────────────────────────────────

export async function startReplayAttempt(
  scenarioId: number,
): Promise<ReplayAttemptPayload> {
  return apiMutate<ReplayAttemptPayload>("/attempts/start/", {
    method: "POST",
    body: JSON.stringify({ scenario_id: scenarioId }),
  });
}

export async function buyReplay(
  attemptId: number,
  amountPence: number,
): Promise<ReplayTradeResponse> {
  return apiMutate<ReplayTradeResponse>(`/attempts/${attemptId}/buy/`, {
    method: "POST",
    body: JSON.stringify({ amount_pence: amountPence }),
  });
}

export async function sellReplay(
  attemptId: number,
  btcQuantitySatoshis: number,
): Promise<ReplayTradeResponse> {
  return apiMutate<ReplayTradeResponse>(`/attempts/${attemptId}/sell/`, {
    method: "POST",
    body: JSON.stringify({ btc_quantity_satoshis: btcQuantitySatoshis }),
  });
}
