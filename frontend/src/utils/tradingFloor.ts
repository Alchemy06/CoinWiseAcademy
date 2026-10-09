import type {
  LeaderboardEntry,
  TradingAttempt,
  TradingScenario,
  UserTradingProfile,
} from "../types/trading";
import { getStoredLocale } from "../i18n/config";
import { API_BASE_URL, fetchWithCsrf } from "./api";

// All Trading Floor requests hit the Django backend directly (port 8000), matching the pattern
// used by learn.ts, quiz.ts and cryptoPrices.ts. Using a relative path would route through
// the Vite dev server which returns index.html instead of JSON.
const BASE = `${API_BASE_URL}/api/trading-floor`;

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", "Accept-Language": getStoredLocale(), ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// CSRF-aware wrapper for state-mutating requests (POST / PATCH).
async function apiMutate<T>(path: string, init: RequestInit): Promise<T> {
  const res = await fetchWithCsrf(`/api/trading-floor${path}`, init);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}${body ? `: ${body}` : ""}`);
  }
  return res.json() as Promise<T>;
}

// ── Public ────────────────────────────────────────────────────────────────────

export async function fetchScenarios(): Promise<TradingScenario[]> {
  return apiFetch<TradingScenario[]>("/scenarios/");
}

export async function fetchLeaderboard(): Promise<LeaderboardEntry[]> {
  return apiFetch<LeaderboardEntry[]>("/leaderboard/");
}

// ── Authenticated ─────────────────────────────────────────────────────────────

export async function fetchTradingProfile(): Promise<UserTradingProfile> {
  return apiFetch<UserTradingProfile>("/profile/");
}

export async function startAttempt(scenarioSlug: string): Promise<TradingAttempt> {
  return apiMutate<TradingAttempt>("/attempts/", {
    method: "POST",
    body: JSON.stringify({ scenario_slug: scenarioSlug }),
    headers: { "Content-Type": "application/json" },
  });
}

export async function makeChoice(
  attemptId: number,
  choiceId: number,
  amount?: number,
): Promise<TradingAttempt> {
  const body: Record<string, unknown> = { choice_id: choiceId };
  if (amount !== undefined && amount > 0) body.amount = amount;
  return apiMutate<TradingAttempt>(`/attempts/${attemptId}/`, {
    method: "PATCH",
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
  });
}
