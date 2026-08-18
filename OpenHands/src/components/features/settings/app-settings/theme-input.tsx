import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import {
  AVAILABLE_COLOR_THEMES,
  type ColorThemeKey,
  type ThemeMeta,
  applyColorTheme,
  persistColorTheme,
  readPersistedColorTheme,
} from "#/themes/color-themes";

function ThemeCard({
  theme,
  isSelected,
  onSelect,
}: {
  theme: ThemeMeta;
  isSelected: boolean;
  onSelect: (key: ColorThemeKey) => void;
}) {
  const { key, label, description, colors } = theme;

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      tabIndex={0}
      data-testid={`theme-card-${key}`}
      onClick={() => onSelect(key)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(key);
        }
      }}
      className={`group relative flex flex-col justify-between text-left p-3.5 rounded-xl border transition-all duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[var(--oh-color-primary)] ${
        isSelected
          ? "border-[var(--oh-color-primary)] ring-2 ring-[var(--oh-color-primary)]/30 shadow-md"
          : "border-[var(--oh-border)] hover:border-[var(--oh-border-strong)] hover:shadow-sm"
      }`}
      style={{
        backgroundColor: colors.surface,
      }}
    >
      {/* Header: Label + Selected Radio Checkmark */}
      <div className="flex items-start justify-between gap-2 w-full mb-2">
        <div className="flex flex-col min-w-0">
          <span
            className="text-xs font-semibold tracking-wide truncate"
            style={{ color: colors.foreground }}
          >
            {label}
          </span>
          <span
            className="text-[11px] leading-tight line-clamp-1 mt-0.5"
            style={{ color: colors.muted }}
            title={description}
          >
            {description}
          </span>
        </div>

        {/* Selected Indicator */}
        <div
          className={`size-4 rounded-full flex items-center justify-center shrink-0 border transition-colors ${
            isSelected
              ? "border-transparent"
              : "border-white/20 bg-black/20"
          }`}
          style={{
            backgroundColor: isSelected ? colors.accent : undefined,
          }}
        >
          {isSelected && (
            <svg
              className="size-2.5 text-black"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth="3.5"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M4.5 12.75l6 6 9-13.5"
              />
            </svg>
          )}
        </div>
      </div>

      {/* Mini Visual UI Mock Preview */}
      <div
        className="w-full h-12 rounded-lg p-1.5 flex flex-col justify-between border"
        style={{
          backgroundColor: colors.background,
          borderColor: colors.border,
        }}
      >
        <div className="flex items-center gap-1.5">
          <div
            className="size-2 rounded-full"
            style={{ backgroundColor: colors.accent }}
          />
          <div
            className="h-1.5 w-12 rounded-full"
            style={{ backgroundColor: colors.foreground, opacity: 0.8 }}
          />
          <div
            className="h-1.5 w-6 rounded-full ml-auto"
            style={{ backgroundColor: colors.muted, opacity: 0.5 }}
          />
        </div>

        <div className="flex items-center gap-1">
          <div
            className="h-3.5 px-1.5 rounded flex items-center justify-center text-[8px] font-bold"
            style={{
              backgroundColor: colors.accent,
              color: "#000000",
            }}
          >
            Action
          </div>
          <div
            className="h-3.5 flex-1 rounded border"
            style={{
              borderColor: colors.border,
              backgroundColor: colors.surface,
            }}
          />
        </div>
      </div>

      {/* Palette Swatch Bar */}
      <div className="flex items-center gap-1.5 mt-2.5 pt-2 border-t border-white/5 w-full">
        <div
          className="size-3 rounded-full border border-white/20 shadow-xs"
          style={{ backgroundColor: colors.background }}
          title={`Canvas BG: ${colors.background}`}
        />
        <div
          className="size-3 rounded-full border border-white/20 shadow-xs"
          style={{ backgroundColor: colors.surface }}
          title={`Surface: ${colors.surface}`}
        />
        <div
          className="size-3 rounded-full border border-white/20 shadow-xs"
          style={{ backgroundColor: colors.foreground }}
          title={`Text: ${colors.foreground}`}
        />
        <div
          className="size-3 rounded-full border border-white/20 shadow-xs ml-auto"
          style={{ backgroundColor: colors.accent }}
          title={`Accent: ${colors.accent}`}
        />
      </div>
    </button>
  );
}

export function ThemeInput() {
  const { t } = useTranslation("openhands");

  const [selectedThemeKey, setSelectedThemeKey] = React.useState<ColorThemeKey>(
    () => readPersistedColorTheme(),
  );

  const handleSelectTheme = React.useCallback((nextKey: ColorThemeKey) => {
    setSelectedThemeKey(nextKey);
    persistColorTheme(nextKey);
    applyColorTheme(nextKey);
  }, []);

  return (
    <div
      className="flex flex-col gap-3 w-full min-w-0"
      data-testid="theme-customizer"
    >
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-[var(--oh-foreground)]">
          {t(I18nKey.SETTINGS$COLOR_THEME) || "Color Theme"}
        </span>
        <span className="text-xs text-[var(--oh-muted)]">
          Choose from curated WCAG AAA Golden-Standard themes optimized for readability and developer workflows.
        </span>
      </div>

      {/* Responsive Grid of Theme Cards */}
      <div
        role="radiogroup"
        aria-label="Color themes"
        data-testid="theme-cards-grid"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 w-full"
      >
        {AVAILABLE_COLOR_THEMES.map((theme) => (
          <ThemeCard
            key={theme.key}
            theme={theme}
            isSelected={selectedThemeKey === theme.key}
            onSelect={handleSelectTheme}
          />
        ))}
      </div>
    </div>
  );
}
