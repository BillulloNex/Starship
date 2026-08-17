import { describe, expect, it } from "vitest";
import { getMobileTopBarState } from "#/utils/mobile-section-nav";
import { I18nKey } from "#/i18n/declaration";

describe("getMobileTopBarState", () => {
  it("shows menu on settings hub", () => {
    expect(getMobileTopBarState("/settings")).toEqual({ mode: "menu" });
  });

  it("backs from settings detail pages to the settings hub", () => {
    expect(getMobileTopBarState("/settings/llm")).toEqual({
      mode: "back",
      backTo: "/settings",
      backLabelKey: I18nKey.SETTINGS$TITLE,
    });
    expect(getMobileTopBarState("/settings/mcp")).toEqual({
      mode: "back",
      backTo: "/settings",
      backLabelKey: I18nKey.SETTINGS$TITLE,
    });
    expect(getMobileTopBarState("/settings/skills")).toEqual({
      mode: "back",
      backTo: "/settings",
      backLabelKey: I18nKey.SETTINGS$TITLE,
    });
  });

  it("shows menu on main app routes", () => {
    expect(getMobileTopBarState("/conversations")).toEqual({ mode: "menu" });
  });
});
