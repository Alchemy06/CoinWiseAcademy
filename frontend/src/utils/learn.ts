import type { LearnCatalogResponse, LearnCompletionResponse, LearnLevel, LearnProgressResponse, LearnTrack, LearnUnit } from "../types/learn";
import { getStoredLocale } from "../i18n/config";
import { API_BASE_URL, fetchWithCsrf } from "./api";

type JsonRecord = Record<string, unknown>;

function normalizeText(value: unknown, fallback = ""): string {
  // Text fields fail closed into explicit defaults so malformed catalog rows do not leak undefined into rendering.
  return typeof value === "string" ? value : fallback;
}

function normalizeNullableNumber(value: unknown): number | null {
  // Nullable durations distinguish "no estimate published" from a genuine zero-length read.
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizeLevel(value: unknown): LearnLevel {
  // Unknown stages fall back to beginner so unsupported backend values land in the safest shared styling bucket.
  return value === "intermediate" || value === "advanced" ? value : "beginner";
}

function getErrorMessage(data: JsonRecord, fallback: string): string {
  return typeof data.detail === "string" ? data.detail : fallback;
}

async function parseJson(response: Response): Promise<JsonRecord> {
  try {
    return (await response.json()) as JsonRecord;
  } catch {
    // Some API failures return empty bodies, but callers still need a stable object for error extraction.
    return {};
  }
}

async function fetchJson(path: string): Promise<JsonRecord> {
  // Learn reads are session-authenticated GETs, so they can skip the CSRF helper used by mutations.
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "GET",
    credentials: "include",
    headers: {
      Accept: "application/json",
      "Accept-Language": getStoredLocale()
    }
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to load learn data right now."));
  }

  return data;
}

function normalizeUnit(entry: unknown): LearnUnit | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as JsonRecord;
  // Learning and quiz payloads are nested inside each catalog unit, so normalize them once at the boundary.
  const learning = record.learning && typeof record.learning === "object" ? record.learning as JsonRecord : {};
  const quiz = record.quiz && typeof record.quiz === "object" ? record.quiz as JsonRecord : {};
  // Source metadata powers renderer-only behavior such as suppressing self-referential links without widening the core lesson schema.
  const source = record.source && typeof record.source === "object" ? record.source as JsonRecord : {};

  return {
    externalId: normalizeText(record.external_id),
    title: normalizeText(record.title),
    level: normalizeLevel(record.level),
    orderIndex: typeof record.order_index === "number" ? record.order_index : 0,
    excerpt: normalizeText(learning.excerpt),
    estimatedMinutes: normalizeNullableNumber(learning.estimated_minutes),
    bodyMarkdown: normalizeText(learning.body_markdown),
    sourcePath: normalizeText(source.path) || undefined,
    sourceRepo: normalizeText(source.repo) || undefined,
    quizExternalId: normalizeText(quiz.external_id) || undefined
  };
}

function normalizeTrack(entry: unknown): LearnTrack | null {
  if (!entry || typeof entry !== "object") {
    return null;
  }

  const record = entry as JsonRecord;
  const units = Array.isArray(record.units)
    ? record.units.flatMap((unitEntry) => {
      const normalized = normalizeUnit(unitEntry);
      return normalized ? [normalized] : [];
    })
    : [];

  return {
    externalId: normalizeText(record.external_id),
    title: normalizeText(record.title),
    level: normalizeLevel(record.level),
    orderIndex: typeof record.order_index === "number" ? record.order_index : 0,
    units
  };
}

export async function fetchLearnCatalog(): Promise<LearnCatalogResponse> {
  const data = await fetchJson("/api/v1/catalog/");

  return {
    // Drop malformed track rows individually so one bad unit does not blank the whole learn hub.
    tracks: Array.isArray(data.tracks)
      ? data.tracks.flatMap((entry) => {
        const normalized = normalizeTrack(entry);
        return normalized ? [normalized] : [];
      })
      : []
  };
}

export async function fetchLearnProgress(): Promise<LearnProgressResponse> {
  const data = await fetchJson("/api/learn-progress/");

  return {
    // Keep only non-empty strings so stale or malformed completion payloads degrade predictably.
    completedUnitExternalIds: Array.isArray(data.completedUnitExternalIds)
      ? data.completedUnitExternalIds.flatMap((entry) => typeof entry === "string" && entry ? [entry] : [])
      : []
  };
}

export async function markLearnUnitDone(unitExternalId: string): Promise<LearnCompletionResponse> {
  // Completion stays a POST so the server can persist the authenticated user/unit relationship authoritatively.
  const response = await fetchWithCsrf(`/api/learn-progress/${encodeURIComponent(unitExternalId)}/complete/`, {
    method: "POST",
    body: JSON.stringify({})
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to mark this lesson as done right now."));
  }

  // Validate the minimal contract before state updates so the observer flow cannot persist malformed responses locally.
  if (typeof data.unitExternalId !== "string" || typeof data.completedAt !== "string") {
    throw new Error("Unexpected learn completion response format.");
  }

  return {
    unitExternalId: data.unitExternalId,
    completedAt: data.completedAt
  };
}
