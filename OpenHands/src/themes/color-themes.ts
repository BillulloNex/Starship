export type ColorThemeKey =
  | "openhands-deepsea"
  | "openhands-neutral"
  | "openhands-neo"
  | "vscode-abyss"
  | "catppuccin-frappe"
  | "catppuccin-macchiato";

export interface ColorThemeDefinition {
  label: string;
  /** Overrides for --cool-grey-* CSS custom properties (our semantic scale) */
  scale: Record<string, string>;
  /**
   * Overrides for --heroui-* CSS custom properties.
   * HeroUI stores colors as space-separated HSL channels ("H S% L%") so Tailwind
   * utilities like bg-default-200 resolve to hsl(var(--heroui-default-200)).
   * These vars are set by the heroui() plugin on :root, [data-theme=dark] at
   * build time, so they must be overridden at the same or lower specificity
   * from a later stylesheet to pick up theme changes at runtime.
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

const ABYSS_SCALE: ThemeScale = {
  50: "#DCE8FF",
  100: "#B8C8E8",
  200: "#91A7D0",
  300: "#6688CC",
  400: "#596F99",
  500: "#406385",
  600: "#2B3C5D",
  700: "#1D3152",
  800: "#181F2F",
  900: "#10192C",
  925: "#061940",
  950: "#000C18",
  975: "#000610",
};

const CATPPUCCIN_FRAPPE_SCALE: ThemeScale = {
  50: "#C6D0F5",
  100: "#B5BFE2",
  200: "#A5ADCE",
  300: "#949CBB",
  400: "#838BA7",
  500: "#737994",
  600: "#626880",
  700: "#596075",
  800: "#51576D",
  900: "#414559",
  925: "#303446",
  950: "#292C3C",
  975: "#232634",
};

const CATPPUCCIN_MACCHIATO_SCALE: ThemeScale = {
  50: "#CAD3F5",
  100: "#B8C0E0",
  200: "#A5ADCB",
  300: "#939AB7",
  400: "#8087A2",
  500: "#6E738D",
  600: "#5B6078",
  700: "#52566C",
  800: "#494D64",
  900: "#363A4F",
  925: "#24273A",
  950: "#1E2030",
  975: "#181926",
};

export const COLOR_THEMES: Record<ColorThemeKey, ColorThemeDefinition> = {
  "openhands-deepsea": {
    label: "OpenHands-DeepSea",
    // Matches the values already set by index.css; included so switching back
    // from another theme restores the original palette explicitly.
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
    // Values generated by heroui() from hero.ts — restore them explicitly when
    // switching back from another theme.
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
  },

  "openhands-neutral": {
    label: "OpenHands-Neutral",
    scale: NEUTRAL_SCALE,
    // Each stop follows the same positional mapping as hero.ts:
    //   heroui-default-100 ← cool-grey-950 position ← neutral-950 (#181818)
    //   heroui-default-200 ← cool-grey-925 position ← neutral-900 (#202020)
    //   ...etc.
    heroui: NEUTRAL_HEROUI,
  },

  "openhands-neo": {
    label: "OpenHands-Neo",
    scale: NEUTRAL_SCALE,
    heroui: NEUTRAL_HEROUI,
    tokens: NEO_WHITE_BUTTON_TOKENS,
  },

  "vscode-abyss": {
    label: "Abyss",
    scale: createThemeScale(ABYSS_SCALE),
    heroui: createHeroUITheme(ABYSS_SCALE),
    tokens: {
      "--oh-color-primary": "#6688CC",
      "--oh-accent": "#0063A5",
      "--oh-warning": "#FFEEAD",
    },
  },

  "catppuccin-frappe": {
    label: "Catppuccin Frappé",
    scale: createThemeScale(CATPPUCCIN_FRAPPE_SCALE),
    heroui: createHeroUITheme(CATPPUCCIN_FRAPPE_SCALE),
    tokens: {
      "--oh-color-primary": "#8CAAEE",
      "--oh-accent": "#CA9EE6",
      "--oh-warning": "#E5C890",
    },
  },

  "catppuccin-macchiato": {
    label: "Catppuccin Macchiato",
    scale: createThemeScale(CATPPUCCIN_MACCHIATO_SCALE),
    heroui: createHeroUITheme(CATPPUCCIN_MACCHIATO_SCALE),
    tokens: {
      "--oh-color-primary": "#8AADF4",
      "--oh-accent": "#C6A0F6",
      "--oh-warning": "#EED49F",
    },
  },
};

export const DEFAULT_COLOR_THEME: ColorThemeKey = "openhands-neutral";

export const AVAILABLE_COLOR_THEMES = Object.entries(COLOR_THEMES).map(
  ([key, def]) => ({ key: key as ColorThemeKey, label: def.label }),
);

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

const THEME_STYLE_TAG_ID = "oh-color-theme-override";

/**
 * Apply a theme by injecting (or replacing) a <style> tag that overrides
 * both our custom --cool-grey-* primitives and HeroUI's --heroui-* tokens.
 *
 * Why a <style> tag:
 *   PostCSS transforms :root / body to [data-agent-server-ui], so --cool-grey-*
 *   is set on EVERY element carrying that attribute. A body inline-style only
 *   overrides body itself — inner matching elements keep the stylesheet value.
 *
 * Why heroui variables:
 *   HeroUI stores colors as HSL channels in --heroui-* vars on [data-theme=dark].
 *   They reference their own token system and are unaffected by --cool-grey-*
 *   changes, so we override them from the same injected sheet.
 *
 * Why doubled selectors + re-append on every call:
 *   "Later sheet wins the tie" cannot be relied on: in the built SPA
 *   (ssr:false, prerendered shell) React 19 re-creates the <head> elements it
 *   manages (<Meta/>/<Links/>) whenever the tree above the router remounts.
 *   That can re-insert the base stylesheet <link> AFTER this tag, allowing its
 *   unlayered [data-agent-server-ui] variable rules (0,1,0) to win every tie.
 *   Doubling the attribute selectors ([x][x], 0,2,0) beats them from any
 *   position in <head>; re-appending on each apply keeps document order
 *   favorable as well.
 */
export function applyColorTheme(key: ColorThemeKey): void {
  if (typeof document === "undefined") return;
  const { scale, heroui, tokens = {} } = COLOR_THEMES[key];

  const scaleDecls = Object.entries(scale)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const herouiDecls = Object.entries(heroui)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  const tokenDecls = Object.entries(tokens)
    .map(([p, v]) => `  ${p}: ${v};`)
    .join("\n");

  // Target both selectors for heroui vars:
  //   [data-agent-server-ui] — covers document.body (portal destination) so
  //     portalled popover/listbox content inherits the overridden values.
  //   [data-theme=dark]      — covers the inner AgentServerUIRoot wrapper so
  //     components scoped inside the dark theme wrapper also pick them up.
  // Both are doubled to out-specify the base sheet regardless of stylesheet
  // order (see the doc comment above).
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
  // Re-append even when the tag already exists (appendChild relocates a
  // connected node) so the override also stays after any re-inserted <link>.
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
