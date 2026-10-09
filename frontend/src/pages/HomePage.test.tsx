import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { I18nProvider } from "../i18n/provider";
import { HomePage } from "./HomePage";

describe("HomePage", () => {
  it("renders the editorial homepage layout", () => {
    render(
      <I18nProvider>
        <MemoryRouter>
          <HomePage />
        </MemoryRouter>
      </I18nProvider>
    );

    // Cover each chapter CTA destination so homepage copy/layout refreshes cannot silently break top-level navigation entry points.
    expect(screen.getByRole("heading", { level: 1, name: "A clearer starting point for crypto" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Understand the market" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Understand the market/i })).toHaveAttribute("href", "/market");
    expect(screen.getByRole("link", { name: /Learn before risk/i })).toHaveAttribute("href", "/learn");
    expect(screen.getByRole("link", { name: /Test your judgment/i })).toHaveAttribute("href", "/quiz");
    expect(screen.getByRole("link", { name: /Build your dictionary/i })).toHaveAttribute("href", "/dictionary");
  });
});
