/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  corePlugins: {
    // Preflight (CSS reset) is disabled so it doesn't override the existing styles.css rules.
    preflight: false,
  },
  theme: {
    extend: {},
  },
  plugins: [],
};
