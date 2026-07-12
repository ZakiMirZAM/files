/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ink: {
          900: "#06091a",
          800: "#0a0f1e",
          700: "#10172b",
          600: "#172040",
          500: "#1f2a4d",
        },
        gold: {
          DEFAULT: "#c9a84c",
          soft: "#d9b85c",
          mute: "#a98e3a",
          ghost: "rgba(201,168,76,0.18)",
          ink: "#3a2f10",
        },
        gain: {
          DEFAULT: "#7fb87c",
          strong: "#9dd093",
          ghost: "rgba(127,184,124,0.12)",
        },
        loss: {
          DEFAULT: "#c87672",
          strong: "#df8884",
          ghost: "rgba(200,118,114,0.12)",
        },
        primary: {
          DEFAULT: "#c9a84c",
          hover: "#d9b85c",
        },
        secondary: "rgba(255,255,255,0.5)",
      },
      fontFamily: {
        display: ['"Playfair Display"', "Georgia", "serif"],
        sans: ['"DM Sans"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "monospace"],
      },
      borderRadius: {
        container: "0.5rem",
      },
      boxShadow: {
        gold: "0 0 0 1px rgba(201,168,76,0.35), 0 12px 32px -16px rgba(201,168,76,0.4)",
        panel: "0 1px 0 rgba(201,168,76,0.06) inset, 0 24px 48px -32px rgba(0,0,0,0.6)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(12px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards",
        shimmer: "shimmer 2.4s linear infinite",
      },
    },
  },
  plugins: [],
};
