import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
    "../../packages/engine/src/**/*.{js,ts}",
  ],
  theme: {
    extend: {
      colors: {
        ink: "#08111c",
        smoke: "#edf2f7",
        ember: "#f97316",
        brass: "#d2a53b",
        tide: "#5cd1b0",
        slate: "#1e2a3b",
      },
      boxShadow: {
        panel: "0 24px 80px rgba(6, 13, 22, 0.22)",
      },
    },
  },
  plugins: [],
};

export default config;
