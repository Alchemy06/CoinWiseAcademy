import { type CSSProperties, type KeyboardEvent as ReactKeyboardEvent, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import openAIBlossomMark from "../assets/OpenAI-black-monoblossom.svg";
import { AICoinAvatar } from "./AICoinAvatar";
import { AssistantRichText } from "./chat/AssistantRichText";
import { ThinkingIndicator } from "./chat/ThinkingIndicator";
import { MAX_DOCKED_WIDTH, MIN_DOCKED_WIDTH, SUGGESTED_PROMPTS } from "../constants/chat";
import { useAuth } from "../store/authStore";
import { useChatStore } from "../store/chatStore";
import type { ChatMessage, ChatSession, ChatSource } from "../types/chat";
import { clearConversations, deleteConversation, getConversation, renameConversation, sendChatMessage } from "../utils/api";
import { createId } from "../utils/id";

type PromptIconName = "coin" | "chain" | "shield" | "chart" | "wallet" | "lock";

const PROMPT_ICON_POOL: PromptIconName[] = ["coin", "chain", "shield", "chart", "wallet", "lock"];
// Mirror the backend default so the footer indicator stays truthful even without an explicit frontend env override.
const DEFAULT_CHAT_MODEL = import.meta.env.VITE_CHAT_MODEL ?? "gpt-5-mini";

function formatModelDisplayName(modelName: string): string {
  // Convert raw config ids into a user-facing label without hard-coding one specific deployed model.
  const normalized = modelName.trim().toLowerCase();

  if (!normalized) {
    return "GPT-5 mini";
  }

  if (normalized.startsWith("gpt-")) {
    return `GPT-${normalized.slice(4).replace(/-/g, " ")}`;
  }

  return modelName;
}

function PromptLineIcon({ name }: { name: PromptIconName }) {
  // Welcome prompts use lightweight inline icons instead of importing a full icon pack.
  switch (name) {
    case "coin":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8" />
          <path d="M12 8v8M9.5 10.2c.4-1 1.3-1.6 2.5-1.6 1.4 0 2.3.8 2.3 1.9 0 1.1-.7 1.7-2.3 2.1-1.6.4-2.3 1-2.3 2.1 0 1.1.9 1.9 2.4 1.9 1.1 0 2-.5 2.4-1.4" />
        </svg>
      );
    case "chain":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9.5 14.5l-1.8 1.8a3 3 0 104.2 4.2l1.8-1.8" />
          <path d="M14.5 9.5l1.8-1.8a3 3 0 10-4.2-4.2L10.3 5.3" />
          <path d="M8.8 15.2l6.4-6.4" />
        </svg>
      );
    case "shield":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3l7 3v5c0 4.7-2.8 8.4-7 10-4.2-1.6-7-5.3-7-10V6l7-3z" />
          <path d="M9.2 12.3l2 2 3.8-4" />
        </svg>
      );
    case "chart":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 18h16" />
          <path d="M6 15l3-3 2.5 2.5L16 9l2 2" />
          <circle cx="6" cy="15" r="1" />
          <circle cx="9" cy="12" r="1" />
          <circle cx="11.5" cy="14.5" r="1" />
          <circle cx="16" cy="9" r="1" />
        </svg>
      );
    case "wallet":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M4 8h14a2 2 0 012 2v6a2 2 0 01-2 2H6a2 2 0 01-2-2V8z" />
          <path d="M4 8V7a2 2 0 012-2h10" />
          <path d="M16 13h4" />
          <circle cx="16" cy="13" r="0.7" />
        </svg>
      );
    case "lock":
      return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="10" width="12" height="10" rx="2" />
          <path d="M9 10V8a3 3 0 016 0v2" />
          <circle cx="12" cy="15" r="1" />
        </svg>
      );
    default:
      return <svg viewBox="0 0 24 24" aria-hidden="true" />;
  }
}

function PanelToggleIcon({ isDocked }: { isDocked: boolean }) {
  // Same icon family for expand/collapse keeps the header controls visually aligned.
  if (isDocked) {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="4" y="5" width="16" height="14" rx="2" />
        <path d="M14 5v14" />
        <path d="M10 12h2.5" />
        <path d="M10.8 10.5L9 12l1.8 1.5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M14 5v14" />
      <path d="M10 12h2.5" />
      <path d="M10.7 10.5L12.5 12l-1.8 1.5" />
    </svg>
  );
}

function ChatSettingsIcon() {
  // Reuse the same thin-stroke icon language as the header controls so the footer toggle feels native to the widget.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 7h9" />
      <path d="M16 7h4" />
      <circle cx="13" cy="7" r="2.2" />
      <path d="M4 17h4" />
      <path d="M11 17h9" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  );
}

function GlobeIcon() {
  // Keep the menu row icon lightweight because it sits next to a compact label and switch in a tight popover.
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.4 2.3 3.8 5.3 3.8 8.5S14.4 18.2 12 20.5" />
      <path d="M12 3.5c-2.4 2.3-3.8 5.3-3.8 8.5S9.6 18.2 12 20.5" />
    </svg>
  );
}

function buildMessage(role: ChatMessage["role"], content: string, sources?: ChatSource[]): ChatMessage {
  // Message ids are created client-side so optimistic updates can render immediately.
  return {
    id: createId(role),
    role,
    content,
    sources,
    createdAt: new Date().toISOString()
  };
}

function getActiveSession(sessions: ChatSession[], activeSessionId: string): ChatSession | null {
  // Fallback to first session to keep UI resilient to stale active id.
  return sessions.find((session) => session.id === activeSessionId) ?? sessions[0] ?? null;
}

function formatTime(iso: string): string {
  // Compact "HH:mm" format matches chat bubble aesthetics.
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(iso));
}

function getSourceLabel(source: ChatSource): string {
  // Prefer compact host labels so the citation row stays dense in a narrow chat column.
  try {
    // Derive the label from the actual URL so duplicate titles from different outlets do not look identical.
    return new URL(source.url).hostname.replace(/^www\./, "");
  } catch {
    // Invalid URLs should still degrade into something readable instead of leaving the chip blank.
    const title = source.title.trim();
    return title || source.url;
  }
}

function renderAssistantMessage(content: string, sources: ChatSource[] = [], options: {
  // messageId scopes the floating source menu to one assistant bubble at a time.
  messageId: string;
  // openSourceMenuId is owned by ChatWidget so only one popover can stay open globally.
  openSourceMenuId: string | null;
  // Toggle/close callbacks stay outside the renderer so the parent can coordinate click-away logic.
  onToggleSourceMenu: (messageId: string) => void;
  onCloseSourceMenu: () => void;
  // The active popover root is forwarded back to the parent for outside-click detection.
  sourceMenuRef: { current: HTMLLIElement | null };
}) {
  const { messageId, openSourceMenuId, onToggleSourceMenu, onCloseSourceMenu, sourceMenuRef } = options;
  // Compare by message id so menu state survives rerenders even if source arrays are recreated.
  const isSourceMenuOpen = openSourceMenuId === messageId;
  return (
    <div>
      <AssistantRichText content={content} />
      {sources.length > 0 ? (
        <section className="chatbot-message-sources" aria-label="Sources">
          {/* Keep the footer semantically grouped so screen readers discover citations after the answer body. */}
          <span className="chatbot-message-sources-label">Sources</span>
          <ul className="chatbot-message-sources-list">
            {sources.slice(0, 2).map((source, sourceIndex) => (
              <li key={source.url}>
                <a
                  className="chatbot-message-source-link"
                  href={source.url}
                  rel="noreferrer noopener"
                  target="_blank"
                  title={source.title || source.url}
                >
                  {/* Keep visible labels short, but expose the full upstream title through the native tooltip. */}
                  {`${sourceIndex + 1}. ${getSourceLabel(source)}`}
                </a>
              </li>
            ))}
            {sources.length > 2 ? (
              // Only show a menu trigger when overflow actually exists so two-source answers stay visually quiet.
              <li className="chatbot-message-sources-more" ref={isSourceMenuOpen ? sourceMenuRef : null}>
                <button
                  aria-expanded={isSourceMenuOpen}
                  aria-haspopup="menu"
                  className="chatbot-message-sources-more-trigger"
                  // Toggle from the parent-owned id so repeated clicks can both open and collapse the same menu.
                  onClick={() => onToggleSourceMenu(messageId)}
                  type="button"
                >
                  {`+${sources.length - 2}`}
                </button>
                {isSourceMenuOpen ? (
                  // Render the overflow list only while open so hidden menus do not add extra DOM hit targets.
                  <ul className="chatbot-message-sources-popover" role="menu">
                    {sources.slice(2).map((source, sourceIndex) => (
                      <li key={source.url}>
                        <a
                          className="chatbot-message-source-link"
                          href={source.url}
                          // Close immediately on navigation so the next opened message starts from a clean state.
                          onClick={onCloseSourceMenu}
                          rel="noreferrer noopener"
                          // The menu still opens links in a new tab so the learning flow stays on the chat page.
                          target="_blank"
                          title={source.title || source.url}
                        >
                          {`${sourceIndex + 3}. ${getSourceLabel(source)}`}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

function getDockedWidthBounds(viewportWidth: number) {
  // Sidebar width is constrained by viewport so main content always keeps usable space.
  const max = Math.min(MAX_DOCKED_WIDTH, Math.max(MIN_DOCKED_WIDTH, viewportWidth - 280));
  return {
    min: Math.min(MIN_DOCKED_WIDTH, max),
    max
  };
}

function clampDockedWidth(width: number, viewportWidth: number): number {
  const bounds = getDockedWidthBounds(viewportWidth);
  return Math.min(bounds.max, Math.max(bounds.min, width));
}

type TooltipAlign = "start" | "center" | "end";
type TooltipSide = "top" | "bottom" | "left";
type TooltipTone = "dark" | "light";

// Keep the tooltip markup colocated with each trigger so hover-only hints do not need extra widget state.
function TooltipTrigger({
  align = "center",
  children,
  className = "",
  label,
  side = "top",
  tone = "dark"
}: {
  align?: TooltipAlign;
  children: ReactNode;
  className?: string;
  label: string;
  side?: TooltipSide;
  tone?: TooltipTone;
}) {
  return (
    <span className={`chatbot-tooltip-anchor align-${align} side-${side} tone-${tone} ${className}`.trim()}>
      {children}
      <span aria-hidden="true" className="chatbot-tooltip-bubble" role="tooltip">
        {label}
      </span>
    </span>
  );
}

export function ChatWidget() {
  // Render the full widget shell and own the transient UI state that does not belong in persistence.
  // Auth state matters here because signed-in sessions can be renamed/deleted remotely and lazy-loaded from the server.
  const { isAuthenticated, refreshMe } = useAuth();
  const { state, dispatch } = useChatStore();
  const location = useLocation();
  const [draft, setDraft] = useState("");
  const [localError, setLocalError] = useState("");
  const [isInputFocused, setInputFocused] = useState(false);
  const [isHistoryMenuOpen, setHistoryMenuOpen] = useState(false);
  const [isSessionActionsOpen, setSessionActionsOpen] = useState(false);
  const [isRenameMode, setIsRenameMode] = useState(false);
  const [renameDraft, setRenameDraft] = useState("");
  // Keep source popovers mutually exclusive so overlapping citation menus never stack on top of each other.
  const [openSourceMenuId, setOpenSourceMenuId] = useState<string | null>(null);
  // Footer settings stay local to the widget because only the trigger visibility is transient UI state.
  const [isWebSearchMenuOpen, setWebSearchMenuOpen] = useState(false);
  const [isResizingDocked, setIsResizingDocked] = useState(false);
  const [liveDockedWidth, setLiveDockedWidth] = useState<number | null>(null);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const draftInputRef = useRef<HTMLTextAreaElement | null>(null);
  const historyMenuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const sessionActionsRef = useRef<HTMLDivElement | null>(null);
  // Track only the currently open source menu root for click-away handling.
  const sourceMenuRef = useRef<HTMLLIElement | null>(null);
  // Keep the footer popover ref separate from header menus so click-away logic can close each surface precisely.
  const webSearchMenuRef = useRef<HTMLDivElement | null>(null);
  const liveDockedWidthRef = useRef(state.dockedWidth);

  // Resolve the active session defensively so stale ids in storage never break rendering.
  const activeSession = useMemo(() => getActiveSession(state.sessions, state.activeSessionId), [state]);
  const activeMessages = activeSession?.messages ?? [];
  // Keep the footer label stable because the configured model is static for the lifetime of the page.
  const currentModelLabel = useMemo(() => formatModelDisplayName(DEFAULT_CHAT_MODEL), []);
  // Empty thread shows welcome prompt cards instead of conversation list.
  const isConversationMode = activeMessages.length > 0;
  // Home route gets the lighter launcher pill so the closed-state entry reads as an onboarding affordance.
  const isHomeRoute = location.pathname === "/";
  // Clamp width on read because viewport changes can make an old persisted width invalid.
  const effectiveDockedWidth =
    typeof window === "undefined" ? state.dockedWidth : clampDockedWidth(liveDockedWidth ?? state.dockedWidth, window.innerWidth);
  const panelStyle = (
    state.isDocked
      ? ({
          ["--chatbot-docked-width" as const]: `${effectiveDockedWidth}px`
        } as CSSProperties)
      : undefined
  );
  const randomPromptCards = useMemo(() => {
    const promptPool = [...SUGGESTED_PROMPTS];
    const iconPool = [...PROMPT_ICON_POOL];

    // Shuffle each time a new session starts so welcome cards feel less repetitive.
    for (let i = promptPool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [promptPool[i], promptPool[j]] = [promptPool[j], promptPool[i]];
    }

    for (let i = iconPool.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [iconPool[i], iconPool[j]] = [iconPool[j], iconPool[i]];
    }

    return promptPool.slice(0, 4).map((prompt, index) => ({
      prompt,
      icon: iconPool[index]
    }));
    // Recompute suggestions only when the visible conversation context actually changes.
  }, [activeSession?.id, state.isWidgetOpen]);

  useEffect(() => {
    if (!isAuthenticated || !activeSession || activeSession.messages.length > 0) {
      return;
    }

    let cancelled = false;

    const loadConversation = async (): Promise<void> => {
      try {
        // History bootstrap initially loads only summary rows, so opening a remote thread lazily hydrates its transcript here.
        const conversation = await getConversation(activeSession.id);
        if (!cancelled) {
          dispatch({
            type: "UPSERT_SESSION",
            payload: {
              id: conversation.id,
              title: conversation.title,
              messages: conversation.messages,
              summary: conversation.summary,
              createdAt: conversation.createdAt,
              updatedAt: conversation.updatedAt
            }
          });
        }
      } catch {
        // Keep the widget usable even if one historical conversation fails to hydrate.
      }
    };

    void loadConversation();

    return () => {
      cancelled = true;
    };
  }, [activeSession, dispatch, isAuthenticated]);

  useEffect(() => {
    // Auto-scroll when new content appears.
    if (!isConversationMode && !state.isLoading) {
      return;
    }
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeMessages.length, isConversationMode, state.isLoading, state.isWidgetOpen]);

  useEffect(() => {
    // Close dropdowns on context switches to avoid stale menu state.
    setHistoryMenuOpen(false);
    setSessionActionsOpen(false);
    setIsRenameMode(false);
    setRenameDraft("");
    setOpenSourceMenuId(null);
    setWebSearchMenuOpen(false);
  }, [state.activeSessionId, state.isDocked, state.isWidgetOpen]);

  useEffect(() => {
    // Clear stale network error when user starts a fresh context.
    setLocalError("");
  }, [state.activeSessionId, state.isWidgetOpen]);

  useEffect(() => {
    // Resize the textarea after every draft change so Enter-created new lines remain visible.
    const textarea = draftInputRef.current;
    if (!textarea) {
      return;
    }

    // Match the textarea box to its full content height instead of introducing inner scroll.
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [draft, state.isDocked, state.isWidgetOpen]);

  useEffect(() => {
    // Focus/select the inline rename input when menu enters rename mode.
    if (!isRenameMode) {
      return;
    }
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [isRenameMode]);

  useEffect(() => {
    // Keep the live resize shadow state in sync when store width changes externally.
    if (isResizingDocked) {
      return;
    }
    liveDockedWidthRef.current = state.dockedWidth;
  }, [isResizingDocked, state.dockedWidth]);

  useEffect(() => {
    // Leaving docked mode should immediately drop any active resize interaction.
    if (state.isDocked) {
      return;
    }
    setIsResizingDocked(false);
    setLiveDockedWidth(null);
  }, [state.isDocked]);

  useEffect(() => {
    if (!isHistoryMenuOpen && !isSessionActionsOpen && !openSourceMenuId && !isWebSearchMenuOpen) {
      // Skip global listeners entirely when no transient UI is open to keep the widget cheap while idle.
      return;
    }

    const closeMenus = (event: MouseEvent): void => {
      // Shared click-away handling keeps header menus and source popovers from getting stuck open together.
      if (!(event.target instanceof Node)) {
        return;
      }

      if (historyMenuRef.current && !historyMenuRef.current.contains(event.target)) {
        // Clicks outside the session picker should always collapse it, even if another transient menu stays open.
        setHistoryMenuOpen(false);
      }

      if (sessionActionsRef.current && !sessionActionsRef.current.contains(event.target)) {
        // Keep the kebab menu behavior aligned with the history menu instead of letting them linger independently.
        setSessionActionsOpen(false);
      }

      if (sourceMenuRef.current && !sourceMenuRef.current.contains(event.target)) {
        // Any click outside the active source menu should collapse it, including blank space in the thread.
        setOpenSourceMenuId(null);
      }

      if (webSearchMenuRef.current && !webSearchMenuRef.current.contains(event.target)) {
        // Mirror the rest of the widget menus so the footer settings panel never gets stuck open.
        setWebSearchMenuOpen(false);
      }
    };

    const closeOnEscape = (event: KeyboardEvent): void => {
      // Escape closes transient controls without mutating conversation data.
      if (event.key !== "Escape") {
        return;
      }
      // Escape is treated as a global close affordance for every transient menu in the widget.
      setHistoryMenuOpen(false);
      setSessionActionsOpen(false);
      setOpenSourceMenuId(null);
      setWebSearchMenuOpen(false);
    };

    window.addEventListener("mousedown", closeMenus);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      // Avoid leaking global event handlers.
      window.removeEventListener("mousedown", closeMenus);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isHistoryMenuOpen, isSessionActionsOpen, openSourceMenuId, isWebSearchMenuOpen]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const syncDockedWidthToViewport = (): void => {
      // Clamp the persisted store width first so viewport shrink never leaves the panel off-screen.
      const nextWidth = clampDockedWidth(state.dockedWidth, window.innerWidth);
      if (nextWidth !== state.dockedWidth) {
        dispatch({ type: "SET_DOCKED_WIDTH", payload: nextWidth });
      }

      if (liveDockedWidth !== null) {
        // Clamp the in-progress drag width too so resizing feels stable during live viewport changes.
        const clampedLiveWidth = clampDockedWidth(liveDockedWidthRef.current, window.innerWidth);
        liveDockedWidthRef.current = clampedLiveWidth;
        setLiveDockedWidth(clampedLiveWidth);
      }
    };

    window.addEventListener("resize", syncDockedWidthToViewport);
    return () => window.removeEventListener("resize", syncDockedWidthToViewport);
  }, [dispatch, liveDockedWidth, state.dockedWidth]);

  useEffect(() => {
    if (!isResizingDocked || typeof window === "undefined") {
      return;
    }

    const finishResize = (): void => {
      // Commit only the final clamped width so persistence never stores a transient drag value.
      const nextWidth = clampDockedWidth(liveDockedWidthRef.current, window.innerWidth);
      dispatch({ type: "SET_DOCKED_WIDTH", payload: nextWidth });
      setLiveDockedWidth(null);
      setIsResizingDocked(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    const handlePointerMove = (event: MouseEvent): void => {
      // Derive width from the right edge so dragging left makes the docked sidebar wider.
      const nextWidth = clampDockedWidth(window.innerWidth - event.clientX, window.innerWidth);
      liveDockedWidthRef.current = nextWidth;
      setLiveDockedWidth(nextWidth);
    };

    document.body.style.cursor = "ew-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", handlePointerMove);
    window.addEventListener("mouseup", finishResize);

    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", handlePointerMove);
      window.removeEventListener("mouseup", finishResize);
    };
  }, [dispatch, isResizingDocked]);

  const handleSend = async (overrideText?: string): Promise<void> => {
    // Bail out when the active session is missing or a previous send is still pending.
    if (!activeSession || state.isLoading) {
      return;
    }

    // Normalize prompt-card sends and textarea sends through the same trimmed content path.
    const content = (overrideText ?? draft).trim();
    if (!content) {
      return;
    }

    setLocalError("");

    const userMessage = buildMessage("user", content);
    // Snapshot before optimistic update so backend receives only historical turns once.
    const historySnapshot = [...activeSession.messages];

    // Optimistically append the user turn so the interface feels immediate during slower model calls.
    dispatch({ type: "ADD_MESSAGE", payload: { sessionId: activeSession.id, message: userMessage } });
    setDraft("");
    dispatch({ type: "SET_LOADING", payload: true });

    try {
      // Send recent history and the rolling summary separately because backend prompt assembly is ordered.
      const response = await sendChatMessage({
        session_id: activeSession.id,
        conversation_id: isAuthenticated ? activeSession.id : undefined,
        messages: historySnapshot,
        summary: activeSession.summary,
        user_input: content,
        // Send the persisted preference on every turn so backend tool wiring matches the visible footer toggle.
        web_search_enabled: state.webSearchEnabled
      });

      const assistantMessage = buildMessage("assistant", response.assistant_message, response.sources);
      // Append only after backend cleanup so the bubble already contains normalized formatting.
      dispatch({ type: "ADD_MESSAGE", payload: { sessionId: activeSession.id, message: assistantMessage } });

      if (typeof response.updated_summary === "string") {
        // Persist returned memory immediately so the next send does not need the full old transcript.
        dispatch({
          type: "SET_SUMMARY",
          payload: { sessionId: activeSession.id, summary: response.updated_summary }
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "The AI service is temporarily unavailable.";
      setLocalError(message);
      // Keep conversation continuity by surfacing failures as assistant-style message.
      const fallback = buildMessage("assistant", `Sorry, I cannot reply right now.\n\n${message}`);
      dispatch({ type: "ADD_MESSAGE", payload: { sessionId: activeSession.id, message: fallback } });
    } finally {
      dispatch({ type: "SET_LOADING", payload: false });
    }
  };

  const handleStartRenameSession = (session: ChatSession): void => {
    // Inline rename avoids unreliable browser prompt behavior in embedded environments.
    setRenameDraft(session.title);
    setIsRenameMode(true);
  };

  const isAuthExpiredError = (error: unknown): boolean => {
    // Backend auth failures can surface with slightly different text, so match the common session-expiry variants centrally.
    if (!(error instanceof Error)) {
      return false;
    }

    return /Authentication credentials were not provided|session/i.test(error.message);
  };

  const handleRenameSession = async (session: ChatSession): Promise<void> => {
    // Trim to avoid saving visually empty titles made of whitespace only.
    const normalized = renameDraft.trim();
    if (!normalized) {
      return;
    }
    if (isAuthenticated) {
      try {
        // Signed-in users rename the persisted server record first so history stays consistent across devices/tabs.
        const updated = await renameConversation(session.id, normalized);
        dispatch({
          type: "UPSERT_SESSION",
          payload: {
            id: updated.id,
            title: updated.title,
            messages: updated.messages,
            summary: updated.summary,
            createdAt: updated.createdAt,
            updatedAt: updated.updatedAt
          }
        });
      } catch (error) {
        if (isAuthExpiredError(error)) {
          // If the session expired, at least keep the local title coherent while auth store re-checks server state.
          await refreshMe();
          dispatch({ type: "RENAME_SESSION", payload: { sessionId: session.id, title: normalized } });
        } else {
          setLocalError(error instanceof Error ? error.message : "Unable to rename the conversation.");
          return;
        }
      }
    } else {
      dispatch({ type: "RENAME_SESSION", payload: { sessionId: session.id, title: normalized } });
    }
    setIsRenameMode(false);
    setRenameDraft("");
    setSessionActionsOpen(false);
  };

  const handleCancelRename = (): void => {
    // Reset draft so the next rename always starts from the persisted title.
    setIsRenameMode(false);
    setRenameDraft("");
  };

  const handleDeleteSession = async (session: ChatSession): Promise<void> => {
    // Use a native confirm for destructive actions so accidental taps do not silently delete history.
    const ok = window.confirm(`Delete conversation \"${session.title}\"?`);
    if (!ok) {
      return;
    }
    if (isAuthenticated) {
      try {
        // Delete remotely first so the server remains the source of truth for authenticated history.
        await deleteConversation(session.id);
      } catch (error) {
        if (isAuthExpiredError(error)) {
          await refreshMe();
        } else {
          setLocalError(error instanceof Error ? error.message : "Unable to delete the conversation.");
          return;
        }
      }
    }
    dispatch({ type: "DELETE_SESSION", payload: session.id });
    setSessionActionsOpen(false);
    setHistoryMenuOpen(false);
  };

  const handleClearHistory = async (): Promise<void> => {
    // Bulk clear mirrors the single-delete UX, but resets the whole authenticated or guest transcript set at once.
    const ok = window.confirm("Delete all conversation history?");
    if (!ok) {
      return;
    }

    if (isAuthenticated) {
      try {
        await clearConversations();
      } catch (error) {
        if (isAuthExpiredError(error)) {
          await refreshMe();
        } else {
          setLocalError(error instanceof Error ? error.message : "Unable to clear conversation history.");
          return;
        }
      }
    }

    dispatch({ type: "REPLACE_SESSIONS", payload: { sessions: [] } });
    setSessionActionsOpen(false);
    setHistoryMenuOpen(false);
  };

  const handleResizeStart = (): void => {
    // Disable drag-resize for narrow screens because floating mode is the intended mobile behavior.
    if (typeof window === "undefined" || window.innerWidth <= 720 || !state.isDocked) {
      return;
    }
    const nextWidth = clampDockedWidth(state.dockedWidth, window.innerWidth);
    liveDockedWidthRef.current = nextWidth;
    setLiveDockedWidth(nextWidth);
    setIsResizingDocked(true);
  };

  const handleResizeKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>): void => {
    // Mirror pointer resizing with arrow keys so docked mode remains keyboard accessible.
    if (typeof window === "undefined" || !state.isDocked) {
      return;
    }

    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }

    event.preventDefault();
    const delta = event.key === "ArrowLeft" ? 24 : -24;
    dispatch({
      type: "SET_DOCKED_WIDTH",
      payload: clampDockedWidth(state.dockedWidth + delta, window.innerWidth)
    });
  };

  const handleToggleSourceMenu = (messageId: string): void => {
    // Re-clicking the same trigger closes it; clicking another message swaps the open menu in one state update.
    setOpenSourceMenuId((current) => (current === messageId ? null : messageId));
  };

  const handleCloseSourceMenu = (): void => {
    // Keep a dedicated closer so link clicks and keyboard handlers do not duplicate state logic inline.
    setOpenSourceMenuId(null);
  };

  const handleToggleWebSearchMenu = (): void => {
    // Footer settings should behave like the header menus and open locally from the trigger.
    setHistoryMenuOpen(false);
    setSessionActionsOpen(false);
    // Close other transient surfaces first so the small footer popover never competes for the same visual space.
    setOpenSourceMenuId(null);
    setWebSearchMenuOpen((current) => !current);
  };

  const handleSetWebSearchEnabled = (enabled: boolean): void => {
    // Keep the setting in the shared store so reloads and other tabs see the same preference.
    dispatch({ type: "SET_WEB_SEARCH_ENABLED", payload: enabled });
  };

  if (!state.isWidgetOpen) {
    return (
      /* Keep the launcher hint on the trigger itself so landing-page mode matches the in-panel controls. */
      <TooltipTrigger
        className="chatbot-launcher-tooltip-anchor"
        // Closed-state copy should feel like an invitation into the product theme, not a generic "open chat" utility label.
        label="Ready to talk crypto?"
        side="left"
        tone="light"
      >
        <button
          className="chatbot-chat-fab"
          aria-label="Open AI chat"
          // Floating action button opens full widget panel.
          onClick={() => dispatch({ type: "SET_WIDGET_OPEN", payload: true })}
        >
          <AICoinAvatar className="chatbot-fab-avatar" interactive={false} size={50} />
        </button>
      </TooltipTrigger>
    );
  }

  return (
    <section
      className={`chatbot-chat ${state.isDocked ? "docked" : ""}`}
      aria-label="Crypto AI assistant"
      style={panelStyle}
    >
      {state.isDocked ? (
        <button
          className="chatbot-docked-resize-handle"
          aria-label="Resize AI sidebar"
          aria-orientation="vertical"
          onKeyDown={handleResizeKeyDown}
          onMouseDown={handleResizeStart}
          type="button"
        />
      ) : null}
      <header className="chatbot-chat-header">
        <div className="chatbot-chat-title-group">
          {isConversationMode ? (
            <AICoinAvatar className="chatbot-header-avatar" label="AI avatar" size={state.isDocked ? 30 : 28} />
          ) : null}

          <div className="chatbot-chat-title-wrap" ref={historyMenuRef}>
            <button
              className="chatbot-chat-session-title"
              onClick={() => {
                setSessionActionsOpen(false);
                setWebSearchMenuOpen(false);
                setHistoryMenuOpen((current) => !current);
              }}
            >
              {/* Keep text and caret separate so the title can truncate cleanly without shifting the icon. */}
              <span className="chatbot-chat-session-title-text">{activeSession?.title ?? "New AI Chat"}</span>
              <span className="chatbot-chat-session-title-caret">▾</span>
            </button>

            {isHistoryMenuOpen ? (
              /* Keep session history anchored to the title trigger so switching context feels local to the header. */
              <div className="chatbot-history-dropdown" role="menu" aria-label="Conversation history">
                {state.sessions.map((session) => (
                  <button
                    className={`chatbot-history-item ${session.id === activeSession?.id ? "active" : ""}`}
                    key={session.id}
                    onClick={() => {
                      dispatch({ type: "SET_ACTIVE_SESSION", payload: session.id });
                      setHistoryMenuOpen(false);
                    }}
                  >
                    <span className="chatbot-history-label">{session.title}</span>
                    {session.id === activeSession?.id ? (
                      <span className="chatbot-history-check" aria-hidden="true">
                        <svg viewBox="0 0 16 16">
                          <path d="M3.5 8.2l2.7 2.7L12.5 4.8" />
                        </svg>
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div className="chatbot-chat-header-actions">
          {/* Docked mode flips header hints below the controls because the panel touches the viewport top edge. */}
          {/* Wrap each icon button individually so the tooltip alignment can follow the actual trigger width. */}
          <TooltipTrigger align="start" label="New chat" side={state.isDocked ? "bottom" : "top"}>
            <button aria-label="New chat" onClick={() => dispatch({ type: "CREATE_SESSION" })}>
              +
            </button>
          </TooltipTrigger>
          <TooltipTrigger
            align="center"
            label={state.isDocked ? "Collapse panel" : "Expand panel"}
            side={state.isDocked ? "bottom" : "top"}
          >
            <button
              aria-label={state.isDocked ? "Collapse side panel" : "Expand side panel"}
              className="chatbot-icon-button"
              onClick={() => dispatch({ type: "TOGGLE_DOCKED" })}
            >
              <PanelToggleIcon isDocked={state.isDocked} />
            </button>
          </TooltipTrigger>
          <div className="chatbot-menu-wrap" ref={sessionActionsRef}>
            <TooltipTrigger align="center" label="Actions" side={state.isDocked ? "bottom" : "top"}>
              <button
                aria-label="Conversation actions"
                onClick={() => {
                  setHistoryMenuOpen(false);
                  setWebSearchMenuOpen(false);
                  setSessionActionsOpen((current) => !current);
                }}
              >
                ⋯
              </button>
            </TooltipTrigger>
            {isSessionActionsOpen && activeSession ? (
              /* Scope rename/delete actions to the active session so destructive changes stay unambiguous. */
              <div className="chatbot-actions-dropdown" role="menu" aria-label="Conversation actions menu">
                {isRenameMode ? (
                  <div className="chatbot-rename-form">
                    <label className="chatbot-rename-label" htmlFor="chatbot-rename-input">
                      Rename conversation
                    </label>
                    <input
                      className="chatbot-rename-input"
                      id="chatbot-rename-input"
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void handleRenameSession(activeSession);
                        }

                        if (event.key === "Escape") {
                          event.preventDefault();
                          handleCancelRename();
                        }
                      }}
                      ref={renameInputRef}
                      type="text"
                      value={renameDraft}
                    />
                    <div className="chatbot-rename-actions">
                      <button onClick={handleCancelRename} type="button">
                        Cancel
                      </button>
                      <button disabled={!renameDraft.trim()} onClick={() => void handleRenameSession(activeSession)} type="button">
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <button onClick={() => handleStartRenameSession(activeSession)} type="button">
                      Rename
                    </button>
                    <button className="danger" onClick={() => void handleDeleteSession(activeSession)} type="button">
                      Delete
                    </button>
                    <button className="danger" onClick={() => void handleClearHistory()} type="button">
                      Clear history
                    </button>
                  </>
                )}
              </div>
            ) : null}
          </div>
          <TooltipTrigger align="end" label="Close chat" side={state.isDocked ? "bottom" : "top"}>
            <button aria-label="Hide chat" onClick={() => dispatch({ type: "SET_WIDGET_OPEN", payload: false })}>
              -
            </button>
          </TooltipTrigger>
        </div>
      </header>

      <div className="chatbot-chat-body">
        <div className="chatbot-chat-main">
          <div className={`chatbot-chat-scroll ${isConversationMode ? "conversation" : "idle"}`}>
            {!isConversationMode ? (
              <section className="chatbot-welcome">
                <AICoinAvatar className="chatbot-welcome-avatar" label="AI avatar" size={state.isDocked ? 62 : 48} />
                <h3>Where to next? Let&apos;s start.</h3>
                <div className="chatbot-prompt-cards">
                  {randomPromptCards.map((item) => (
                    /* Suggested prompts should send immediately so the idle-state shortcuts behave like one-click actions. */
                    <button key={item.prompt} onClick={() => void handleSend(item.prompt)}>
                      <span className="chatbot-prompt-icon">
                        <PromptLineIcon name={item.icon} />
                      </span>
                      <span className="chatbot-prompt-text">{item.prompt}</span>
                    </button>
                  ))}
                </div>
              </section>
            ) : (
              <div className="chatbot-thread">
                {activeMessages.map((message) => (
                  <div className={`chatbot-message-row ${message.role}`} key={message.id}>
                    <article className={`chatbot-bubble ${message.role}`}>
                      {message.role === "assistant" ? (
                        renderAssistantMessage(message.content, message.sources, {
                          messageId: message.id,
                          openSourceMenuId,
                          onToggleSourceMenu: handleToggleSourceMenu,
                          onCloseSourceMenu: handleCloseSourceMenu,
                          sourceMenuRef
                        })
                      ) : (
                        <p className="chatbot-message-plain">{message.content}</p>
                      )}
                    </article>
                    <time className={`chatbot-message-time ${message.role}`}>{formatTime(message.createdAt)}</time>
                  </div>
                ))}
              </div>
            )}

            {state.isLoading ? (
              /* Render loading after the thread so the existing transcript does not shift while waiting. */
              <ThinkingIndicator />
            ) : null}
            <div ref={messagesEndRef} />
          </div>

          {localError ? <p className="chatbot-error">{localError}</p> : null}

          <footer className={`chatbot-input-panel ${isInputFocused ? "input-active" : ""}`.trim()}>
            <textarea
              className="chatbot-input"
              placeholder="Use AI to explain crypto concepts..."
              ref={draftInputRef}
              rows={state.isDocked ? 3 : 1}
              value={draft}
              onBlur={() => {
                // Track only the textarea focus state so footer utility buttons do not inherit the active border.
                setInputFocused(false);
              }}
              onChange={(event) => {
                // Clear the previous error once the user starts drafting the next request.
                if (localError) {
                  setLocalError("");
                }
                setDraft(event.target.value);
              }}
              onFocus={() => {
                // Restore the original active styling only while the text input itself is focused.
                setInputFocused(true);
              }}
              onKeyDown={(event) => {
                // Enter submits; Shift+Enter keeps newline for multi-line questions.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  void handleSend();
                }
              }}
            />

            <div className="chatbot-input-footer">
              <div className="chatbot-input-footer-left" ref={webSearchMenuRef}>
                <TooltipTrigger align="start" label="Chat settings">
                  <button
                    aria-expanded={isWebSearchMenuOpen}
                    aria-haspopup="dialog"
                    aria-label="Open chat settings"
                    className={`chatbot-settings-trigger ${isWebSearchMenuOpen ? "active" : ""}`}
                    onClick={handleToggleWebSearchMenu}
                    type="button"
                  >
                    <ChatSettingsIcon />
                  </button>
                </TooltipTrigger>

                {isWebSearchMenuOpen ? (
                  // Keep the settings surface tiny and single-purpose so the input footer remains visually calm.
                  <div aria-label="Chat settings" className="chatbot-settings-menu" role="dialog">
                    <div className="chatbot-settings-item">
                      <div className="chatbot-settings-item-copy">
                        <span className="chatbot-settings-item-icon" aria-hidden="true">
                          <GlobeIcon />
                        </span>
                        <span className="chatbot-settings-item-label">Network Access</span>
                      </div>
                      <button
                        aria-checked={state.webSearchEnabled}
                        // Match switch copy to the actual effect so screen readers announce the next meaningful action.
                        aria-label={state.webSearchEnabled ? "Disable web search" : "Enable web search"}
                        className={`chatbot-switch ${state.webSearchEnabled ? "on" : "off"}`}
                        onClick={() => handleSetWebSearchEnabled(!state.webSearchEnabled)}
                        role="switch"
                        type="button"
                      >
                        <span className="chatbot-switch-thumb" />
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="chatbot-input-footer-right">
                {/* Group the active model marker with send so the input footer reads as one compact action area. */}
                {/* Reuse the same hover-only tooltip treatment for passive footer controls to keep the affordance consistent. */}
                <TooltipTrigger align="start" label="AI model">
                  <div aria-label={`Current chat model: ${currentModelLabel}`} className="chatbot-model-indicator" role="status">
                    <img alt="" aria-hidden="true" className="chatbot-model-indicator-logo" src={openAIBlossomMark} />
                    <span className="chatbot-model-indicator-text">{currentModelLabel}</span>
                  </div>
                </TooltipTrigger>
                {/* Mirror the model badge tooltip so both footer affordances expose labels in the same way. */}
                <TooltipTrigger align="end" label="Send">
                  <button
                    aria-label="Send message"
                    className="chatbot-send"
                    disabled={!draft.trim() || state.isLoading}
                    onClick={() => void handleSend()}
                  >
                    <svg className="chatbot-send-icon" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 18V6" />
                      <path d="M6.5 11.5L12 6l5.5 5.5" />
                    </svg>
                  </button>
                </TooltipTrigger>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </section>
  );
}
