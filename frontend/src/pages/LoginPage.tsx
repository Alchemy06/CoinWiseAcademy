import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/provider";
import { useAuth } from "../store/authStore";
import { getPostAuthRedirectTarget } from "../utils/authRedirect";

export function LoginPage() {
    // Navigate immediately after login so session-backed chat/history reloads on the primary shell route.
    const navigate = useNavigate();
    const location = useLocation();
    const { tx } = useI18n();
    const { login } = useAuth();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        // Clear the previous request outcome before starting a new auth round-trip.
        setError("");
        setIsSubmitting(true);

        try {
            await login({ email, password });
            // Resume the original protected destination when present, otherwise fall back to the home route.
            navigate(getPostAuthRedirectTarget(location.state), { replace: true });
        } catch (nextError) {
            // Surface backend validation/auth errors inline instead of dropping the user into an alert.
            setError(nextError instanceof Error ? nextError.message : tx("Unable to log in."));
        } finally {
            // Always release the button lock even when navigation does not happen.
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-page-shell">
            <section className="demo-page login-page">
                <h1>{tx("Login")}</h1>
                <p>{tx("Sign in to continue.")}</p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <label>
                        {tx("Email")}
                        <input
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            placeholder={tx("Enter your email")}
                            required
                        />
                    </label>

                    <label>
                        {tx("Password")}
                        <input
                            type="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            placeholder={tx("Enter your password")}
                            required
                        />
                    </label>

                    {error ? <p className="auth-error">{error}</p> : null}

                    {/* Disable repeat submits so duplicate login requests cannot race each other. */}
                    <button disabled={isSubmitting} type="submit">
                        {isSubmitting ? tx("Logging in...") : tx("Login")}
                    </button>
                </form>

                <p className="auth-switch">
                    {tx("Don't have an account?")}{" "}
                    <NavLink to="/signup">{tx("Sign up")}</NavLink>
                </p>
            </section>
        </div>
    );
}
