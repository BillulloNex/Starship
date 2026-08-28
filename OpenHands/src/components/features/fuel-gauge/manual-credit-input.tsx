/* eslint-disable i18next/no-literal-string */
import React from "react";
import { Plus, X } from "lucide-react";
import {
  MANUAL_CREDIT_PRESETS,
  type ManualCreditEntry,
} from "#/api/unified-limits.types";
import {
  loadManualCredits,
  upsertManualCredit,
  deleteManualCredit,
} from "#/api/unified-limits-service";

interface ManualCreditInputProps {
  onUpdate: () => void;
}

export function ManualCreditInput({ onUpdate }: ManualCreditInputProps) {
  const [isAdding, setIsAdding] = React.useState(false);
  const [selectedPreset, setSelectedPreset] = React.useState(
    MANUAL_CREDIT_PRESETS[0].providerId,
  );
  const [totalCredits, setTotalCredits] = React.useState("");
  const [usedCredits, setUsedCredits] = React.useState("");
  const entries = loadManualCredits();

  const handleAdd = () => {
    const preset = MANUAL_CREDIT_PRESETS.find(
      (p) => p.providerId === selectedPreset,
    );
    if (!preset) return;

    const total = parseFloat(totalCredits) || preset.defaultCredits;
    const used = parseFloat(usedCredits) || 0;

    const entry: ManualCreditEntry = {
      providerId: preset.providerId,
      displayName: preset.displayName,
      icon: preset.icon,
      totalCredits: total,
      usedCredits: used,
      estimatedUsed: used,
      actualUsed: null,
      updatedAt: Date.now(),
    };

    upsertManualCredit(entry);
    setIsAdding(false);
    setTotalCredits("");
    setUsedCredits("");
    onUpdate();
  };

  const handleDelete = (providerId: string) => {
    deleteManualCredit(providerId);
    onUpdate();
  };

  // Filter out presets already added
  const availablePresets = MANUAL_CREDIT_PRESETS.filter(
    (p) => !entries.some((e) => e.providerId === p.providerId),
  );

  return (
    <div className="border-t border-[var(--oh-border-subtle)] pt-2 mt-1">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-medium text-[var(--oh-muted)] uppercase tracking-wider">
          Manual Credits
        </span>
      </div>

      {/* Existing entries with delete */}
      {entries.map((entry) => {
        const remaining = Math.max(
          0,
          entry.totalCredits - Math.max(entry.usedCredits, entry.estimatedUsed),
        );
        return (
          <div
            key={entry.providerId}
            className="flex items-center justify-between text-xs py-0.5 group"
          >
            <span className="text-[var(--oh-foreground)]">
              {entry.displayName}
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-[var(--oh-muted)]">
                ${remaining.toFixed(2)} / ${entry.totalCredits.toFixed(2)}
              </span>
              <button
                type="button"
                onClick={() => handleDelete(entry.providerId)}
                className="opacity-0 group-hover:opacity-100 text-[var(--oh-muted)] hover:text-red-400 transition-opacity cursor-pointer"
                aria-label={`Remove ${entry.displayName}`}
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          </div>
        );
      })}

      {/* Add form */}
      {isAdding ? (
        <div className="flex flex-col gap-1.5 mt-1.5 p-2 rounded bg-surface-base border border-[var(--oh-border)]">
          <select
            value={selectedPreset}
            onChange={(e) => {
              setSelectedPreset(e.target.value);
              const preset = MANUAL_CREDIT_PRESETS.find(
                (p) => p.providerId === e.target.value,
              );
              if (preset && preset.defaultCredits > 0) {
                setTotalCredits(String(preset.defaultCredits));
              }
            }}
            className="bg-surface-base border border-[var(--oh-border)] rounded-md px-2.5 py-1.5 text-xs text-[var(--oh-foreground)]"
          >
            {availablePresets.map((preset) => (
              <option key={preset.providerId} value={preset.providerId} className="bg-[#1e1e24] text-[var(--oh-foreground)]">
                {preset.displayName}
                {preset.defaultCredits > 0
                  ? ` ($${preset.defaultCredits} default)`
                  : ""}
              </option>
            ))}
          </select>
          <div className="flex gap-1.5">
            <input
              type="number"
              placeholder="Total $"
              value={totalCredits}
              onChange={(e) => setTotalCredits(e.target.value)}
              className="flex-1 bg-transparent border border-[var(--oh-border)] rounded px-2 py-1 text-xs text-[var(--oh-foreground)] placeholder:text-[var(--oh-muted)]"
              min="0"
              step="0.01"
            />
            <input
              type="number"
              placeholder="Used $"
              value={usedCredits}
              onChange={(e) => setUsedCredits(e.target.value)}
              className="flex-1 bg-transparent border border-[var(--oh-border)] rounded px-2 py-1 text-xs text-[var(--oh-foreground)] placeholder:text-[var(--oh-muted)]"
              min="0"
              step="0.01"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={handleAdd}
              className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white text-xs py-1 rounded cursor-pointer"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setIsAdding(false)}
              className="flex-1 border border-[var(--oh-border)] text-xs py-1 rounded text-[var(--oh-muted)] hover:text-[var(--oh-foreground)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : availablePresets.length > 0 ? (
        <button
          type="button"
          onClick={() => setIsAdding(true)}
          className="flex items-center gap-1 text-[11px] text-[var(--oh-muted)] hover:text-[var(--oh-foreground)] mt-1 cursor-pointer"
        >
          <Plus className="h-3 w-3" />
          Add manual credit limit
        </button>
      ) : null}
    </div>
  );
}
