/* eslint-disable i18next/no-literal-string */
import React from "react";
import { getLanguageFromPath } from "#/utils/get-language-from-path";
import { useFilesTabStore } from "#/stores/files-tab-store";

interface EditorStatusBarProps {
  path: string | null;
  lineCount?: number;
}

const LANGUAGE_LABELS: Record<string, string> = {
  typescript: "TypeScript",
  javascript: "JavaScript",
  python: "Python",
  json: "JSON",
  markdown: "Markdown",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  yaml: "YAML",
  shell: "Shell Script",
  sql: "SQL",
  rust: "Rust",
  go: "Go",
  cpp: "C++",
  c: "C",
};

export function EditorStatusBar({ path, lineCount }: EditorStatusBarProps) {
  const cursorPosition = useFilesTabStore((s) => s.cursorPosition);

  if (!path) return null;

  const rawLang = getLanguageFromPath(path);
  const langLabel =
    LANGUAGE_LABELS[rawLang] || rawLang.toUpperCase() || "Plain Text";

  const isPython = path.endsWith(".py");
  const indentLabel = isPython ? "Spaces: 4" : "Spaces: 2";

  return (
    <footer
      data-testid="editor-status-bar"
      className="flex items-center justify-between px-3 py-1 bg-[var(--oh-surface)] border-t border-[var(--oh-border-subtle)] text-[11px] text-[var(--oh-muted)] select-none shrink-0"
    >
      <div className="flex items-center gap-4">
        {cursorPosition ? (
          <span>
            Ln {cursorPosition.line}, Col {cursorPosition.column}
          </span>
        ) : lineCount !== undefined ? (
          <span>{lineCount} lines</span>
        ) : (
          <span>Ln 1, Col 1</span>
        )}
        <span>{indentLabel}</span>
        <span>UTF-8</span>
        <span>LF</span>
      </div>

      <div className="flex items-center gap-3">
        <span className="font-mono text-[var(--oh-muted)]/80 hover:text-white transition-colors">
          {langLabel}
        </span>
      </div>
    </footer>
  );
}
