import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}", "./lib/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: "#0d2d4f", 2: "#1f4468" },
        cyan: { DEFAULT: "#2ac4ea", soft: "#d4f3fb" },
        sky: { DEFAULT: "#eaf9fd" },
        teal: { DEFAULT: "#0e7c99" },
        ink: "#262e3b",
      },
      fontFamily: { sans: ["Manrope", "ui-sans-serif", "system-ui", "sans-serif"] },
    },
  },
  plugins: [],
} satisfies Config;
