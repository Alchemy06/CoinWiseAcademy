import type { Location } from "react-router-dom";

type RedirectTarget = {
  pathname?: string;
  search?: string;
  hash?: string;
};

type RedirectState = {
  from?: RedirectTarget;
};

function isRedirectState(value: unknown): value is RedirectState {
  // Only structural object-ness matters here because downstream readers revalidate each nested field individually.
  return typeof value === "object" && value !== null;
}

export function buildAuthRedirectState(location: Pick<Location, "pathname" | "search" | "hash">): RedirectState {
  // Preserve the full in-app target so auth completion can resume the intended route instead of dropping the user at home.
  return {
    from: {
      pathname: location.pathname,
      search: location.search,
      hash: location.hash
    }
  };
}

export function getPostAuthRedirectTarget(state: unknown): string {
  // Fall back to home whenever the preserved route shape is missing or malformed.
  if (!isRedirectState(state) || !state.from || typeof state.from.pathname !== "string") {
    return "/";
  }

  // Search/hash are optional, but when present they should survive the auth round-trip intact.
  const search = typeof state.from.search === "string" ? state.from.search : "";
  const hash = typeof state.from.hash === "string" ? state.from.hash : "";
  return `${state.from.pathname}${search}${hash}`;
}
