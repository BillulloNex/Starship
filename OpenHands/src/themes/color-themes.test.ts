import { describe, it, expect, beforeEach } from "vitest";
import {
  getThemeDefinition,
  readPersistedColorTheme,
  persistColorTheme,
  applyColorTheme,
  AVAILABLE_COLOR_THEMES,
  DEFAULT_COLOR_THEME,
} from "./color-themes";

describe("color-themes engine", () => {
  beforeEach(() => {
    localStorage.clear();
    const existing = document.getElementById("oh-color-theme-override");
    if (existing) existing.remove();
  });

  it("exports all 8 WCAG AAA Golden Standard themes", () => {
    const keys = AVAILABLE_COLOR_THEMES.map((t) => t.key);
    expect(keys).toEqual([
      "openhands-neutral",
      "openhands-neo",
      "openhands-deepsea",
      "tokyo-night",
      "vesper",
      "gruvbox-dark",
      "rose-pine",
      "github-dark",
    ]);
  });

  it("persists and reads valid theme keys, falling back to default for invalid ones", () => {
    expect(readPersistedColorTheme()).toBe(DEFAULT_COLOR_THEME);

    persistColorTheme("tokyo-night");
    expect(readPersistedColorTheme()).toBe("tokyo-night");

    // Invalid/removed theme fallback
    localStorage.setItem("openhands-color-theme", "custom");
    expect(readPersistedColorTheme()).toBe(DEFAULT_COLOR_THEME);

    localStorage.setItem("openhands-color-theme", "vscode-abyss");
    expect(readPersistedColorTheme()).toBe(DEFAULT_COLOR_THEME);
  });

  it("uses Figma charcoal stops for the default Neutral theme", () => {
    const scale = getThemeDefinition("openhands-neutral").scale;
    expect(scale["--cool-grey-950"]).toBe("#1E1E1E");
    expect(scale["--cool-grey-925"]).toBe("#2C2C2C");
    expect(scale["--cool-grey-900"]).toBe("#383838");
    expect(scale["--cool-grey-700"]).toBe("#444444");
  });

  it("resolves definitions with accurate scale and tokens", () => {
    const tokyoDef = getThemeDefinition("tokyo-night");
    expect(tokyoDef.label).toBe("Tokyo Night");
    expect(tokyoDef.scale["--cool-grey-950"]).toBe("#1A1B26");
    expect(tokyoDef.tokens?.["--oh-color-primary"]).toBe("#7AA2F7");

    const vesperDef = getThemeDefinition("vesper");
    expect(vesperDef.label).toBe("Vesper");
    expect(vesperDef.scale["--cool-grey-950"]).toBe("#101010");
    expect(vesperDef.tokens?.["--oh-color-primary"]).toBe("#FFC799");

    const gruvboxDef = getThemeDefinition("gruvbox-dark");
    expect(gruvboxDef.label).toBe("Gruvbox Dark");
    expect(gruvboxDef.scale["--cool-grey-950"]).toBe("#1D2021");

    const rosePineDef = getThemeDefinition("rose-pine");
    expect(rosePineDef.label).toBe("Rosé Pine");
    expect(rosePineDef.scale["--cool-grey-950"]).toBe("#191724");

    const githubDarkDef = getThemeDefinition("github-dark");
    expect(githubDarkDef.label).toBe("GitHub Dark");
    expect(githubDarkDef.scale["--cool-grey-950"]).toBe("#0D1117");
  });

  it("applies theme by injecting the style element into document.head", () => {
    applyColorTheme("tokyo-night");

    const styleEl = document.getElementById("oh-color-theme-override");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain("--cool-grey-950: #1A1B26;");
    expect(styleEl?.textContent).toContain("--oh-color-primary: #7AA2F7;");

    applyColorTheme("vesper");
    expect(styleEl?.textContent).toContain("--cool-grey-950: #101010;");
    expect(styleEl?.textContent).toContain("--oh-color-primary: #FFC799;");
  });
});
