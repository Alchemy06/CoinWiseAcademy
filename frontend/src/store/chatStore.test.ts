import { describe, expect, it } from "vitest";
import type { ChatMessage } from "../types/chat";
import { chatReducer, createInitialChatState, createNewSession } from "./chatStore";

function message(role: ChatMessage["role"], content: string): ChatMessage {
  return {
    id: `m_${role}`,
    role,
    content,
    createdAt: new Date().toISOString()
  };
}

describe("chatReducer", () => {
  it("creates a new conversation and activates it", () => {
    const state = createInitialChatState();
    const next = chatReducer(state, { type: "CREATE_SESSION" });

    expect(next.sessions.length).toBe(state.sessions.length + 1);
    expect(next.activeSessionId).toBe(next.sessions[0].id);
  });

  it("updates the default title from the first user message", () => {
    const session = createNewSession();
    const state = {
      sessions: [session],
      activeSessionId: session.id,
      isWidgetOpen: true,
      isDocked: false,
      dockedWidth: 420,
      webSearchEnabled: true,
      isLoading: false
    };

    const next = chatReducer(state, {
      type: "ADD_MESSAGE",
      payload: {
        sessionId: session.id,
        message: message("user", "What is the difference between Bitcoin and Ethereum?")
      }
    });

    expect(next.sessions[0].title).not.toBe("New Chat");
  });

  it("derives a cleaner single-line title from a long first message", () => {
    const session = createNewSession();
    const state = {
      sessions: [session],
      activeSessionId: session.id,
      isWidgetOpen: true,
      isDocked: false,
      dockedWidth: 420,
      webSearchEnabled: true,
      isLoading: false
    };

    const next = chatReducer(state, {
      type: "ADD_MESSAGE",
      payload: {
        sessionId: session.id,
        message: message("user", "What are the most common staking risks for beginners who do not understand validators yet?")
      }
    });

    expect(next.sessions[0].title).toBe("What are the most common staking…");
  });

  it("switches active conversation after deleting the current one", () => {
    const a = createNewSession("A");
    const b = createNewSession("B");
    const state = {
      sessions: [a, b],
      activeSessionId: a.id,
      isWidgetOpen: true,
      isDocked: false,
      dockedWidth: 420,
      webSearchEnabled: true,
      isLoading: false
    };

    const next = chatReducer(state, { type: "DELETE_SESSION", payload: a.id });

    expect(next.sessions.length).toBe(1);
    expect(next.activeSessionId).toBe(b.id);
  });

  it("stores compressed summary context", () => {
    const session = createNewSession();
    const state = {
      sessions: [session],
      activeSessionId: session.id,
      isWidgetOpen: true,
      isDocked: false,
      dockedWidth: 420,
      webSearchEnabled: true,
      isLoading: false
    };

    const next = chatReducer(state, {
      type: "SET_SUMMARY",
      payload: { sessionId: session.id, summary: "The user asked about wallets and private key risks." }
    });

    expect(next.sessions[0].summary).toContain("private key risks");
  });

  it("renames the selected conversation title", () => {
    const session = createNewSession("Original");
    const state = {
      sessions: [session],
      activeSessionId: session.id,
      isWidgetOpen: true,
      isDocked: false,
      dockedWidth: 420,
      webSearchEnabled: true,
      isLoading: false
    };

    const next = chatReducer(state, {
      type: "RENAME_SESSION",
      payload: { sessionId: session.id, title: "Renamed chat" }
    });

    expect(next.sessions[0].title).toBe("Renamed chat");
  });

  it("clamps the docked sidebar width to the allowed resize range", () => {
    const state = createInitialChatState();
    const next = chatReducer(state, { type: "SET_DOCKED_WIDTH", payload: 999 });

    expect(next.dockedWidth).toBeLessThanOrEqual(560);
    expect(chatReducer(state, { type: "SET_DOCKED_WIDTH", payload: 120 }).dockedWidth).toBeGreaterThanOrEqual(320);
  });

  it("keeps web search enabled by default after hydrating older storage", () => {
    const state = createInitialChatState();
    const next = chatReducer(state, {
      type: "HYDRATE",
      payload: {
        sessions: state.sessions,
        activeSessionId: state.activeSessionId,
        isDocked: false,
        dockedWidth: 420
      }
    });

    expect(next.webSearchEnabled).toBe(true);
  });

  it("stores explicit web search preference changes", () => {
    const state = createInitialChatState();
    const next = chatReducer(state, { type: "SET_WEB_SEARCH_ENABLED", payload: false });

    expect(next.webSearchEnabled).toBe(false);
  });
});
