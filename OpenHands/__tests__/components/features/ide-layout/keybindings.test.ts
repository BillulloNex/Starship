import { describe, expect, it } from "vitest";
import {
  formatKeybinding,
  matchesKeybinding,
} from "#/components/features/ide-layout/workbench/keybindings";
import { getToggleViewModeKeybinding } from "#/components/features/ide-layout/workbench/commands";

const event = (overrides: Partial<KeyboardEvent>) => ({
  code: "KeyP",
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...overrides,
});

describe("matchesKeybinding", () => {
  it("maps mod to Cmd on macOS and Ctrl elsewhere", () => {
    const binding = { code: "KeyP", mod: true };
    expect(matchesKeybinding(event({ metaKey: true }), binding, true)).toBe(
      true,
    );
    expect(matchesKeybinding(event({ ctrlKey: true }), binding, true)).toBe(
      false,
    );
    expect(matchesKeybinding(event({ ctrlKey: true }), binding, false)).toBe(
      true,
    );
    expect(matchesKeybinding(event({ metaKey: true }), binding, false)).toBe(
      false,
    );
  });

  it("requires modifiers to match exactly", () => {
    const binding = { code: "KeyP", mod: true };
    expect(
      matchesKeybinding(
        event({ metaKey: true, shiftKey: true }),
        binding,
        true,
      ),
    ).toBe(false);
  });

  it("supports a literal Control key on macOS", () => {
    const binding = { code: "Backquote", ctrl: true };
    expect(
      matchesKeybinding(
        event({ code: "Backquote", ctrlKey: true }),
        binding,
        true,
      ),
    ).toBe(true);
  });

  it("matches by physical key regardless of the produced character", () => {
    // Cmd+Shift+I reports key "i" on some macOS browsers; only `code` counts.
    const binding = getToggleViewModeKeybinding(true);
    const pressed = {
      ...event({ code: "KeyI", metaKey: true, shiftKey: true }),
      key: "i",
    };
    expect(matchesKeybinding(pressed, binding, true)).toBe(true);
  });
});

describe("getToggleViewModeKeybinding", () => {
  it("avoids the DevTools shortcut off macOS", () => {
    expect(formatKeybinding(getToggleViewModeKeybinding(true), true)).toBe(
      "⇧⌘I",
    );
    expect(formatKeybinding(getToggleViewModeKeybinding(false), false)).toBe(
      "Ctrl+Alt+I",
    );
  });
});

describe("formatKeybinding", () => {
  it("formats platform-specific labels", () => {
    expect(formatKeybinding({ code: "KeyB", mod: true, alt: true }, true)).toBe(
      "⌥⌘B",
    );
    expect(formatKeybinding({ code: "Backquote", ctrl: true }, false)).toBe(
      "Ctrl+`",
    );
  });
});
