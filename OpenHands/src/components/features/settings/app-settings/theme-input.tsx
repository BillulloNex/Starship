import React from "react";
import { useTranslation } from "react-i18next";
import { I18nKey } from "#/i18n/declaration";
import { SettingsDropdownInput } from "../settings-dropdown-input";
import { ColorPickerInput } from "./color-picker-input";
import URefreshIcon from "#/icons/u-refresh.svg?react";
import {
  AVAILABLE_COLOR_THEMES,
  type ColorThemeKey,
  type CustomThemeColors,
  applyColorTheme,
  persistColorTheme,
  readPersistedColorTheme,
  readPersistedCustomThemeColors,
  persistCustomThemeColors,
  getThemeColors,
  PRESET_DEFAULT_COLORS,
} from "#/themes/color-themes";

export function ThemeInput() {
  const { t } = useTranslation("openhands");

  const [selectedThemeKey, setSelectedThemeKey] = React.useState<ColorThemeKey>(
    () => readPersistedColorTheme(),
  );

  const [colors, setColors] = React.useState<CustomThemeColors>(() =>
    getThemeColors(readPersistedColorTheme(), readPersistedCustomThemeColors()),
  );

  const handlePresetChange = React.useCallback((key: React.Key | null) => {
    if (!key) return;
    const nextKey = key as ColorThemeKey;
    setSelectedThemeKey(nextKey);
    persistColorTheme(nextKey);

    if (nextKey === "custom") {
      const customColors = readPersistedCustomThemeColors();
      setColors(customColors);
      applyColorTheme("custom", customColors);
    } else {
      const presetColors = getThemeColors(nextKey);
      setColors(presetColors);
      applyColorTheme(nextKey);
    }
  }, []);

  const handleColorChange = React.useCallback(
    (field: keyof CustomThemeColors, hex: string) => {
      const nextColors = {
        ...colors,
        [field]: hex,
      };
      setColors(nextColors);
      setSelectedThemeKey("custom");
      persistColorTheme("custom");
      persistCustomThemeColors(nextColors);
      applyColorTheme("custom", nextColors);
    },
    [colors],
  );

  const handleReset = React.useCallback(() => {
    let resetColors: CustomThemeColors;
    if (
      selectedThemeKey !== "custom" &&
      selectedThemeKey in PRESET_DEFAULT_COLORS
    ) {
      resetColors =
        PRESET_DEFAULT_COLORS[
          selectedThemeKey as keyof typeof PRESET_DEFAULT_COLORS
        ];
    } else {
      resetColors = PRESET_DEFAULT_COLORS["openhands-neutral"];
    }

    setColors(resetColors);
    if (selectedThemeKey === "custom") {
      persistCustomThemeColors(resetColors);
      applyColorTheme("custom", resetColors);
    } else {
      applyColorTheme(selectedThemeKey);
    }
  }, [selectedThemeKey]);

  return (
    <div
      className="flex flex-col gap-2.5 w-full min-w-0"
      data-testid="theme-customizer"
    >
      <div className="rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] p-4 flex flex-col gap-3 shadow-sm">
        {/* Preset Row */}
        <div className="flex items-center justify-between gap-3 pb-3 border-b border-[var(--oh-border-subtle)]">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[var(--oh-foreground)]">
              {t(I18nKey.SETTINGS$COLOR_THEME) || "Theme Preset"}
            </span>
            <button
              type="button"
              onClick={handleReset}
              title="Reset colors to preset defaults"
              className="p-1 rounded-md text-[var(--oh-muted)] hover:text-[var(--oh-foreground)] hover:bg-[var(--oh-interactive-hover)] transition-colors focus:outline-none"
              aria-label="Reset colors"
            >
              <URefreshIcon className="size-3.5" />
            </button>
          </div>

          <div className="w-52 sm:w-60">
            <SettingsDropdownInput
              testId="color-theme-preset-input"
              name="color-theme-preset-input"
              items={AVAILABLE_COLOR_THEMES.map((theme) => ({
                key: theme.key,
                label: theme.label,
              }))}
              selectedKey={selectedThemeKey}
              onSelectionChange={handlePresetChange}
              isClearable={false}
              wrapperClassName="w-full min-w-0"
            />
          </div>
        </div>

        {/* Customizable Base Color Rows */}
        <div className="flex flex-col">
          <ColorPickerInput
            testId="color-theme-background-picker"
            label="Background"
            value={colors.background}
            onChange={(hex) => handleColorChange("background", hex)}
          />
          <ColorPickerInput
            testId="color-theme-foreground-picker"
            label="Foreground"
            value={colors.foreground}
            onChange={(hex) => handleColorChange("foreground", hex)}
          />
          <ColorPickerInput
            testId="color-theme-accent-picker"
            label="Accent"
            value={colors.accent}
            onChange={(hex) => handleColorChange("accent", hex)}
          />
        </div>
      </div>
    </div>
  );
}
