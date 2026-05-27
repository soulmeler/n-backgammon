import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./app/**/*.{js,ts,jsx,tsx}", "./components/**/*.{js,ts,jsx,tsx}", "./lib/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      boxShadow: {
        board: "0 14px 42px rgba(12, 14, 20, 0.18)"
      }
    }
  },
  plugins: []
};

export default config;
