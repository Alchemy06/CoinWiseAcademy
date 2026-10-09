import {
  createContext,
  type PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState
} from "react";
import type { AuthUser } from "../types/auth";
import { ensureCsrfToken, getCurrentUser, loginUser, logoutUser, registerUser } from "../utils/api";
import { createId } from "../utils/id";

const GUEST_ID_STORAGE_KEY = "crypto-or-no-crypto-guest-id-v1";

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput extends LoginInput {
  confirmPassword: string;
  displayName: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  guestId: string;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function getOrCreateGuestId(): string {
  // Guest ids let anonymous quiz/chat activity survive until the user eventually authenticates.
  const existing = localStorage.getItem(GUEST_ID_STORAGE_KEY);
  if (existing) {
    return existing;
  }

  const next = createId("guest");
  localStorage.setItem(GUEST_ID_STORAGE_KEY, next);
  return next;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [guestId, setGuestId] = useState("");

  const refreshMe = async (): Promise<void> => {
    // Keep a tiny dedicated refresh helper so other stores can re-check session state after 401/403-style failures.
    const current = await getCurrentUser();
    setUser(current.authenticated ? current.user : null);
  };

  useEffect(() => {
    let cancelled = false;

    const boot = async (): Promise<void> => {
      try {
        // Establish guest identity before any auth calls so login/register can merge pre-auth data on first submit.
        setGuestId(getOrCreateGuestId());
        // Prime CSRF once at boot so later mutations can assume the cookie already exists.
        await ensureCsrfToken();
        const current = await getCurrentUser();
        if (!cancelled) {
          setUser(current.authenticated ? current.user : null);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    void boot();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: user !== null,
      isLoading,
      guestId,
      login: async (input) => {
        // Send guest_id on login so the backend can adopt anonymous chats/quizzes into the new session.
        const nextUser = await loginUser({
          email: input.email,
          password: input.password,
          guest_id: guestId
        });
        setUser(nextUser);
      },
      logout: async () => {
        await logoutUser();
        // Return to the guest state without touching the stable guest id, so later anonymous work still groups correctly.
        setUser(null);
      },
      refreshMe: async () => {
        await refreshMe();
      },
      register: async (input) => {
        // Registration uses the same guest merge path as login to avoid splitting pre-auth history by flow.
        const nextUser = await registerUser({
          email: input.email,
          password: input.password,
          confirm_password: input.confirmPassword,
          display_name: input.displayName,
          guest_id: guestId
        });
        setUser(nextUser);
      }
    }),
    [guestId, isLoading, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    // Fail fast so provider-order mistakes are caught during development instead of producing partial auth state.
    throw new Error("useAuth must be used inside AuthProvider.");
  }
  return context;
}
