/* eslint-disable i18next/no-literal-string */
/* eslint-disable jsx-a11y/no-noninteractive-element-interactions */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, X } from "lucide-react";
import { FileTypeIcon } from "./file-type-icon";
import { cn } from "#/utils/utils";

interface QuickFileSearchModalProps {
  isOpen: boolean;
  paths: string[];
  onClose: () => void;
  onSelectFile: (path: string) => void;
}

export function QuickFileSearchModal({
  isOpen,
  paths,
  onClose,
  onSelectFile,
}: QuickFileSearchModalProps) {
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus on open
  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Filter only regular files (not directories ending in /)
  const regularFiles = useMemo(
    () => paths.filter((p) => !p.endsWith("/")),
    [paths],
  );

  const filteredPaths = useMemo(() => {
    if (!query.trim()) return regularFiles.slice(0, 30);

    const q = query.toLowerCase().trim();
    return regularFiles
      .filter((p) => p.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = (a.split("/").pop() || "").toLowerCase();
        const bName = (b.split("/").pop() || "").toLowerCase();
        const aStarts = aName.startsWith(q);
        const bStarts = bName.startsWith(q);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;
        return a.length - b.length;
      })
      .slice(0, 40);
  }, [regularFiles, query]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIndex((prev) =>
          prev < filteredPaths.length - 1 ? prev + 1 : prev,
        );
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : 0));
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (filteredPaths[selectedIndex]) {
          onSelectFile(filteredPaths[selectedIndex]);
          onClose();
        }
      } else if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, filteredPaths, selectedIndex, onSelectFile, onClose]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="quick-file-search-modal"
      className="fixed inset-0 z-50 flex items-start justify-center pt-20 bg-black/60 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[var(--oh-border)] bg-[var(--oh-surface)] shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--oh-border)] bg-[var(--oh-surface-raised)]">
          <Search className="w-4 h-4 text-[var(--oh-muted)] shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedIndex(0);
            }}
            placeholder="Search files by name... (↑/↓ to navigate, Enter to open)"
            className="flex-1 bg-transparent text-sm text-white placeholder-[var(--oh-muted)] focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="p-1 text-[var(--oh-muted)] hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto custom-scrollbar-always p-1">
          {filteredPaths.length === 0 ? (
            <div className="py-8 text-center text-sm text-[var(--oh-muted)]">
              No matching files found
            </div>
          ) : (
            <ul className="space-y-0.5">
              {filteredPaths.map((path, idx) => {
                const isSelected = idx === selectedIndex;
                const filename = path.split("/").pop() || path;
                const dir = path.substring(0, path.lastIndexOf("/"));

                return (
                  <li
                    key={path}
                    data-testid={`quick-file-search-item-${path}`}
                    onClick={() => {
                      onSelectFile(path);
                      onClose();
                    }}
                    onMouseEnter={() => setSelectedIndex(idx)}
                    className={cn(
                      "flex items-center justify-between px-3 py-2 rounded-md text-xs cursor-pointer select-none transition-colors",
                      isSelected
                        ? "bg-[var(--oh-interactive)] text-white"
                        : "text-[var(--oh-text-tertiary)] hover:bg-[var(--oh-surface-raised)] hover:text-white",
                    )}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <FileTypeIcon path={path} className="w-4 h-4 shrink-0" />
                      <span className="font-mono font-medium text-white truncate">
                        {filename}
                      </span>
                    </div>
                    {dir && (
                      <span
                        className={cn(
                          "ml-2 text-[11px] truncate max-w-[200px] shrink-0",
                          isSelected
                            ? "text-white/80"
                            : "text-[var(--oh-muted)]",
                        )}
                      >
                        {dir}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Footer info */}
        <div className="flex items-center justify-between px-3 py-1.5 border-t border-[var(--oh-border-subtle)] bg-[var(--oh-surface)] text-[10px] text-[var(--oh-muted)]">
          <span>{filteredPaths.length} files found</span>
          <div className="flex items-center gap-2">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-mono">
                ↑↓
              </kbd>{" "}
              Navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-mono">
                ↵
              </kbd>{" "}
              Open
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-white/5 border border-white/10 font-mono">
                ESC
              </kbd>{" "}
              Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
