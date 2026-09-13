import AgentServerRuntimeService from "./agent-server-runtime-service";

export interface WorkspaceSearchOptions {
  query: string;
  isRegex: boolean;
  matchCase: boolean;
  wholeWord: boolean;
}

export interface WorkspaceSearchMatch {
  path: string;
  /** 1-based line number. */
  line: number;
  /** 1-based column of the first match on the line. */
  column: number;
  /** Length of that match, 0 when it couldn't be located in the preview. */
  length: number;
  text: string;
}

export interface WorkspaceSearchResult {
  matches: WorkspaceSearchMatch[];
  /** True when output was cut off at the result limit. */
  truncated: boolean;
}

export const SEARCH_RESULT_LIMIT = 2000;
const MATCHES_PER_FILE = 200;
const PREVIEW_COLUMNS = 400;

// Mirrors the directories the file tree skips.
const EXCLUDED_DIRS = [
  ".git",
  "node_modules",
  ".venv",
  "venv",
  "__pycache__",
  "dist",
  "build",
  ".next",
  ".cache",
  ".turbo",
  "target",
];

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * Builds a shell command that searches file contents with ripgrep when it's
 * installed and falls back to grep. The query travels base64-encoded so no
 * user input is ever interpreted by the shell. Every output line has the
 * form `path\0line:text`.
 */
export function buildSearchCommand(options: WorkspaceSearchOptions): string {
  const rgFlags = [
    "--null",
    "--line-number",
    "--no-heading",
    "--color=never",
    `--max-columns=${PREVIEW_COLUMNS}`,
    "--max-columns-preview",
    `--max-count=${MATCHES_PER_FILE}`,
    "--hidden",
    ...EXCLUDED_DIRS.map((dir) => `-g '!${dir}'`),
    options.matchCase ? "-s" : "-i",
    options.isRegex ? "" : "-F",
    options.wholeWord ? "-w" : "",
  ].filter(Boolean);

  const grepFlags = [
    "-rnI",
    "--null",
    `-m ${MATCHES_PER_FILE}`,
    ...EXCLUDED_DIRS.map((dir) => `--exclude-dir='${dir}'`),
    options.matchCase ? "" : "-i",
    options.isRegex ? "-E" : "-F",
    options.wholeWord ? "-w" : "",
  ].filter(Boolean);

  const encoded = toBase64(options.query);
  return [
    `Q=$(printf %s '${encoded}' | base64 -d);`,
    `if command -v rg >/dev/null 2>&1; then rg ${rgFlags.join(" ")} -e "$Q" .;`,
    `else grep ${grepFlags.join(" ")} -e "$Q" .; fi 2>/dev/null`,
    `| head -n ${SEARCH_RESULT_LIMIT + 1}`,
  ].join(" ");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildMatcher(options: WorkspaceSearchOptions): RegExp | null {
  const source = options.isRegex ? options.query : escapeRegExp(options.query);
  const bounded = options.wholeWord ? `\\b(?:${source})\\b` : source;
  try {
    return new RegExp(bounded, options.matchCase ? "" : "i");
  } catch {
    return null;
  }
}

export function parseSearchOutput(
  stdout: string,
  options: WorkspaceSearchOptions,
): WorkspaceSearchResult {
  const matcher = buildMatcher(options);
  const lines = stdout.split("\n").filter((line) => line.includes("\0"));
  const truncated = lines.length > SEARCH_RESULT_LIMIT;

  const matches = lines.slice(0, SEARCH_RESULT_LIMIT).flatMap((line) => {
    const separator = line.indexOf("\0");
    const rawPath = line.slice(0, separator);
    const rest = /^(\d+):(.*)$/s.exec(line.slice(separator + 1));
    if (!rest) return [];
    const text = rest[2].replace(/\r$/, "");
    const found = matcher?.exec(text);
    return [
      {
        path: rawPath.replace(/^\.\//, ""),
        line: Number(rest[1]),
        column: found ? found.index + 1 : 1,
        length: found ? found[0].length : 0,
        text,
      },
    ];
  });

  return { matches, truncated };
}

export async function searchWorkspace(
  conversationUrl: string | null | undefined,
  sessionApiKey: string | null | undefined,
  workingDir: string | undefined,
  options: WorkspaceSearchOptions,
): Promise<WorkspaceSearchResult> {
  const result = await AgentServerRuntimeService.executeCommand(
    conversationUrl,
    sessionApiKey,
    buildSearchCommand(options),
    workingDir,
    30,
  );
  return parseSearchOutput(result.stdout, options);
}
