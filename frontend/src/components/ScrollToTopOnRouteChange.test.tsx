import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScrollToTopOnRouteChange } from "./ScrollToTopOnRouteChange";

const scrollToMock = vi.fn();

function TestRoutes() {
  return (
    <>
      <ScrollToTopOnRouteChange />
      <Routes>
        <Route path="/" element={<Link to="/quiz">Go to quiz</Link>} />
        <Route path="/quiz" element={<p>Quiz page</p>} />
      </Routes>
    </>
  );
}

describe("ScrollToTopOnRouteChange", () => {
  beforeEach(() => {
    // JSDOM does not implement browser scrolling, so provide a writable spy target before each assertion path.
    Object.defineProperty(window, "scrollTo", {
      value: scrollToMock,
      writable: true
    });
    scrollToMock.mockReset();
  });

  it("scrolls to the top on initial render and route changes", async () => {
    render(
      <MemoryRouter initialEntries={["/"]}>
        <TestRoutes />
      </MemoryRouter>
    );

    await waitFor(() => {
      // Assert the full option payload so future behavior changes (e.g. smooth scroll) surface as explicit test failures.
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    });

    scrollToMock.mockClear();
    fireEvent.click(screen.getByRole("link", { name: "Go to quiz" }));

    await screen.findByText("Quiz page");
    await waitFor(() => {
      expect(scrollToMock).toHaveBeenCalledWith({
        top: 0,
        left: 0,
        behavior: "auto"
      });
    });
  });
});
