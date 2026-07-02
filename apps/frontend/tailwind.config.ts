import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#18202b",
          900: "#1e2732",
          800: "#262f3d",
          700: "#344054",
          500: "#667085",
          400: "#98a2b3",
          300: "#cdd5df",
          200: "#e4e9f0"
        },
        line: "#d9e1ea"
      },
      boxShadow: {
        panel: "0 18px 45px rgba(24, 32, 43, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
