import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export function ScrollToTopOnRouteChange() {
  const location = useLocation();

  useEffect(() => {
    // Listen to pathname and query changes so cross-page navigation and query-driven views both reset to a predictable reading start.
    window.scrollTo({
      top: 0,
      left: 0,
      behavior: "auto"
    });
  }, [location.pathname, location.search]);

  return null;
}
