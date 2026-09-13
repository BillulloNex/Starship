/* eslint-disable i18next/no-literal-string */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CaseSensitive, ChevronRight, Regex, WholeWord } from "lucide-react";
import { useWorkspaceRuntime } from "#/context/workspace-runtime-context";
import {
  searchWorkspace,
  type WorkspaceSearchMatch,
  type WorkspaceSearchOptions,
} from "#/api/runtime-service/workspace-search.service";
import { useFilesTabStore } from "#/stores/files-tab-store";
import { useWorkbenchStore } from "#/stores/workbench-store";
import { useWorkspaceMutationCounter } from "#/stores/use-workspace-mutation-counter";
import { FileTypeIcon } from "#/components/features/files-tab/file-type-icon";
import { cn } from "#/utils/utils";

const DEBOUNCE_MS = 300;
const PREVIEW_LEAD = 24;

function useDebounced<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

function useWorkspaceSearch(options: WorkspaceSearchOptions) {
  const {
    conversationId,
    conversationUrl,
    sessionApiKey,
    workingDir,
    isReady,
  } = useWorkspaceRuntime();
  // Re-run after the agent edits files so results don't go stale.
  const mutationCount = useWorkspaceMutationCounter((s) => s.count);

  return useQuery({
    queryKey: [
      "workspace-search",
      conversationId,
      conversationUrl,
      sessionApiKey,
      workingDir,
      options,
      mutationCount,
    ],
    queryFn: () =>
      searchWorkspace(conversationUrl, sessionApiKey, workingDir, options),
    enabled: isReady && options.query.trim().length > 0,
    placeholderData: keepPreviousData,
    retry: false,
    meta: { disableToast: true },
  });
}

function MatchPreview({ match }: { match: WorkspaceSearchMatch }) {
  const start = Math.max(0, match.column - 1 - PREVIEW_LEAD);
  const matchStart = match.column - 1;
  const matchEnd = matchStart + match.length;
  const lead = match.text.slice(start, matchStart).trimStart();
  return (
    <span className="truncate font-mono text-[11px]">
      {start > 0 && "…"}
      {lead}
      <span className="rounded-sm bg-amber-400/25 text-amber-100">
        {match.text.slice(matchStart, matchEnd)}
      </span>
      {match.text.slice(matchEnd)}
    </span>
  );
}

function ToggleButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "rounded p-0.5",
        active
          ? "bg-[#528bff]/30 text-white"
          : "text-[var(--oh-muted)] hover:text-white",
      )}
    >
      {children}
    </button>
  );
}

export function SearchPanel() {
  const { workspaceKey } = useWorkspaceRuntime();
  const focusRequest = useWorkbenchStore((s) => s.searchFocusRequest);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [isRegex, setIsRegex] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusRequest]);

  const options = useMemo<WorkspaceSearchOptions>(
    () => ({ query, matchCase, wholeWord, isRegex }),
    [query, matchCase, wholeWord, isRegex],
  );
  const debouncedOptions = useDebounced(options, DEBOUNCE_MS);
  const search = useWorkspaceSearch(debouncedOptions);
  const hasQuery = debouncedOptions.query.trim().length > 0;
  const result = hasQuery ? search.data : undefined;

  const groups = useMemo(() => {
    const byPath = new Map<string, WorkspaceSearchMatch[]>();
    result?.matches.forEach((match) => {
      const list = byPath.get(match.path) ?? [];
      list.push(match);
      byPath.set(match.path, list);
    });
    return [...byPath.entries()];
  }, [result]);

  const openMatch = (match: WorkspaceSearchMatch) => {
    useFilesTabStore.getState().setSelectedPath(match.path, workspaceKey);
    useWorkbenchStore.getState().setPendingReveal({
      path: match.path,
      line: match.line,
      column: match.column,
      length: match.length,
    });
  };

  let status = "";
  if (hasQuery && search.isError) status = "Search failed";
  else if (hasQuery && !result && search.isFetching) status = "Searching…";
  else if (result && result.matches.length === 0) status = "No results found";
  else if (result) {
    status = `${result.matches.length}${result.truncated ? "+" : ""} results in ${groups.length} files`;
  }

  return (
    <div
      className="flex h-full w-full flex-col bg-[var(--oh-surface)]"
      data-testid="ide-search-panel"
    >
      <div className="shrink-0 space-y-1.5 border-b border-[var(--oh-border-subtle)] p-2">
        <div className="flex items-center gap-1 rounded border border-[var(--oh-border)] bg-[var(--oh-surface-raised)] px-2 focus-within:border-[#528bff]">
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            aria-label="Search in files"
            data-testid="ide-search-input"
            className="min-w-0 flex-1 bg-transparent py-1 text-xs text-white placeholder-[var(--oh-muted)] focus:outline-none"
          />
          <ToggleButton
            label="Match Case"
            active={matchCase}
            onClick={() => setMatchCase((v) => !v)}
          >
            <CaseSensitive className="h-3.5 w-3.5" />
          </ToggleButton>
          <ToggleButton
            label="Match Whole Word"
            active={wholeWord}
            onClick={() => setWholeWord((v) => !v)}
          >
            <WholeWord className="h-3.5 w-3.5" />
          </ToggleButton>
          <ToggleButton
            label="Use Regular Expression"
            active={isRegex}
            onClick={() => setIsRegex((v) => !v)}
          >
            <Regex className="h-3.5 w-3.5" />
          </ToggleButton>
        </div>
        {status && (
          <div
            className="px-0.5 text-[11px] text-[var(--oh-muted)]"
            data-testid="ide-search-status"
          >
            {status}
          </div>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto py-1 custom-scrollbar-always">
        {groups.map(([path, matches]) => {
          const isCollapsed = !!collapsed[path];
          const name = path.split("/").pop() ?? path;
          const dir = path.slice(0, path.lastIndexOf("/"));
          return (
            <li key={path}>
              <button
                type="button"
                onClick={() =>
                  setCollapsed((prev) => ({ ...prev, [path]: !isCollapsed }))
                }
                className="flex w-full items-center gap-1 px-1.5 py-0.5 text-left text-xs text-white hover:bg-[var(--oh-interactive-hover)]"
              >
                <ChevronRight
                  className={cn(
                    "h-3 w-3 shrink-0 transition-transform",
                    !isCollapsed && "rotate-90",
                  )}
                />
                <FileTypeIcon path={path} className="h-3.5 w-3.5 shrink-0" />
                <span className="shrink-0">{name}</span>
                <span className="min-w-0 truncate text-[11px] text-[var(--oh-muted)]">
                  {dir}
                </span>
                <span className="ml-auto shrink-0 rounded-full bg-white/10 px-1.5 text-[10px]">
                  {matches.length}
                </span>
              </button>
              {!isCollapsed && (
                <ul>
                  {matches.map((match) => (
                    <li key={`${match.line}:${match.column}`}>
                      <button
                        type="button"
                        onClick={() => openMatch(match)}
                        data-testid={`ide-search-match-${path}:${match.line}`}
                        className="flex w-full items-center gap-2 py-0.5 pl-9 pr-2 text-left text-[var(--oh-text-tertiary)] hover:bg-[var(--oh-interactive-hover)] hover:text-white"
                      >
                        <MatchPreview match={match} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
