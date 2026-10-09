import type { AuthUser } from "../types/auth";
import type { ChatMessage, ChatResponsePayload, ChatSession, ChatSource, ConversationDetail, ConversationSummary } from "../types/chat";
import { getStoredLocale } from "../i18n/config";

function getDefaultApiBaseUrl(): string {
  if (typeof window === "undefined") {
    return "";
  }

  // Default to same-origin API calls so reverse proxies can serve the SPA and Django under one host.
  return "";
}

// Export the resolved base URL so feature-specific data clients can build endpoints without duplicating host logic.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? getDefaultApiBaseUrl();

export function buildApiUrl(path: string): URL {
  // URL() needs an absolute base in tests, while browsers can resolve relative API paths against the current origin.
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base =
    API_BASE_URL ||
    (typeof window !== "undefined" && window.location?.origin ? window.location.origin : "http://127.0.0.1");

  return new URL(normalizedPath, base);
}

interface ChatRequestPayload {
  // session_id remains the client-side thread key used before and after persistence.
  session_id: string;
  // conversation_id lets authenticated requests target an existing persisted record explicitly.
  conversation_id?: string;
  // guest_id is reserved for anonymous flows that need server-side continuity before login.
  guest_id?: string;
  messages: ChatMessage[];
  summary: string;
  user_input: string;
  web_search_enabled: boolean;
}

interface LoginPayload {
  email: string;
  password: string;
  guest_id?: string;
}

interface RegisterPayload extends LoginPayload {
  confirm_password: string;
  display_name: string;
}

function getCookie(name: string): string {
  // Read cookies directly because Django session + CSRF auth depends on browser-managed cookie state.
  const cookieValue = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${name}=`))
    ?.split("=")[1];

  return cookieValue ? decodeURIComponent(cookieValue) : "";
}

function normalizeSources(data: Record<string, unknown>): ChatSource[] | undefined {
  // Defensive normalization keeps rendering resilient if backend/source providers omit malformed entries.
  return Array.isArray(data.sources)
    ? data.sources.flatMap((item): ChatSource[] => {
      if (
        item &&
        typeof item === "object" &&
        typeof (item as Record<string, unknown>).title === "string" &&
        typeof (item as Record<string, unknown>).url === "string"
      ) {
        return [
          {
            title: (item as Record<string, string>).title,
            url: (item as Record<string, string>).url
          }
        ];
      }
      return [];
    })
    : undefined;
}

function normalizeMessage(item: Record<string, unknown>): ChatMessage {
  // Normalize persisted message rows into the exact client shape used by optimistic local messages.
  return {
    id: String(item.id),
    role: item.role === "assistant" ? "assistant" : "user",
    content: typeof item.content === "string" ? item.content : "",
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString()
  };
}

function normalizeConversationSummary(item: Record<string, unknown>): ConversationSummary {
  // Apply safe defaults so partially populated API responses still degrade into a renderable history item.
  return {
    id: typeof item.id === "string" ? item.id : "",
    title: typeof item.title === "string" ? item.title : "New Chat",
    summary: typeof item.summary === "string" ? item.summary : "",
    createdAt: typeof item.createdAt === "string" ? item.createdAt : new Date().toISOString(),
    updatedAt: typeof item.updatedAt === "string" ? item.updatedAt : new Date().toISOString()
  };
}

function normalizeConversationDetail(item: Record<string, unknown>): ConversationDetail {
  // Reuse summary normalization first so list/detail endpoints stay structurally aligned.
  return {
    ...normalizeConversationSummary(item),
    messages: Array.isArray(item.messages)
      ? item.messages.flatMap((message): ChatMessage[] => {
        if (message && typeof message === "object") {
          return [normalizeMessage(message as Record<string, unknown>)];
        }
        return [];
      })
      : []
  };
}

async function parseJson(response: Response): Promise<Record<string, unknown>> {
  // Some endpoints intentionally return 204, so callers need a tolerant parser instead of unconditional json().
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  // credentials: include is mandatory because Django session auth is cookie-based rather than bearer-token-based.
  return fetch(`${API_BASE_URL}${path}`, {
    credentials: "include",
    ...init,
    headers: {
      "Accept-Language": getStoredLocale(),
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers
    }
  });
}

export async function ensureCsrfToken(): Promise<string> {
  // Reuse an existing token when possible to avoid an extra round-trip before every mutation.
  const existing = getCookie("csrftoken");
  if (existing) {
    return existing;
  }

  const response = await request("/api/auth/csrf/");
  if (!response.ok) {
    throw new Error("Failed to initialize CSRF protection.");
  }

  return getCookie("csrftoken");
}

export async function fetchWithCsrf(path: string, init: RequestInit = {}): Promise<Response> {
  // Centralize CSRF header wiring so auth/chat/history mutations all follow the same Django contract.
  const token = await ensureCsrfToken();
  return request(path, {
    ...init,
    headers: {
      ...(token ? { "X-CSRFToken": token } : {}),
      ...init.headers
    }
  });
}

function getErrorMessage(data: Record<string, unknown>, fallback: string): string {
  // Prefer backend detail text so forms can show field-specific failures instead of generic transport errors.
  if (typeof data.detail === "string") {
    return data.detail;
  }

  const firstFieldError = Object.values(data).find((value) => Array.isArray(value) && typeof value[0] === "string");
  if (Array.isArray(firstFieldError) && typeof firstFieldError[0] === "string") {
    return firstFieldError[0];
  }

  return fallback;
}

export async function getCurrentUser(): Promise<{ authenticated: boolean; user: AuthUser | null }> {
  // The auth bootstrap endpoint returns a guest-safe payload instead of 401 so the app shell can branch cleanly.
  const response = await request("/api/auth/me");
  const data = await parseJson(response);

  return {
    authenticated: Boolean(data.authenticated),
    user: data.user && typeof data.user === "object" ? (data.user as AuthUser) : null
  };
}

export async function loginUser(payload: LoginPayload): Promise<AuthUser> {
  // Login participates in guest-data merge, so the payload can carry a browser-stable guest id.
  const response = await fetchWithCsrf("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const data = await parseJson(response);

  if (!response.ok || !data.user || typeof data.user !== "object") {
    throw new Error(getErrorMessage(data, "Unable to log in."));
  }

  return data.user as AuthUser;
}

export async function registerUser(payload: RegisterPayload): Promise<AuthUser> {
  // Registration mirrors login semantics so guest chat/quiz history can be adopted regardless of auth entry point.
  const response = await fetchWithCsrf("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const data = await parseJson(response);

  if (!response.ok || !data.user || typeof data.user !== "object") {
    throw new Error(getErrorMessage(data, "Unable to create your account."));
  }

  return data.user as AuthUser;
}

export async function logoutUser(): Promise<void> {
  // Logout is still a CSRF-protected POST because it mutates the server-side session.
  const response = await fetchWithCsrf("/api/auth/logout", {
    method: "POST"
  });

  if (!response.ok && response.status !== 204) {
    const data = await parseJson(response);
    throw new Error(getErrorMessage(data, "Unable to log out."));
  }
}

export async function sendChatMessage(payload: ChatRequestPayload): Promise<ChatResponsePayload> {
  // Chat requests go through the same session-aware fetch wrapper so authenticated persistence works transparently.
  const response = await fetchWithCsrf("/api/ai/chat", {
    method: "POST",
    body: JSON.stringify(payload)
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "The AI service is temporarily unavailable."));
  }

  if (typeof data.assistant_message !== "string") {
    throw new Error("Unexpected AI response format.");
  }

  return {
    assistant_message: data.assistant_message,
    usage: (data.usage as Record<string, unknown> | undefined) ?? undefined,
    updated_summary: typeof data.updated_summary === "string" ? data.updated_summary : undefined,
    sources: normalizeSources(data),
    conversation:
      data.conversation && typeof data.conversation === "object"
        ? normalizeConversationDetail(data.conversation as Record<string, unknown>)
        : undefined
  };
}

export async function listConversations(): Promise<ConversationSummary[]> {
  // History list stays read-only and lightweight; messages are fetched lazily only when a thread is opened.
  const response = await request("/api/me/conversations");
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to load conversation history."));
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.flatMap((item): ConversationSummary[] => {
    if (item && typeof item === "object") {
      return [normalizeConversationSummary(item as Record<string, unknown>)];
    }
    return [];
  });
}

export async function getConversation(conversationId: string): Promise<ConversationDetail> {
  // Fetch the full transcript only on demand so signed-in bootstrap can stay cheap even with many conversations.
  const response = await request(`/api/me/conversations/${conversationId}`);
  const data = await parseJson(response);

  if (!response.ok || typeof data !== "object") {
    throw new Error(getErrorMessage(data, "Unable to load the conversation."));
  }

  return normalizeConversationDetail(data);
}

export async function renameConversation(conversationId: string, title: string): Promise<ConversationDetail> {
  // PATCH returns the normalized conversation so callers can replace the local shell in one step.
  const response = await fetchWithCsrf(`/api/me/conversations/${conversationId}`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
  const data = await parseJson(response);

  if (!response.ok || typeof data !== "object") {
    throw new Error(getErrorMessage(data, "Unable to rename the conversation."));
  }

  return normalizeConversationDetail(data);
}

export async function deleteConversation(conversationId: string): Promise<void> {
  // Keep delete narrowly scoped to one id because the UI offers both single-delete and bulk-clear paths.
  const response = await fetchWithCsrf(`/api/me/conversations/${conversationId}`, {
    method: "DELETE"
  });

  if (!response.ok && response.status !== 204) {
    const data = await parseJson(response);
    throw new Error(getErrorMessage(data, "Unable to delete the conversation."));
  }
}

export async function clearConversations(): Promise<void> {
  // Bulk clear is a separate endpoint so the frontend does not need to fan out destructive requests per session.
  const response = await fetchWithCsrf("/api/me/conversations", {
    method: "DELETE"
  });

  if (!response.ok && response.status !== 204) {
    const data = await parseJson(response);
    throw new Error(getErrorMessage(data, "Unable to clear conversation history."));
  }
}

export async function importConversations(conversations: ChatSession[]): Promise<string[]> {
  // Import sends the guest-local transcript verbatim once so the backend can take over as the durable store after login.
  const response = await fetchWithCsrf("/api/me/conversations/import", {
    method: "POST",
    body: JSON.stringify({
      conversations: conversations.map((conversation) => ({
        id: conversation.id,
        title: conversation.title,
        summary: conversation.summary,
        createdAt: conversation.createdAt,
        updatedAt: conversation.updatedAt,
        messages: conversation.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          createdAt: message.createdAt
        }))
      }))
    })
  });
  const data = await parseJson(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(data, "Unable to import local conversations."));
  }

  return Array.isArray(data.imported_ids)
    ? data.imported_ids.flatMap((item) => (typeof item === "string" ? [item] : []))
    : [];
}
