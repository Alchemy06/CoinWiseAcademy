// Frontend role union mirrors backend serializer validation.
export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  id: string;
  // role maps directly to backend serializer choices.
  role: ChatRole;
  // content is shown directly for user bubbles and parsed into display blocks for assistant bubbles.
  content: string;
  // Sources are attached only to assistant turns that relied on web search.
  sources?: ChatSource[];
  // ISO timestamp used for display ordering and bubble time labels.
  createdAt: string;
}

export interface ChatSource {
  // title is kept for hover/tooltips even though the compact UI usually renders the host name.
  title: string;
  // url is the canonical dedupe key and the href used by both inline citations and the source menu.
  url: string;
}

export interface ChatSession {
  id: string;
  // Human-readable title shown in session history dropdown.
  title: string;
  // Recent verbatim turns kept client-side for local rendering + API payloads.
  messages: ChatMessage[];
  // Rolling summary synced with backend context compression.
  summary: string;
  // createdAt and updatedAt support persistence, debugging, and future recency-based UI decisions.
  createdAt: string;
  updatedAt: string;
}

export interface ChatState {
  // Ordered with newest sessions first for history-menu scanning.
  sessions: ChatSession[];
  // activeSessionId points to the conversation currently rendered in the widget body.
  activeSessionId: string;
  // isWidgetOpen decides whether the floating button or the expanded panel is visible.
  isWidgetOpen: boolean;
  // isDocked toggles between floating mode and right-sidebar mode.
  isDocked: boolean;
  // Persisted sidebar width used when chat is pinned to the right edge.
  dockedWidth: number;
  // webSearchEnabled lets the user opt out of live retrieval while keeping the product default on.
  webSearchEnabled: boolean;
  // isLoading disables send actions and shows the thinking state during backend requests.
  isLoading: boolean;
}

export interface ChatResponsePayload {
  // Main answer text rendered as assistant bubble.
  assistant_message: string;
  // Optional token/cost metadata (depends on model/provider response).
  usage?: Record<string, unknown>;
  // Updated compressed memory returned by backend for next request.
  updated_summary?: string;
  // Web citations surfaced by the backend for clickable rendering in the UI.
  sources?: ChatSource[];
  // conversation is returned for authenticated turns so the client can reconcile against the persisted server record later.
  conversation?: ConversationDetail | null;
}

export interface ConversationSummary {
  // Summary rows power the lightweight history list before a conversation is fully hydrated.
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationDetail extends ConversationSummary {
  // Detail payload adds the full ordered transcript needed to reopen a persisted thread.
  messages: ChatMessage[];
}
