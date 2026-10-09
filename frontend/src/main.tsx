import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import { I18nProvider } from "./i18n/provider";
import { AuthProvider } from "./store/authStore";
import { ChatProvider } from "./store/chatStore";
import "./tailwind.css";
// import "./design-system.css";
import "./styles.css";


ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <I18nProvider>
        {/* AuthProvider must wrap ChatProvider so chat sync can decide between guest local storage and session-backed history. */}
        <AuthProvider>
          {/* Provider wraps the whole app so any route can read/write chat state. */}
          <ChatProvider>
            <App />
          </ChatProvider>
        </AuthProvider>
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>
);
