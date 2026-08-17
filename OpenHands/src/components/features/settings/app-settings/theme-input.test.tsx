import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, beforeEach, vi } from "vitest";
import { ThemeInput } from "./theme-input";

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe("ThemeInput component", () => {
  beforeEach(() => {
    localStorage.clear();
    const existing = document.getElementById("oh-color-theme-override");
    if (existing) existing.remove();
  });

  it("renders the theme customizer with presets and color pickers", () => {
    render(<ThemeInput />);

    expect(screen.getByTestId("theme-customizer")).toBeInTheDocument();
    expect(screen.getByTestId("color-theme-preset-input")).toBeInTheDocument();
    expect(
      screen.getByTestId("color-theme-background-picker"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("color-theme-foreground-picker"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("color-theme-accent-picker")).toBeInTheDocument();
  });

  it("updates theme when a color hex is changed", () => {
    render(<ThemeInput />);

    const bgInput = screen.getByLabelText(/background hex code/i);
    fireEvent.change(bgInput, { target: { value: "112233" } });

    const styleEl = document.getElementById("oh-color-theme-override");
    expect(styleEl?.textContent).toContain("--cool-grey-950: #112233;");
  });
});
