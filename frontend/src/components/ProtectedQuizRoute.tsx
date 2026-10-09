import type { PropsWithChildren } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useI18n } from "../i18n/provider";
import { useAuth } from "../store/authStore";
import { buildAuthRedirectState } from "../utils/authRedirect";

export function ProtectedQuizRoute({ children }: PropsWithChildren) {
  const location = useLocation();
  const { tx } = useI18n();
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    // Hold the gate while auth boots so protected routes do not bounce users through login during session hydration.
    return (
      <section className="quiz-access-shell" aria-live="polite">
        <p>{tx("Checking access...")}</p>
      </section>
    );
  }

  if (!isAuthenticated) {
    // Preserve the intended destination so login/signup can return straight to the blocked route.
    return <Navigate replace state={buildAuthRedirectState(location)} to="/login" />;
  }

  return <>{children}</>;
}
