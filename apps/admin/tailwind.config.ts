import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: { navy: { DEFAULT: "#0D2D4F", 2: "#163D66" }, cyan: "#2AC4EA", teal: "#0E7C99", ink: "#262E3B" },
      boxShadow: { card: "0 1px 2px rgb(13 45 79 / 0.04), 0 1px 3px rgb(13 45 79 / 0.06)" },
    },
  },
  plugins: [],
} satisfies Config;
