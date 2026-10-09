import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // React fast-refresh + TSX transform.
  plugins: [react()],
  server: {
    // Keep a stable port for local dev and proxy /api to Django so the browser stays same-origin.
    port: 5173,
    allowedHosts: ["com2042-la-mesa.csee.surrey.ac.uk", "localhost"],
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  test: {
    // JSDOM simulates browser APIs for component/store tests.
    environment: "jsdom",
    // Global matcher/extensions bootstrap for testing-library.
    setupFiles: "./src/test/setup.ts"
  }
});
