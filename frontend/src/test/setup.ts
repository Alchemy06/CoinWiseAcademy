// Extend Vitest assertions with DOM-focused matchers (toBeInTheDocument, etc.).
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  // Force an explicit DOM reset because the market page tests mount timers/listeners across multiple cases.
  cleanup();
});
