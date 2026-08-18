import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AgentServerUIRoot } from "#/components/providers/agent-server-ui-root";
import {
  AVAILABLE_COLOR_THEMES,
  COLOR_THEMES,
  applyColorTheme,
} from "#/themes/color-themes";

const NEW_THEMES = [
  {
    key: "tokyo-night",
    label: "Tokyo Night",
    background: "#1A1B26",
    primary: "#7AA2F7",
  },
  {
    key: "vesper",
    label: "Vesper",
    background: "#101010",
    primary: "#FFC799",
  },
  {
    key: "gruvbox-dark",
    label: "Gruvbox Dark",
    background: "#1D2021",
    primary: "#FABD2F",
  },
  {
    key: "rose-pine",
    label: "Rosé Pine",
    background: "#191724",
    primary: "#C4A7E7",
  },
  {
    key: "github-dark",
    label: "GitHub Dark",
    background: "#0D1117",
    primary: "#58A6FF",
  },
] as const;


describe("color themes", () => {
  it("includes OpenHands-Neo as a neutral-based theme with white button tokens", () => {
    const neo = COLOR_THEMES["openhands-neo"];

    expect(neo.label).toBe("OpenHands Neo");
    expect(neo.scale).toEqual(COLOR_THEMES["openhands-neutral"].scale);
    expect(neo.heroui).toEqual(COLOR_THEMES["openhands-neutral"].heroui);
    expect(neo.tokens?.["--oh-color-primary"]).toBe("#ffffff");
    expect(neo.tokens?.["--oh-accent"]).toBe("#ffffff");
  });

  it("exposes Neo in the settings theme picker", () => {
    expect(AVAILABLE_COLOR_THEMES.map((theme) => theme.key)).toContain(
      "openhands-neo",
    );
    expect(
      AVAILABLE_COLOR_THEMES.find((theme) => theme.key === "openhands-neo")
        ?.label,
    ).toBe("OpenHands Neo");
  });


  it("exposes the new themes in the settings theme picker", () => {
    expect(AVAILABLE_COLOR_THEMES).toEqual(
      expect.arrayContaining(
        NEW_THEMES.map(({ key, label }) =>
          expect.objectContaining({ key, label }),
        ),
      ),
    );
  });

  it.each(NEW_THEMES)(
    "defines and applies the $label palette",
    ({ key, background, primary }) => {
      document.body.setAttribute("data-agent-server-ui", "");

      applyColorTheme(key);

      const theme = COLOR_THEMES[key];
      const styleEl = document.getElementById("oh-color-theme-override");
      expect(theme.scale["--cool-grey-950"]).toBe(background);
      expect(theme.tokens?.["--oh-color-primary"]).toBe(primary);
      expect(styleEl?.textContent).toContain(`--cool-grey-950: ${background};`);
      expect(document.body.style.getPropertyValue("--oh-color-primary")).toBe(
        primary,
      );

      applyColorTheme("openhands-neutral");
      document.body.removeAttribute("data-agent-server-ui");
    },
  );

  it("injects white primary tokens when applying OpenHands-Neo", () => {
    document.body.setAttribute("data-agent-server-ui", "");

    applyColorTheme("openhands-neo");

    const styleEl = document.getElementById("oh-color-theme-override");
    expect(styleEl?.textContent).toContain("--oh-color-primary: #ffffff;");
    expect(styleEl?.textContent).toContain("--oh-accent: #ffffff;");

    styleEl?.remove();
    document.body.removeAttribute("data-agent-server-ui");
    document.body.style.removeProperty("--oh-color-primary");
    document.body.style.removeProperty("--oh-accent");
    document.body.style.removeProperty("--oh-warning");
  });

  it("injects override rules with order-independent doubled scope selectors", () => {
    // Act
    applyColorTheme("openhands-neutral");

    // Assert: doubled selectors (0,2,0) out-specify the base sheet's unlayered
    // [data-agent-server-ui] variable rules (0,1,0), so the override wins even
    // when React 19 re-inserts the base stylesheet <link> after this tag.
    const styleEl = document.getElementById("oh-color-theme-override");
    expect(styleEl?.textContent).toContain(
      "[data-agent-server-ui][data-agent-server-ui] {",
    );
    expect(styleEl?.textContent).toContain(
      "[data-theme=dark][data-theme=dark] {",
    );

    styleEl?.remove();
  });

  it("re-appends the override style tag to the end of <head> on every apply", () => {
    // Arrange: first apply creates the tag, then a later stylesheet lands
    // after it (as React 19 does with the base CSS <link> in the built SPA).
    applyColorTheme("openhands-neutral");
    const laterSheet = document.createElement("style");
    document.head.appendChild(laterSheet);

    // Act
    applyColorTheme("openhands-deepsea");

    // Assert
    expect(document.head.lastElementChild?.id).toBe("oh-color-theme-override");

    laterSheet.remove();
    document.getElementById("oh-color-theme-override")?.remove();
  });

  it("applies Neo button tokens on the scoped UI root used by primary buttons", () => {
    render(
      <AgentServerUIRoot>
        <button type="button" data-testid="primary-button">
          Save
        </button>
      </AgentServerUIRoot>,
    );

    applyColorTheme("openhands-neo");

    const scopeRoot = screen
      .getByTestId("primary-button")
      .closest("[data-agent-server-ui]") as HTMLElement;

    expect(scopeRoot.style.getPropertyValue("--oh-color-primary")).toBe(
      "#ffffff",
    );

    applyColorTheme("openhands-neutral");

    expect(scopeRoot.style.getPropertyValue("--oh-color-primary")).toBe("");
  });
});
