export type PresetThemeKey =
  | "openhands-neutral"
  | "openhands-neo"
  | "openhands-deepsea"
  | "tokyo-night"
  | "vesper"
  | "gruvbox-dark"
  | "rose-pine"
  | "github-dark";

export type ColorThemeKey = PresetThemeKey;

export interface ColorThemeDefinition {
  label: string;
  description: string;
  /** Overrides for --cool-grey-* CSS custom properties (our semantic scale) */
  scale: Record<string, string>;
  /**
   * Overrides for --heroui-* CSS custom properties.
   */
  heroui: Record<string, string>;
  /** Overrides for --oh-* semantic tokens such as brand / button colors. */
  tokens?: Record<string, string>;
}

// HSL channel strings for the neutral grey palette (H=0, S=0%, L=hex/255*100)
// prettier-ignore
const NEUTRAL_HSL = {
  50:  "0 0% 96.86%", // #F7F7F7
  100: "0 0% 92.55%", // #ECECEC
  200: "0 0% 86.27%", // #DCDCDC
  300: "0 0% 74.51%", // #BEBEBE
  400: "0 0% 59.22%", // #979797
  500: "0 0% 45.1%",  // #737373
  600: "0 0% 33.73%", // #565656
  700: "0 0% 25.1%",  // #404040
  800: "0 0% 19.22%", // #313131
  850: "0 0% 15.69%", // #282828
  900: "0 0% 12.55%", // #202020
  950: "0 0% 9.41%",  // #181818
  975: "0 0% 6.27%",  // #101010
};

const NEUTRAL_SCALE = {
  "--cool-grey-50": "#F7F7F7",
  "--cool-grey-100": "#ECECEC",
  "--cool-grey-200": "#DCDCDC",
  "--cool-grey-300": "#BEBEBE",
  "--cool-grey-400": "#979797",
  "--cool-grey-500": "#737373",
  "--cool-grey-600": "#565656",
  "--cool-grey-700": "#404040",
  "--cool-grey-800": "#313131",
  "--cool-grey-900": "#282828",
  "--cool-grey-925": "#202020",
  "--cool-grey-950": "#181818",
  "--cool-grey-975": "#101010",
};

const NEUTRAL_HEROUI = {
  "--heroui-background": NEUTRAL_HSL[950],
  "--heroui-background-foreground": NEUTRAL_HSL[50],
  "--heroui-foreground-50": NEUTRAL_HSL[975],
  "--heroui-foreground-100": NEUTRAL_HSL[950],
  "--heroui-foreground-200": NEUTRAL_HSL[900],
  "--heroui-foreground-300": NEUTRAL_HSL[850],
  "--heroui-foreground-400": NEUTRAL_HSL[800],
  "--heroui-foreground-500": NEUTRAL_HSL[700],
  "--heroui-foreground-600": NEUTRAL_HSL[600],
  "--heroui-foreground-700": NEUTRAL_HSL[500],
  "--heroui-foreground-800": NEUTRAL_HSL[400],
  "--heroui-foreground-900": NEUTRAL_HSL[300],
  "--heroui-foreground": NEUTRAL_HSL[300],
  "--heroui-content1": NEUTRAL_HSL[900],
  "--heroui-content1-foreground": NEUTRAL_HSL[100],
  "--heroui-content2": NEUTRAL_HSL[850],
  "--heroui-content2-foreground": NEUTRAL_HSL[200],
  "--heroui-content3": NEUTRAL_HSL[800],
  "--heroui-content3-foreground": NEUTRAL_HSL[300],
  "--heroui-content4": NEUTRAL_HSL[700],
  "--heroui-content4-foreground": NEUTRAL_HSL[400],
  "--heroui-default-50": NEUTRAL_HSL[975],
  "--heroui-default-100": NEUTRAL_HSL[950],
  "--heroui-default-200": NEUTRAL_HSL[900],
  "--heroui-default-300": NEUTRAL_HSL[850],
  "--heroui-default-400": NEUTRAL_HSL[800],
  "--heroui-default-500": NEUTRAL_HSL[700],
  "--heroui-default-600": NEUTRAL_HSL[600],
  "--heroui-default-700": NEUTRAL_HSL[500],
  "--heroui-default-800": NEUTRAL_HSL[400],
  "--heroui-default-900": NEUTRAL_HSL[300],
  "--heroui-default-foreground": NEUTRAL_HSL[50],
  "--heroui-default": NEUTRAL_HSL[800],
};

import { AGENT_SERVER_UI_THEMEABLE_BRAND_VARIABLES } from "#/styles/agent-server-ui-style-scope";

/** CSS custom properties overridden by color themes (see applyColorTheme). */
export const COLOR_THEME_TOKEN_KEYS = AGENT_SERVER_UI_THEMEABLE_BRAND_VARIABLES;

/** Yellow star + orange bolt tokens from the 021 sticker set — default brand. */
const STICKER_BRAND_TOKENS: Record<
  (typeof COLOR_THEME_TOKEN_KEYS)[number],
  string
> = {
  "--oh-color-primary": "#FFDB6E",
  "--oh-accent": "#FFDB6E",
  "--oh-warning": "#FF9368",
};

/** White primary/accent tokens — used by OpenHands-Neo for button surfaces. */
const NEO_WHITE_BUTTON_TOKENS: Record<
  (typeof COLOR_THEME_TOKEN_KEYS)[number],
  string
> = {
  "--oh-color-primary": "#ffffff",
  "--oh-accent": "#ffffff",
  "--oh-warning": "#ffffff",
};

type ThemeScale = Record<
  50 | 100 | 200 | 300 | 400 | 500 | 600 | 700 | 800 | 900 | 925 | 950 | 975,
  string
>;

function hexToHslChannels(hex: string): string {
  const value = Number.parseInt(hex.slice(1), 16);
  const red = ((value >> 16) & 255) / 255;
  const green = ((value >> 8) & 255) / 255;
  const blue = (value & 255) / 255;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 2;
  const delta = max - min;

  if (delta === 0) return `0 0% ${(lightness * 100).toFixed(2)}%`;

  const saturation = delta / (lightness > 0.5 ? 2 - max - min : max + min);
  let hue: number;
  if (max === red) {
    hue = (green - blue) / delta + (green < blue ? 6 : 0);
  } else if (max === green) {
    hue = (blue - red) / delta + 2;
  } else {
    hue = (red - green) / delta + 4;
  }

  return `${((hue / 6) * 360).toFixed(2)} ${(saturation * 100).toFixed(2)}% ${(lightness * 100).toFixed(2)}%`;
}

function createThemeScale(scale: ThemeScale): Record<string, string> {
  return Object.fromEntries(
    Object.entries(scale).map(([stop, color]) => [
      `--cool-grey-${stop}`,
      color,
    ]),
  );
}

function createHeroUITheme(scale: ThemeScale): Record<string, string> {
  const hsl = Object.fromEntries(
    Object.entries(scale).map(([stop, color]) => [
      stop,
      hexToHslChannels(color),
    ]),
  ) as Record<keyof ThemeScale, string>;

  return {
    "--heroui-background": hsl[950],
    "--heroui-background-foreground": hsl[50],
    "--heroui-foreground-50": hsl[975],
    "--heroui-foreground-100": hsl[950],
    "--heroui-foreground-200": hsl[925],
    "--heroui-foreground-300": hsl[900],
    "--heroui-foreground-400": hsl[800],
    "--heroui-foreground-500": hsl[700],
    "--heroui-foreground-600": hsl[600],
    "--heroui-foreground-700": hsl[500],
    "--heroui-foreground-800": hsl[400],
    "--heroui-foreground-900": hsl[300],
    "--heroui-foreground": hsl[300],
    "--heroui-content1": hsl[925],
    "--heroui-content1-foreground": hsl[100],
    "--heroui-content2": hsl[900],
    "--heroui-content2-foreground": hsl[200],
    "--heroui-content3": hsl[800],
    "--heroui-content3-foreground": hsl[300],
    "--heroui-content4": hsl[700],
    "--heroui-content4-foreground": hsl[400],
    "--heroui-default-50": hsl[975],
    "--heroui-default-100": hsl[950],
    "--heroui-default-200": hsl[925],
    "--heroui-default-300": hsl[900],
    "--heroui-default-400": hsl[800],
    "--heroui-default-500": hsl[700],
    "--heroui-default-600": hsl[600],
    "--heroui-default-700": hsl[500],
    "--heroui-default-800": hsl[400],
    "--heroui-default-900": hsl[300],
    "--heroui-default-foreground": hsl[50],
    "--heroui-default": hsl[800],
  };
}

const TOKYO_NIGHT_SCALE: ThemeScale = {
  50: "#E0AF68",
  100: "#C0CAF5",
  200: "#A9B1D6",
  300: "#9AA5CE",
  400: "#7AA2F7",
  500: "#565F89",
  600: "#414868",
  700: "#3B4261",
  800: "#292E42",
  900: "#24283B",
  925: "#1F2335",
  950: "#1A1B26",
  975: "#16161E",
};

const VESPER_SCALE: ThemeScale = {
  50: "#FFFFFF",
  100: "#F0F0F0",
  200: "#E0E0E0",
  300: "#C0C0C0",
  400: "#A0A0A0",
  500: "#707070",
  600: "#505050",
  700: "#333333",
  800: "#242424",
  900: "#1A1A1A",
  925: "#141414",
  950: "#101010",
  975: "#0A0A0A",
};

const GRUVBOX_SCALE: ThemeScale = {
  50: "#FBF1C7",
  100: "#EBDBB2",
  200: "#D5C4A1",
  300: "#BDAE93",
  400: "#A89984",
  500: "#928374",
  600: "#7C6F64",
  700: "#504945",
  800: "#3C3836",
  900: "#282828",
  925: "#202020",
  950: "#1D2021",
  975: "#141617",
};

const ROSE_PINE_SCALE: ThemeScale = {
  50: "#F4EDE8",
  100: "#E0DEF4",
  200: "#D0CDE8",
  300: "#B5B0D8",
  400: "#9CCFD8",
  500: "#797593",
  600: "#575279",
  700: "#524F67",
  800: "#393552",
  900: "#26233A",
  925: "#1F1D2E",
  950: "#191724",
  975: "#13111C",
};

const GITHUB_DARK_SCALE: ThemeScale = {
  50: "#FFFFFF",
  100: "#F0F6FC",
  200: "#C9D1D9",
  300: "#B1BAC4",
  400: "#8B949E",
  500: "#6E7681",
  600: "#484F58",
  700: "#30363D",
  800: "#21262D",
  900: "#161B22",
  925: "#0F141C",
  950: "#0D1117",
  975: "#010409",
};

export const COLOR_THEMES: Record<PresetThemeKey, ColorThemeDefinition> = {
  "openhands-neutral": {
    label: "OpenHands Neutral",
    description: "Balanced neutral dark with high-clarity greys",
    scale: NEUTRAL_SCALE,
    heroui: NEUTRAL_HEROUI,
    tokens: STICKER_BRAND_TOKENS,
  },

  "openhands-neo": {
    label: "OpenHands Neo",
    description: "High-contrast monochrome with clean white accents",
    scale: NEUTRAL_SCALE,
    heroui: NEUTRAL_HEROUI,
    tokens: NEO_WHITE_BUTTON_TOKENS,
  },

  "openhands-deepsea": {
    label: "Deep Sea",
    description: "Rich deep-ocean canvas with electric cyan-blue",
    scale: {
      "--cool-grey-50": "#F7F9FC",
      "--cool-grey-100": "#EEF2F7",
      "--cool-grey-200": "#DCE3EE",
      "--cool-grey-300": "#C3CDDC",
      "--cool-grey-400": "#A3B0C4",
      "--cool-grey-500": "#7E8A9E",
      "--cool-grey-600": "#626D82",
      "--cool-grey-700": "#4B5468",
      "--cool-grey-800": "#383F50",
      "--cool-grey-900": "#2C313F",
      "--cool-grey-925": "#21252F",
      "--cool-grey-950": "#0B0E14",
      "--cool-grey-975": "#05070A",
    },
    heroui: {
      "--heroui-background": "220 29.03% 6.08%",
      "--heroui-background-foreground": "216 45.45% 97.84%",
      "--heroui-foreground-50": "216 33.33% 2.94%",
      "--heroui-foreground-100": "220 29.03% 6.08%",
      "--heroui-foreground-200": "222.86 17.5% 15.69%",
      "--heroui-foreground-300": "224.21 17.76% 20.98%",
      "--heroui-foreground-400": "222.5 17.65% 26.67%",
      "--heroui-foreground-500": "221.38 16.2% 35.1%",
      "--heroui-foreground-600": "219.38 14.04% 44.71%",
      "--heroui-foreground-700": "217.5 14.16% 55.69%",
      "--heroui-foreground-800": "216.36 21.85% 70.39%",
      "--heroui-foreground-900": "216 26.32% 81.37%",
      "--heroui-foreground": "216 26.32% 81.37%",
      "--heroui-content1": "222.86 17.5% 15.69%",
      "--heroui-content1-foreground": "213.33 36% 95.1%",
      "--heroui-content2": "224.21 17.76% 20.98%",
      "--heroui-content2-foreground": "216.67 34.62% 89.8%",
      "--heroui-content3": "222.5 17.65% 26.67%",
      "--heroui-content3-foreground": "216 26.32% 81.37%",
      "--heroui-content4": "221.38 16.2% 35.1%",
      "--heroui-content4-foreground": "216.36 21.85% 70.39%",
      "--heroui-default-50": "216 33.33% 2.94%",
      "--heroui-default-100": "220 29.03% 6.08%",
      "--heroui-default-200": "222.86 17.5% 15.69%",
      "--heroui-default-300": "224.21 17.76% 20.98%",
      "--heroui-default-400": "222.5 17.65% 26.67%",
      "--heroui-default-500": "221.38 16.2% 35.1%",
      "--heroui-default-600": "219.38 14.04% 44.71%",
      "--heroui-default-700": "217.5 14.16% 55.69%",
      "--heroui-default-800": "216.36 21.85% 70.39%",
      "--heroui-default-900": "216 26.32% 81.37%",
      "--heroui-default-foreground": "216 45.45% 97.84%",
      "--heroui-default": "222.5 17.65% 26.67%",
    },
    tokens: {
      "--oh-color-primary": "#007ACC",
      "--oh-accent": "#007ACC",
    },
  },

  "tokyo-night": {
    label: "Tokyo Night",
    description: "Deep sapphire night canvas with vibrant electric blue",
    scale: createThemeScale(TOKYO_NIGHT_SCALE),
    heroui: createHeroUITheme(TOKYO_NIGHT_SCALE),
    tokens: {
      "--oh-color-primary": "#7AA2F7",
      "--oh-accent": "#7AA2F7",
      "--oh-warning": "#E0AF68",
    },
  },

  vesper: {
    label: "Vesper",
    description: "Minimalist near-black with warm sunset amber",
    scale: createThemeScale(VESPER_SCALE),
    heroui: createHeroUITheme(VESPER_SCALE),
    tokens: {
      "--oh-color-primary": "#FFC799",
      "--oh-accent": "#FFC799",
      "--oh-warning": "#FFE082",
    },
  },

  "gruvbox-dark": {
    label: "Gruvbox Dark",
    description: "Warm retro-groove analog tones for all-day eye comfort",
    scale: createThemeScale(GRUVBOX_SCALE),
    heroui: createHeroUITheme(GRUVBOX_SCALE),
    tokens: {
      "--oh-color-primary": "#FABD2F",
      "--oh-accent": "#FABD2F",
      "--oh-warning": "#FE8019",
    },
  },

  "rose-pine": {
    label: "Rosé Pine",
    description: "Classy warm pine minimalist with iris and foam accents",
    scale: createThemeScale(ROSE_PINE_SCALE),
    heroui: createHeroUITheme(ROSE_PINE_SCALE),
    tokens: {
      "--oh-color-primary": "#C4A7E7",
      "--oh-accent": "#C4A7E7",
      "--oh-warning": "#F6C177",
    },
  },

  "github-dark": {
    label: "GitHub Dark",
    description: "Precision-engineered crisp enterprise dark mode",
    scale: createThemeScale(GITHUB_DARK_SCALE),
    heroui: createHeroUITheme(GITHUB_DARK_SCALE),
    tokens: {
      "--oh-color-primary": "#58A6FF",
      "--oh-accent": "#58A6FF",
      "--oh-warning": "#D29922",
    },
  },
};

export const DEFAULT_COLOR_THEME: PresetThemeKey = "openhands-neutral";

export interface ThemeMeta {
  key: ColorThemeKey;
  label: string;
  description: string;
  colors: {
    background: string;
    surface: string;
    foreground: string;
    muted: string;
    accent: string;
    border: string;
  };
}

export const AVAILABLE_COLOR_THEMES: ThemeMeta[] = Object.entries(
  COLOR_THEMES,
).map(([key, def]) => ({
  key: key as ColorThemeKey,
  label: def.label,
  description: def.description,
  colors: {
    background: def.scale["--cool-grey-950"],
    surface: def.scale["--cool-grey-900"],
    foreground: def.scale["--cool-grey-100"],
    muted: def.scale["--cool-grey-400"] ?? "#979797",
    accent: def.tokens?.["--oh-accent"] ?? def.scale["--cool-grey-100"],
    border: def.scale["--cool-grey-700"] ?? "#404040",
  },
}));

const STORAGE_KEY = "openhands-color-theme";

/** Read the persisted theme key from localStorage, falling back to the default. */
export function readPersistedColorTheme(): ColorThemeKey {
  if (typeof window === "undefined") return DEFAULT_COLOR_THEME;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored && stored in COLOR_THEMES) return stored as ColorThemeKey;
  } catch {
    // ignore quota / privacy-mode failures
  }
  return DEFAULT_COLOR_THEME;
}

/** Persist the theme key to localStorage. */
export function persistColorTheme(key: ColorThemeKey): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, key);
  } catch {
    // ignore
  }
}

/** Resolve the effective ColorThemeDefinition for a given theme key. */
export function getThemeDefinition(key: ColorThemeKey): ColorThemeDefinition {
  return (
    COLOR_THEMES[key as PresetThemeKey] ?? COLOR_THEMES[DEFAULT_COLOR_THEME]
  );
}

const THEME_STYLE_TAG_ID = "oh-color-theme-override";

/**
 * Apply a theme by injecting (or replacing) a <style> tag that overrides
 * both our custom --cool-grey-* primitives and HeroUI's --heroui-* tokens.
 */
export function applyColorTheme(key: ColorThemeKey): void {
  if (typeof document === "undefined") return;
  const definition = getThemeDefinition(key);
  const { scale, heroui, tokens = {} } = definition;

  const scaleDecls = Object.entries(scale)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const herouiDecls = Object.entries(heroui)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const tokenDecls = Object.entries(tokens)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const css = [
    `[data-agent-server-ui][data-agent-server-ui] {\n${scaleDecls}\n${herouiDecls}\n${tokenDecls}\n}`,
    `[data-theme=dark][data-theme=dark] {\n${herouiDecls}\n}`,
  ].join("\n");

  let styleEl = document.getElementById(
    THEME_STYLE_TAG_ID,
  ) as HTMLStyleElement | null;
  if (!styleEl) {
    styleEl = document.createElement("style");
    styleEl.id = THEME_STYLE_TAG_ID;
  }
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  syncColorThemeTokensOnScopeRoots(tokens);
}

function syncColorThemeTokensOnScopeRoots(
  tokens: Record<string, string>,
): void {
  const roots = document.querySelectorAll("[data-agent-server-ui]");
  for (const root of roots) {
    if (!(root instanceof HTMLElement)) continue;

    for (const key of COLOR_THEME_TOKEN_KEYS) {
      const value = tokens[key];
      if (value) {
        root.style.setProperty(key, value);
      } else {
        root.style.removeProperty(key);
      }
    }
  }
}
