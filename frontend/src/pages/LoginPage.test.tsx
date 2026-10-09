import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "../i18n/provider";
import { LoginPage } from "./LoginPage";

const useAuthMock = vi.fn();

vi.mock("../store/authStore", () => ({
  useAuth: () => useAuthMock()
}));

describe("LoginPage", () => {
  it("returns the user to the original protected quiz route after login", async () => {
    const user = userEvent.setup();
    const loginMock = vi.fn().mockResolvedValue(undefined);
    useAuthMock.mockReturnValue({
      login: loginMock
    });

    render(
      <I18nProvider>
        <MemoryRouter
          initialEntries={[
            {
              // Simulate the state object injected by ProtectedQuizRoute before the user lands on login.
              pathname: "/login",
              state: {
                from: {
                  pathname: "/quiz/2",
                  search: "",
                  hash: ""
                }
              }
            }
          ]}
        >
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/quiz/:quizId" element={<div>Quiz destination</div>} />
          </Routes>
        </MemoryRouter>
      </I18nProvider>
    );

    await user.type(screen.getByLabelText("Email"), "learner@example.com");
    await user.type(screen.getByLabelText("Password"), "test-password-123");
    await user.click(screen.getByRole("button", { name: "Login" }));

    expect(loginMock).toHaveBeenCalledWith({
      email: "learner@example.com",
      password: "test-password-123"
    });
    expect(await screen.findByText("Quiz destination")).toBeInTheDocument();
  });
});
