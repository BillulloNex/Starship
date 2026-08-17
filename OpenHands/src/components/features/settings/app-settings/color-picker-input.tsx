import React from "react";
import { cn } from "#/utils/utils";

interface ColorPickerInputProps {
  label: string;
  value: string;
  onChange: (hex: string) => void;
  testId?: string;
  className?: string;
}

function normalizeHex(hex: string): string {
  let cleaned = hex.trim();
  if (!cleaned.startsWith("#")) {
    cleaned = `#${cleaned}`;
  }
  if (/^#[0-9A-Fa-f]{3}$/.test(cleaned)) {
    const r = cleaned[1];
    const g = cleaned[2];
    const b = cleaned[3];
    return `#${r}${r}${g}${g}${b}${b}`.toUpperCase();
  }
  if (/^#[0-9A-Fa-f]{6}$/.test(cleaned)) {
    return cleaned.toUpperCase();
  }
  return hex;
}

export function ColorPickerInput({
  label,
  value,
  onChange,
  testId,
  className,
}: ColorPickerInputProps) {
  const [textValue, setTextValue] = React.useState(value);
  const colorInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    setTextValue(value);
  }, [value]);

  const handleColorPickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newHex = e.target.value.toUpperCase();
    setTextValue(newHex);
    onChange(newHex);
  };

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    setTextValue(raw);

    const formatted = raw.startsWith("#") ? raw : `#${raw}`;
    if (/^#[0-9A-Fa-f]{6}$/.test(formatted)) {
      onChange(formatted.toUpperCase());
    } else if (/^#[0-9A-Fa-f]{3}$/.test(formatted)) {
      onChange(normalizeHex(formatted));
    }
  };

  const handleBlur = () => {
    const normalized = normalizeHex(textValue);
    if (/^#[0-9A-Fa-f]{6}$/.test(normalized)) {
      setTextValue(normalized);
      onChange(normalized);
    } else {
      // Revert to valid prop value
      setTextValue(value);
    }
  };

  const safeHexForPicker = React.useMemo(() => {
    const norm = normalizeHex(value);
    return /^#[0-9A-Fa-f]{6}$/.test(norm) ? norm : "#000000";
  }, [value]);

  return (
    <div
      data-testid={testId}
      className={cn(
        "flex items-center justify-between py-2 border-b border-[var(--oh-border-subtle)] last:border-b-0",
        className,
      )}
    >
      <span className="text-sm font-medium text-[var(--oh-foreground)]">
        {label}
      </span>

      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] hover:border-[var(--oh-border-input)] transition-colors focus-within:border-[var(--oh-color-primary)]">
        <label
          className="relative size-5 rounded border border-white/20 shrink-0 cursor-pointer overflow-hidden shadow-sm flex items-center justify-center"
          style={{ backgroundColor: safeHexForPicker }}
          title={`Choose ${label} color`}
        >
          <input
            ref={colorInputRef}
            type="color"
            value={safeHexForPicker}
            onChange={handleColorPickerChange}
            className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
            aria-label={`${label} color picker`}
          />
        </label>

        <span className="text-xs text-[var(--oh-muted)] select-none">#</span>
        <input
          type="text"
          value={textValue.replace(/^#/, "")}
          onChange={handleTextChange}
          onBlur={handleBlur}
          className="w-16 bg-transparent text-xs font-mono font-medium text-[var(--oh-foreground)] focus:outline-none uppercase tracking-wide"
          placeholder="000000"
          maxLength={7}
          aria-label={`${label} hex code`}
        />
      </div>
    </div>
  );
}
