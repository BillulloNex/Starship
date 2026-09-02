/* eslint-disable i18next/no-literal-string */
import React from "react";
import { ChevronRight, Folder } from "lucide-react";
import { FileTypeIcon } from "./file-type-icon";

interface EditorBreadcrumbsProps {
  path: string | null;
  onSelectPath?: (path: string) => void;
}

export function EditorBreadcrumbs({
  path,
  onSelectPath,
}: EditorBreadcrumbsProps) {
  if (!path) return null;

  const segments = path.split("/").filter(Boolean);

  return (
    <nav
      aria-label="Breadcrumb"
      data-testid="editor-breadcrumbs"
      className="flex items-center gap-1 px-4 py-1 bg-[var(--oh-surface)] border-b border-[var(--oh-border-subtle)] text-[11px] text-[var(--oh-muted)] overflow-x-auto custom-scrollbar-always select-none shrink-0"
    >
      <span className="flex items-center gap-1 text-[var(--oh-muted)]/70 hover:text-[var(--oh-muted)]">
        <Folder className="w-3 h-3 text-amber-400/80" />
        <span>workspace</span>
      </span>

      {segments.map((seg, idx) => {
        const isLast = idx === segments.length - 1;
        const subPath = segments.slice(0, idx + 1).join("/");

        return (
          <React.Fragment key={subPath}>
            <ChevronRight className="w-3 h-3 shrink-0 text-[var(--oh-muted)]/50" />
            <div
              className={`flex items-center gap-1 shrink-0 ${
                isLast
                  ? "text-white font-medium"
                  : "text-[var(--oh-muted)] hover:text-white cursor-pointer"
              }`}
              onClick={() => {
                if (!isLast && onSelectPath) {
                  onSelectPath(subPath);
                }
              }}
            >
              {isLast && (
                <FileTypeIcon path={path} className="w-3 h-3 shrink-0" />
              )}
              <span className="truncate max-w-[150px]">{seg}</span>
            </div>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
