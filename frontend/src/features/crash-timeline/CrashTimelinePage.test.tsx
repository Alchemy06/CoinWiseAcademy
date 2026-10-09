import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { CrashTimelinePage } from "./CrashTimelinePage";

function LocationProbe() {
  const location = useLocation();

  return <div data-testid="current-path">{location.pathname}</div>;
}

function renderTimeline(initialPath = "/crashes") {
  // Keep the route tree minimal so timeline tests can assert navigation side effects without booting the full app shell.
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/crashes" element={<CrashTimelinePage />} />
        <Route path="/crash-timeline" element={<CrashTimelinePage />} />
        <Route path="/market-replay" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe("CrashTimelinePage", () => {
  beforeEach(() => {
    // Fire immediately so timeline jump assertions do not depend on real animation timing inside JSDOM.
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0);
      return 1;
    });
    Element.prototype.scrollIntoView = vi.fn();
    window.sessionStorage.clear();
  });

  it("renders the minimal timeline shell without removed dashboard copy", () => {
    renderTimeline();

    expect(screen.getByRole("heading", { level: 1, name: "Market crash timeline one event at a time" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /COVID Crash/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /1 The Setup/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("columnheader", { name: "Key date" })).toBeInTheDocument();
    expect(screen.getAllByText("February 14, 2020")).toHaveLength(1);
    expect(screen.getByText(/BTC at £7,920/i)).toBeInTheDocument();
    expect(screen.queryByText("BTC today")).not.toBeInTheDocument();
    expect(screen.queryByText("Past is not destiny. These experiences are.")).not.toBeInTheDocument();
  });

  it("switches cases and resets the new case to the first stage", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("tab", { name: /Luna Collapse/i }));

    expect(screen.getByRole("tab", { name: /Luna Collapse/i })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("button", { name: /1 The Setup/i })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("LUNA/GBP")).toBeInTheDocument();
  });

  it("opens a stage from the timeline marker", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("button", { name: "Jump to stage 1: The Setup" }));

    expect(screen.getByRole("button", { name: /1 The Setup/i })).toHaveAttribute("aria-expanded", "true");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
  });

  it("keeps the completed timeline state after collapsing the last viewed final stage", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("button", { name: "Jump to stage 4: The Recovery" }));
    await user.click(screen.getByRole("button", { name: /4 The Recovery/i }));

    const recoveryMarker = screen.getByRole("button", { name: "Jump to stage 4: The Recovery" });
    const blackThursdayMarker = screen.getByRole("button", { name: "Jump to stage 3: Black Thursday" });

    expect(recoveryMarker.className).toContain("is-passed");
    expect(recoveryMarker.className).not.toContain("is-active");
    expect(blackThursdayMarker.className).toContain("is-passed");
    expect(blackThursdayMarker.className).not.toContain("is-active");
  });

  it("routes playable cases into Market Replay and stores the scenario id", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("button", { name: "Open Market Replay" }));

    expect(window.sessionStorage.getItem("mr_scenario")).toBe("covid");
    expect(screen.getByTestId("current-path")).toHaveTextContent("/market-replay");
  });

  it("keeps unavailable replay scenarios disabled", async () => {
    const user = userEvent.setup();
    renderTimeline();

    await user.click(screen.getByRole("tab", { name: /FTX Collapse/i }));

    expect(screen.getByRole("button", { name: "Market Replay unavailable" })).toBeDisabled();
  });
});
