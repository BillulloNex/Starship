import { heroui } from "@heroui/react";

export default heroui({
  defaultTheme: "dark",
  layout: {
    radius: {
      small: "5px",
      large: "20px",
    },
  },
  themes: {
    dark: {
      colors: {
        primary: "#FFDB6E",

        // Map HeroUI semantic colours to the Figma-style charcoal scale.

        background: {
          DEFAULT: "#1E1E1E", // cool-grey-950 — Figma canvas
          foreground: "#FAFAFA", // cool-grey-50
        },

        foreground: {
          DEFAULT: "#B2B2B2", // cool-grey-300 — Figma secondary text
          "50": "#141414", // cool-grey-975
          "100": "#1E1E1E", // cool-grey-950
          "200": "#2C2C2C", // cool-grey-925
          "300": "#383838", // cool-grey-900
          "400": "#3A3A3A", // cool-grey-800
          "500": "#444444", // cool-grey-700
          "600": "#555555", // cool-grey-600
          "700": "#6E6E6E", // cool-grey-500
          "800": "#8C8C8C", // cool-grey-400
          "900": "#B2B2B2", // cool-grey-300
        },

        // Surface layers: panel → card → inner card → inset
        content1: { DEFAULT: "#2C2C2C", foreground: "#F5F5F5" }, // 925 / 100
        content2: { DEFAULT: "#383838", foreground: "#E6E6E6" }, // 900 / 200
        content3: { DEFAULT: "#3A3A3A", foreground: "#B2B2B2" }, // 800 / 300
        content4: { DEFAULT: "#444444", foreground: "#8C8C8C" }, // 700 / 400

        focus: {
          DEFAULT: "#67E8F9", // agent cyan — matches 021 sticker focus
        },
        default: {
          "50": "#141414", // cool-grey-975
          "100": "#1E1E1E", // cool-grey-950
          "200": "#2C2C2C", // cool-grey-925
          "300": "#383838", // cool-grey-900
          "400": "#3A3A3A", // cool-grey-800
          "500": "#444444", // cool-grey-700
          "600": "#555555", // cool-grey-600
          "700": "#6E6E6E", // cool-grey-500
          "800": "#8C8C8C", // cool-grey-400
          "900": "#B2B2B2", // cool-grey-300
          DEFAULT: "#3A3A3A", // cool-grey-800 — hover/selected tint
          foreground: "#FAFAFA", // cool-grey-50 — text on default bg
        },
      },
    },
  },
});
