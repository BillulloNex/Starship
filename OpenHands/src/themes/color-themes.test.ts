import { describe, it, expect, beforeEach } from "vitest";
import {
  generateCustomThemeScale,
  generateCustomTheme,
  getThemeColors,
  getThemeDefinition,
  readPersistedCustomThemeColors,
  persistCustomThemeColors,
  applyColorTheme,
  DEFAULT_CUSTOM_THEME_COLORS,
  PRESET_DEFAULT_COLORS,
} from "./color-themes";

describe("color-themes customizable engine", () => {
  beforeEach(() => {
    localStorage.clear();
    const existing = document.getElementById("oh-color-theme-override");
    if (existing) existing.remove();
  });

  it("generates a valid 13-stop theme scale from custom base colors", () => {
    const scale = generateCustomThemeScale({
      background: "#171525",
      foreground: "#DEDDF0",
      accent: "#A78BFA",
    });

    expect(scale[950].toUpperCase()).toBe("#171525");
    expect(scale[100].toUpperCase()).toBe("#DEDDF0");
    expect(scale[50]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(scale[975]).toMatch(/^#[0-9A-Fa-f]{6}$/);
    expect(scale[500]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it("generates a complete ColorThemeDefinition with scale, heroui, and tokens", () => {
    const customDef = generateCustomTheme({
      background: "#171525",
      foreground: "#DEDDF0",
      accent: "#A78BFA",
    });

    expect(customDef.label).toBe("Custom");
    expect(customDef.scale["--cool-grey-950"].toUpperCase()).toBe("#171525");
    expect(customDef.scale["--cool-grey-100"].toUpperCase()).toBe("#DEDDF0");
    expect(customDef.tokens?.["--oh-color-primary"]).toBe("#A78BFA");
    expect(customDef.tokens?.["--oh-accent"]).toBe("#A78BFA");
    expect(customDef.heroui["--heroui-background"]).toBeDefined();
  });

  it("persists and reads custom theme colors in localStorage", () => {
    expect(readPersistedCustomThemeColors()).toEqual(
      DEFAULT_CUSTOM_THEME_COLORS,
    );

    const newColors = {
      background: "#001122",
      foreground: "#EFEFEF",
      accent: "#FF5500",
    };

    persistCustomThemeColors(newColors);
    expect(readPersistedCustomThemeColors()).toEqual(newColors);
  });

  it("resolves theme base colors accurately for presets and custom", () => {
    const abyssColors = getThemeColors("vscode-abyss");
    expect(abyssColors).toEqual(PRESET_DEFAULT_COLORS["vscode-abyss"]);

    const customColors = getThemeColors("custom", {
      background: "#111111",
      foreground: "#EEEEEE",
      accent: "#FF00AA",
    });
    expect(customColors.accent).toBe("#FF00AA");
  });

  it("applies theme by injecting the style element into document.head", () => {
    applyColorTheme("custom", {
      background: "#171525",
      foreground: "#DEDDF0",
      accent: "#A78BFA",
    });

    const styleEl = document.getElementById("oh-color-theme-override");
    expect(styleEl).not.toBeNull();
    expect(styleEl?.textContent).toContain("--cool-grey-950: #171525;");
    expect(styleEl?.textContent).toContain("--oh-color-primary: #A78BFA;");
  });
});
