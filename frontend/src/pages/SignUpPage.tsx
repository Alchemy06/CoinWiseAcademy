import { useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useI18n } from "../i18n/provider";
import { useAuth } from "../store/authStore";
import { getPostAuthRedirectTarget } from "../utils/authRedirect";

export function SignUpPage() {
    // Reuse the main app shell after registration so the new session and merged guest data appear in one place.
    const navigate = useNavigate();
    const location = useLocation();
    const { tx } = useI18n();
    const { register } = useAuth();
    const [name, setName] = useState("");
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [error, setError] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault();
        // Reset stale server-side validation before running fresh client checks.
        setError("");

        if (password !== confirmPassword) {
            // Keep the mismatch error inline so the user stays in form context.
            setError(tx("Passwords do not match."));
            return;
        }

        setIsSubmitting(true);

        try {
            await register({
                displayName: name,
                email,
                password,
                confirmPassword
            });
            // Resume the original protected destination when present, otherwise fall back to the home route.
            navigate(getPostAuthRedirectTarget(location.state), { replace: true });
        } catch (nextError) {
            // Preserve backend validation detail because email collisions and password rules are actionable.
            setError(nextError instanceof Error ? nextError.message : tx("Unable to create your account."));
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="auth-page-shell">
            <section className="demo-page login-page">
                <h1>{tx("Sign Up")}</h1>
                <p>{tx("Create an account to get started.")}</p>

                <form className="login-form" onSubmit={handleSubmit}>
                    <label>
                        {tx("Full Name")}
                        <input
                            type="text"
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            placeholder={tx("Enter your full name")}
                            required
                        />
                    </label>

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
                            placeholder={tx("Create a password")}
                            required
                        />
                    </label>

                    <label>
                        {tx("Confirm Password")}
                        <input
                            type="password"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            placeholder={tx("Confirm your password")}
                            required
                        />
                    </label>

                    {error ? <p className="auth-error">{error}</p> : null}

                    {/* Submission lock prevents duplicate account creation attempts on impatient clicks. */}
                    <button disabled={isSubmitting} type="submit">
                        {isSubmitting ? tx("Creating account...") : tx("Sign Up")}
                    </button>
                </form>

                <p className="auth-switch">
                    {tx("Already have an account?")}{" "}
                    <NavLink to="/login">{tx("Login")}</NavLink>
                </p>
            </section>
        </div>
    );
}
