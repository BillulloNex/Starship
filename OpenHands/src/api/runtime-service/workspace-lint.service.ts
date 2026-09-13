import AgentServerRuntimeService from "./agent-server-runtime-service";

/**
 * Lints one file with the project's own tooling — ESLint for JS/TS, Ruff for
 * Python — when the project has it installed. Nothing runs, and nothing is
 * installed, otherwise. Results become editor squiggles.
 */

export type LintSeverity = "error" | "warning";

export interface LintProblem {
  source: "eslint" | "ruff";
  severity: LintSeverity;
  message: string;
  code: string | null;
  line: number;
  column: number;
  endLine: number;
  endColumn: number;
}

type RuntimeTarget = {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string | undefined;
};

const ESLINT_EXTENSIONS = /\.(c|m)?(j|t)sx?$/i;
const PYTHON_EXTENSIONS = /\.py$/i;
const RESULT_MARKER = "__GROKBOT_LINT__:";

export function lintToolFor(path: string): LintProblem["source"] | null {
  if (ESLINT_EXTENSIONS.test(path)) return "eslint";
  if (PYTHON_EXTENSIONS.test(path)) return "ruff";
  return null;
}

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/**
 * ESLint runs from the nearest directory above the file that has it in
 * node_modules, so monorepo packages use their own config. Ruff runs if
 * it's on PATH.
 */
export function buildLintCommand(path: string): string | null {
  const tool = lintToolFor(path);
  if (!tool) return null;
  const decode = `F=$(printf %s '${toBase64(path)}' | base64 -d); A="$(pwd)/$F"`;
  if (tool === "eslint") {
    return [
      decode,
      'D=$(dirname "$A")',
      'while [ "$D" != "/" ] && [ ! -x "$D/node_modules/.bin/eslint" ]; do D=$(dirname "$D"); done',
      '[ -x "$D/node_modules/.bin/eslint" ] || exit 0',
      `printf '${RESULT_MARKER}'`,
      'cd "$D" && ./node_modules/.bin/eslint --format json "$A" 2>/dev/null; exit 0',
    ].join("; ");
  }
  return [
    decode,
    "command -v ruff >/dev/null 2>&1 || exit 0",
    `printf '${RESULT_MARKER}'`,
    'ruff check --output-format json --exit-zero -- "$A" 2>/dev/null; exit 0',
  ].join("; ");
}

interface EslintMessage {
  ruleId: string | null;
  severity: number;
  message: string;
  line?: number;
  column?: number;
  endLine?: number;
  endColumn?: number;
}

interface RuffDiagnostic {
  code: string | null;
  message: string;
  location?: { row: number; column: number };
  end_location?: { row: number; column: number };
}

/**
 * Parses tool output. Returns `null` when the tool isn't available for the
 * file, so callers can leave existing markers alone.
 */
export function parseLintOutput(
  tool: LintProblem["source"],
  stdout: string,
): LintProblem[] | null {
  const markerAt = stdout.indexOf(RESULT_MARKER);
  if (markerAt === -1) return null;
  const json = stdout.slice(markerAt + RESULT_MARKER.length).trim();
  if (!json) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    return [];
  }

  if (tool === "eslint") {
    const files = Array.isArray(parsed)
      ? (parsed as { messages?: EslintMessage[] }[])
      : [];
    return files
      .flatMap((file) => file.messages ?? [])
      .filter((message) => message.line !== undefined && message.ruleId)
      .map((message) => ({
        source: "eslint" as const,
        severity: message.severity >= 2 ? "error" : "warning",
        message: message.message,
        code: message.ruleId,
        line: message.line!,
        column: message.column ?? 1,
        endLine: message.endLine ?? message.line!,
        endColumn: message.endColumn ?? (message.column ?? 1) + 1,
      }));
  }

  const diagnostics = Array.isArray(parsed) ? (parsed as RuffDiagnostic[]) : [];
  return diagnostics
    .filter((diagnostic) => diagnostic.location)
    .map((diagnostic) => ({
      source: "ruff" as const,
      // Ruff's syntax errors have no code; everything else is a lint.
      severity: diagnostic.code ? "warning" : "error",
      message: diagnostic.message,
      code: diagnostic.code,
      line: diagnostic.location!.row,
      column: diagnostic.location!.column,
      endLine: diagnostic.end_location?.row ?? diagnostic.location!.row,
      endColumn:
        diagnostic.end_location?.column ?? diagnostic.location!.column + 1,
    }));
}

export async function lintWorkspaceFile(
  target: RuntimeTarget,
  path: string,
): Promise<LintProblem[] | null> {
  const tool = lintToolFor(path);
  const command = buildLintCommand(path);
  if (!tool || !command) return null;
  const result = await AgentServerRuntimeService.executeCommand(
    target.conversationUrl,
    target.sessionApiKey,
    command,
    target.workingDir,
    60,
  );
  return parseLintOutput(tool, result.stdout ?? "");
}
