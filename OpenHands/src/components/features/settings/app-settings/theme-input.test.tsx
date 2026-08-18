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

  it("renders the theme customizer with the theme cards grid", () => {
    render(<ThemeInput />);

    expect(screen.getByTestId("theme-customizer")).toBeInTheDocument();
    expect(screen.getByTestId("theme-cards-grid")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-openhands-neutral")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-tokyo-night")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-vesper")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-gruvbox-dark")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-rose-pine")).toBeInTheDocument();
    expect(screen.getByTestId("theme-card-github-dark")).toBeInTheDocument();
  });

  it("updates theme when a theme card is clicked", () => {
    render(<ThemeInput />);

    const tokyoCard = screen.getByTestId("theme-card-tokyo-night");
    fireEvent.click(tokyoCard);

    const styleEl = document.getElementById("oh-color-theme-override");
    expect(styleEl?.textContent).toContain("--cool-grey-950: #1A1B26;");
    expect(styleEl?.textContent).toContain("--oh-color-primary: #7AA2F7;");
    expect(localStorage.getItem("openhands-color-theme")).toBe("tokyo-night");
  });
});
