import {
  createContext,
  type Dispatch,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef
} from "react";
import { CHAT_STORAGE_KEY, DEFAULT_DOCKED_WIDTH, MAX_DOCKED_WIDTH, MIN_DOCKED_WIDTH } from "../constants/chat";
import type { ChatMessage, ChatSession, ChatState, ConversationDetail, ConversationSummary } from "../types/chat";
import { useAuth } from "./authStore";
import { getConversation, importConversations, listConversations } from "../utils/api";
import { createId } from "../utils/id";

// Centralize chat state here so UI components stay declarative and reducer updates stay predictable.
// Persist durable conversation fields in localStorage so refreshes do not wipe the widget history.
// Hydrate and cross-tab sync through the provider so every open tab sees the same chat sessions.
interface ChatContextValue {
  state: ChatState;
  dispatch: Dispatch<ChatAction>;
}

interface PersistedChatState {
  sessions: ChatSession[];
  activeSessionId: string;
  // UI-only layout flag persisted for consistent experience after reload.
  isDocked?: boolean;
  // Persist the docked width so the sidebar reopens with the same footprint after reload.
  dockedWidth?: number;
  // Persist user preference for live web retrieval across reloads and tabs.
  webSearchEnabled?: boolean;
}

type ChatAction =
  // HYDRATE: apply persisted storage snapshot.
  | { type: "HYDRATE"; payload: PersistedChatState }
  // Widget visibility/layout toggles.
  | { type: "TOGGLE_WIDGET" }
  | { type: "SET_WIDGET_OPEN"; payload: boolean }
  | { type: "TOGGLE_DOCKED" }
  | { type: "SET_DOCKED_WIDTH"; payload: number }
  | { type: "SET_WEB_SEARCH_ENABLED"; payload: boolean }
  // Session lifecycle.
  | { type: "CREATE_SESSION" }
  | { type: "SET_ACTIVE_SESSION"; payload: string }
  | { type: "RENAME_SESSION"; payload: { sessionId: string; title: string } }
  | { type: "DELETE_SESSION"; payload: string }
  // Conversation content + long-term summary maintenance.
  | { type: "ADD_MESSAGE"; payload: { sessionId: string; message: ChatMessage } }
  | { type: "SET_SUMMARY"; payload: { sessionId: string; summary: string } }
  // Async request state for send button/loading indicator.
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "REPLACE_SESSIONS"; payload: { sessions: ChatSession[]; activeSessionId?: string } }
  | { type: "UPSERT_SESSION"; payload: ChatSession };

const ChatContext = createContext<ChatContextValue | null>(null);

function nowIso(): string {
  // Centralized timestamp helper keeps reducer updates consistent.
  return new Date().toISOString();
}

export function createNewSession(title = "New Chat"): ChatSession {
  // New sessions start empty; titles may later be auto-derived from the first prompt.
  const now = nowIso();
  return {
    id: createId("session"),
    title,
    messages: [],
    summary: "",
    createdAt: now,
    updatedAt: now
  };
}

function conversationSummaryToSession(conversation: ConversationSummary): ChatSession {
  // List endpoints intentionally omit messages so the history menu can load quickly before any thread hydration.
  return {
    id: conversation.id,
    title: conversation.title,
    messages: [],
    summary: conversation.summary,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

export function conversationDetailToSession(conversation: ConversationDetail): ChatSession {
  // Detail responses are the authoritative shape once the user opens a persisted conversation.
  return {
    id: conversation.id,
    title: conversation.title,
    messages: conversation.messages,
    summary: conversation.summary,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

export function createInitialChatState(): ChatState {
  // Keep initial state non-empty so UI can always bind to an active session.
  const session = createNewSession();
  return {
    sessions: [session],
    activeSessionId: session.id,
    isWidgetOpen: false,
    isDocked: false,
    dockedWidth: DEFAULT_DOCKED_WIDTH,
    // Default live retrieval to on so first-time users keep the current behavior without touching settings.
    webSearchEnabled: true,
    isLoading: false
  };
}

function clampDockedWidth(width: number): number {
  // Store should never persist widths outside the resize affordance limits.
  return Math.min(MAX_DOCKED_WIDTH, Math.max(MIN_DOCKED_WIDTH, width));
}

function sanitizePersistedState(payload: PersistedChatState): PersistedChatState {
  // Defensive sanitization keeps malformed localStorage from breaking app boot.
  if (!Array.isArray(payload.sessions) || payload.sessions.length === 0) {
    // Rebuild a valid fallback session when storage is empty or structurally unusable.
    const fallback = createNewSession();
    return {
      sessions: [fallback],
      activeSessionId: fallback.id,
      isDocked: false,
      dockedWidth: DEFAULT_DOCKED_WIDTH,
      // Older or malformed storage should still restore the product default instead of silently disabling search.
      webSearchEnabled: true
    };
  }

  const validSessions = payload.sessions.filter((session) => {
    // Minimal runtime guards to prevent malformed localStorage from breaking reducer logic.
    return (
      typeof session.id === "string" &&
      typeof session.title === "string" &&
      Array.isArray(session.messages) &&
      typeof session.summary === "string"
    );
  });

  const sessions = validSessions.length > 0 ? validSessions : [createNewSession()];
  // Re-anchor the active pointer when stored state references a deleted or invalid session id.
  const activeSessionExists = sessions.some((session) => session.id === payload.activeSessionId);

  return {
    sessions,
    activeSessionId: activeSessionExists ? payload.activeSessionId : sessions[0].id,
    isDocked: payload.isDocked ?? false,
    dockedWidth: clampDockedWidth(payload.dockedWidth ?? DEFAULT_DOCKED_WIDTH),
    // Missing key means the user predates this setting, so preserve the original default-on behavior.
    webSearchEnabled: payload.webSearchEnabled ?? true
  };
}

function deriveSessionTitle(session: ChatSession, message: ChatMessage): string {
  // Titles are derived only from the first user turn; later turns should not rename history items.
  if (message.role !== "user") {
    return session.title;
  }
  const isDefaultTitle = session.title === "New Chat";
  if (!isDefaultTitle || session.messages.length > 0) {
    return session.title;
  }

  // First user prompt becomes a lightweight auto-title for history dropdown.
  const compact = message.content.replace(/\s+/g, " ").trim();
  if (!compact) {
    return session.title;
  }

  // Strip leading punctuation and trailing sentence marks so titles read like labels, not excerpts.
  const cleaned = compact.replace(/^[^A-Za-z0-9]+|[.?!,:;]+$/g, "").trim();
  if (!cleaned) {
    return session.title;
  }

  const maxLength = 34;
  if (cleaned.length <= maxLength) {
    return cleaned;
  }

  // Prefer word boundaries for truncation so the compact header title stays visually calm.
  const sliced = cleaned.slice(0, maxLength + 1);
  const boundary = sliced.lastIndexOf(" ");
  const shortened = boundary >= 16 ? sliced.slice(0, boundary) : cleaned.slice(0, maxLength);
  return `${shortened.trim()}…`;
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  // Pure reducer: every branch must return a new state object.
  switch (action.type) {
    case "HYDRATE": {
      // HYDRATE only replaces persisted fields; transient loading state stays local.
      const hydrated = sanitizePersistedState(action.payload);
      return {
        ...state,
        sessions: hydrated.sessions,
        activeSessionId: hydrated.activeSessionId,
        isDocked: hydrated.isDocked ?? false,
        dockedWidth: clampDockedWidth(hydrated.dockedWidth ?? DEFAULT_DOCKED_WIDTH),
        webSearchEnabled: hydrated.webSearchEnabled ?? true
      };
    }
    case "TOGGLE_WIDGET":
      return {
        ...state,
        isWidgetOpen: !state.isWidgetOpen
      };
    case "SET_WIDGET_OPEN":
      return {
        ...state,
        isWidgetOpen: action.payload
      };
    case "TOGGLE_DOCKED":
      return {
        ...state,
        isDocked: !state.isDocked
      };
    case "SET_DOCKED_WIDTH":
      return {
        ...state,
        dockedWidth: clampDockedWidth(action.payload)
      };
    case "SET_WEB_SEARCH_ENABLED":
      return {
        ...state,
        // Store the preference at the top level because it applies across sessions, not per-conversation history.
        webSearchEnabled: action.payload
      };
    case "CREATE_SESSION": {
      const nextSession = createNewSession();
      return {
        ...state,
        // Insert newest first to keep recent conversations at top of history menu.
        sessions: [nextSession, ...state.sessions],
        activeSessionId: nextSession.id,
        isWidgetOpen: true
      };
    }
    case "SET_ACTIVE_SESSION":
      return {
        ...state,
        // Selecting a history item should always reopen the widget if it was previously collapsed.
        activeSessionId: action.payload,
        isWidgetOpen: true
      };
    case "RENAME_SESSION": {
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== action.payload.sessionId) {
          return session;
        }
        return {
          ...session,
          // Update updatedAt so renames still count as meaningful session activity for future sorting.
          title: action.payload.title,
          updatedAt: nowIso()
        };
      });
      return {
        ...state,
        sessions: nextSessions
      };
    }
    case "DELETE_SESSION": {
      const remaining = state.sessions.filter((session) => session.id !== action.payload);
      if (remaining.length === 0) {
        // Keep invariant: the app always has one active session.
        const fallback = createNewSession();
        return {
          ...state,
          sessions: [fallback],
          activeSessionId: fallback.id
        };
      }

      const nextActiveId = remaining.some((session) => session.id === state.activeSessionId)
        ? state.activeSessionId
        : remaining[0].id;

      return {
        ...state,
        // Fall back to the newest remaining session when the deleted one used to be active.
        sessions: remaining,
        activeSessionId: nextActiveId
      };
    }
    case "ADD_MESSAGE": {
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== action.payload.sessionId) {
          return session;
        }
        return {
          ...session,
          // Title may auto-update from first user turn while still "New Chat".
          // Append immutably so React can detect the changed session tree without deep mutation checks.
          title: deriveSessionTitle(session, action.payload.message),
          messages: [...session.messages, action.payload.message],
          updatedAt: nowIso()
        };
      });
      return {
        ...state,
        sessions: nextSessions
      };
    }
    case "SET_SUMMARY": {
      const nextSessions = state.sessions.map((session) => {
        if (session.id !== action.payload.sessionId) {
          return session;
        }
        return {
          ...session,
          // Persist the newest summary after backend compression so later requests can reuse it.
          summary: action.payload.summary,
          updatedAt: nowIso()
        };
      });

      return {
        ...state,
        sessions: nextSessions
      };
    }
    case "SET_LOADING":
      return {
        ...state,
        isLoading: action.payload
      };
    case "REPLACE_SESSIONS": {
      const sessions = action.payload.sessions.length > 0 ? action.payload.sessions : [createNewSession()];
      const activeSessionId =
        action.payload.activeSessionId && sessions.some((session) => session.id === action.payload.activeSessionId)
          ? action.payload.activeSessionId
          : sessions[0].id;

      return {
        ...state,
        sessions,
        activeSessionId
      };
    }
    case "UPSERT_SESSION": {
      const existingIndex = state.sessions.findIndex((session) => session.id === action.payload.id);
      if (existingIndex < 0) {
        return {
          ...state,
          sessions: [action.payload, ...state.sessions],
          activeSessionId: action.payload.id
        };
      }

      const nextSessions = [...state.sessions];
      nextSessions[existingIndex] = action.payload;
      return {
        ...state,
        sessions: nextSessions.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
        activeSessionId: action.payload.id
      };
    }
    default:
      return state;
  }
}

function parsePersistedState(raw: string | null): PersistedChatState | null {
  // Storage parsing is intentionally tolerant because users/devs can edit localStorage.
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw) as PersistedChatState;
  } catch {
    // Invalid JSON should not crash app boot.
    return null;
  }
}

function persistLocalState(payload: PersistedChatState): void {
  // Centralize writes so guest-only persistence and post-import cleanup use the exact same storage format.
  localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(payload));
}

function buildPersistedStateFromChatState(state: ChatState, sessions: ChatSession[] = state.sessions): PersistedChatState {
  // Recompute the active id against the supplied session list so callers can intentionally persist an emptied history snapshot.
  const activeSessionId = sessions.some((session) => session.id === state.activeSessionId)
    ? state.activeSessionId
    : sessions[0]?.id ?? createNewSession().id;

  return {
    sessions,
    activeSessionId,
    isDocked: state.isDocked,
    dockedWidth: state.dockedWidth,
    webSearchEnabled: state.webSearchEnabled
  };
}

function getImportableSessions(sessions: ChatSession[]): ChatSession[] {
  // Skip untouched placeholder sessions so login does not create empty remote conversations.
  return sessions.filter((session) => session.messages.length > 0);
}

export function ChatProvider({ children }: PropsWithChildren) {
  const { isAuthenticated, isLoading: isAuthLoading, refreshMe } = useAuth();
  // Lazy reducer initializer keeps initial session creation in one place.
  const [state, dispatch] = useReducer(chatReducer, undefined, createInitialChatState);
  const previousAuthRef = useRef<boolean | null>(null);
  // Keep the latest auth refresher in a ref so async sync code does not capture a stale callback.
  const refreshAuthRef = useRef(refreshMe);

  useEffect(() => {
    refreshAuthRef.current = refreshMe;
  }, [refreshMe]);

  useEffect(() => {
    if (isAuthLoading || isAuthenticated) {
      return;
    }
    // Guests continue to use local storage as the source of truth, even after auth-aware chat sync was added.
    const persisted = parsePersistedState(localStorage.getItem(CHAT_STORAGE_KEY));
    if (persisted) {
      dispatch({ type: "HYDRATE", payload: persisted });
      return;
    }
    dispatch({ type: "REPLACE_SESSIONS", payload: { sessions: [] } });
  }, [isAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (isAuthLoading || !isAuthenticated) {
      return;
    }

    let cancelled = false;

    const syncRemoteSessions = async (): Promise<void> => {
      try {
        // First upload any guest-only local history so a fresh login does not appear to "lose" pre-auth conversations.
        const importableSessions = getImportableSessions(state.sessions);
        if (importableSessions.length > 0) {
          await importConversations(importableSessions);
          if (!cancelled) {
            // Clear the local transcript payload once the server becomes authoritative for this signed-in user.
            persistLocalState(buildPersistedStateFromChatState(state, []));
          }
        }

        // Replace local session shells with the server-ordered conversation list for the authenticated account.
        const conversations = await listConversations();
        if (cancelled) {
          return;
        }

        const nextSessions = conversations.map(conversationSummaryToSession);
        dispatch({
          type: "REPLACE_SESSIONS",
          payload: {
            sessions: nextSessions,
            activeSessionId: nextSessions[0]?.id
          }
        });

        const firstConversationId = nextSessions[0]?.id;
        if (!firstConversationId) {
          return;
        }

        // Hydrate the first thread immediately so the reopened widget has real message content instead of an empty shell.
        const detail = await getConversation(firstConversationId);
        if (cancelled) {
          return;
        }

        dispatch({ type: "UPSERT_SESSION", payload: conversationDetailToSession(detail) });
      } catch {
        if (!cancelled) {
          // Failed remote sync most often means the session expired; ask auth to reconcile instead of guessing locally.
          await refreshAuthRef.current();
        }
      }
    };

    void syncRemoteSessions();

    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    const previousAuth = previousAuthRef.current;
    previousAuthRef.current = isAuthenticated;

    if (previousAuth === true && !isAuthenticated) {
      // After logout, fall back to the last guest snapshot so anonymous usage resumes where that browser left off.
      const persisted = parsePersistedState(localStorage.getItem(CHAT_STORAGE_KEY));
      if (persisted) {
        dispatch({ type: "HYDRATE", payload: persisted });
        return;
      }

      dispatch({ type: "REPLACE_SESSIONS", payload: { sessions: [] } });
    }
  }, [isAuthenticated, isAuthLoading]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    // Persist only stable conversation/layout fields; avoid serializing transient loading flag.
    const payload = buildPersistedStateFromChatState(state, state.sessions);
    // Write after every stable-state change so refreshes and secondary tabs see the latest snapshot.
    persistLocalState(payload);
  }, [isAuthenticated, state.sessions, state.activeSessionId, state.isDocked, state.dockedWidth, state.webSearchEnabled]);

  useEffect(() => {
    if (isAuthenticated) {
      return;
    }
    // Keep multiple tabs in sync when one tab updates chat localStorage state.
    const onStorage = (event: StorageEvent): void => {
      if (event.key !== CHAT_STORAGE_KEY) {
        return;
      }
      const next = parsePersistedState(event.newValue);
      if (!next) {
        return;
      }
      dispatch({ type: "HYDRATE", payload: next });
    };

    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [isAuthenticated]);

  const value = useMemo(() => ({ state, dispatch }), [state]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChatStore(): ChatContextValue {
  // Custom hook keeps consumers insulated from raw context plumbing.
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChatStore must be used inside ChatProvider.");
  }
  return context;
}
