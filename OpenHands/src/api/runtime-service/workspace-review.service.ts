import AgentServerRuntimeService from "./agent-server-runtime-service";
import { WorkspaceFileOperationsService } from "./workspace-file-operations.service";

/**
 * Change review backed by git: a change is "unreviewed" while it only lives
 * in the working tree, and accepting it stages it. Rejecting restores what
 * is staged (or HEAD). Because the state lives in the repository, it's the
 * same on every device and for every agent — including ones that edit files
 * through the shell.
 */

export type ReviewChangeKind = "modified" | "added" | "deleted";

export interface ReviewChange {
  /** Path relative to the workspace directory. */
  path: string;
  kind: ReviewChangeKind;
}

export type ReviewChangesResult =
  | { isRepository: false; changes: [] }
  | { isRepository: true; changes: ReviewChange[] };

type RuntimeTarget = {
  conversationUrl: string | null | undefined;
  sessionApiKey: string | null | undefined;
  workingDir: string | undefined;
};

const NOT_A_REPOSITORY = "__GROKBOT_NOT_A_REPOSITORY__";
const PREFIX_MARKER = "__GROKBOT_PREFIX__:";

function toBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

/** Shell snippet that decodes a base64 value into variable `name`. */
function decodeInto(name: string, value: string): string {
  return `${name}=$(printf %s '${toBase64(value)}' | base64 -d)`;
}

async function run(target: RuntimeTarget, command: string, timeout = 30) {
  return AgentServerRuntimeService.executeCommand(
    target.conversationUrl,
    target.sessionApiKey,
    command,
    target.workingDir,
    timeout,
  );
}

export function buildListCommand(): string {
  return [
    `git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { printf '${NOT_A_REPOSITORY}'; exit 0; };`,
    `printf '${PREFIX_MARKER}%s\\0' "$(git rev-parse --show-prefix)";`,
    "git status --porcelain=v1 -z --untracked-files=all -- .",
  ].join(" ");
}

export function parseListOutput(stdout: string): ReviewChangesResult {
  if (stdout.startsWith(NOT_A_REPOSITORY)) {
    return { isRepository: false, changes: [] };
  }

  const tokens = stdout.split("\0");
  const prefixToken = tokens.find((token) => token.startsWith(PREFIX_MARKER));
  const prefix = prefixToken ? prefixToken.slice(PREFIX_MARKER.length) : "";
  const entries = tokens.slice(
    prefixToken ? tokens.indexOf(prefixToken) + 1 : 0,
  );

  const changes: ReviewChange[] = [];
  for (let i = 0; i < entries.length; i += 1) {
    const entry = entries[i];
    if (entry.length >= 4) {
      const x = entry[0];
      const y = entry[1];
      const repoPath = entry.slice(3);
      // Renames and copies carry the original path as the next token.
      if (x === "R" || x === "C") i += 1;

      const unstaged = (x === "?" && y === "?") || (y !== " " && x !== "!");
      if (unstaged && repoPath.startsWith(prefix)) {
        let kind: ReviewChangeKind = "modified";
        if (x === "?") kind = "added";
        else if (y === "D") kind = "deleted";
        changes.push({ path: repoPath.slice(prefix.length), kind });
      }
    }
  }

  changes.sort((a, b) => a.path.localeCompare(b.path));
  return { isRepository: true, changes };
}

export async function listReviewChanges(
  target: RuntimeTarget,
): Promise<ReviewChangesResult> {
  const result = await run(target, buildListCommand());
  if (result.exit_code !== 0) {
    throw new Error(result.stderr?.trim() || "Couldn't read git status");
  }
  return parseListOutput(result.stdout ?? "");
}

/**
 * The reviewed version of a file: what's staged, falling back to HEAD.
 * Resolves to `null` for files git doesn't know yet.
 */
export async function readReviewedVersion(
  target: RuntimeTarget,
  path: string,
): Promise<string | null> {
  const result = await run(
    target,
    `${decodeInto("F", path)}; git cat-file -e ":./$F" 2>/dev/null || exit 3; git show ":./$F"`,
  );
  if (result.exit_code === 3) return null;
  if (result.exit_code !== 0) {
    throw new Error(result.stderr?.trim() || `Couldn't read ${path} from git`);
  }
  return result.stdout ?? "";
}

/** Accepts a whole file (or its deletion) by staging it. */
export async function acceptFile(target: RuntimeTarget, path: string) {
  const result = await run(
    target,
    `${decodeInto("F", path)}; git add -A -- "$F"`,
  );
  if (result.exit_code !== 0) {
    throw new Error(result.stderr?.trim() || `Couldn't accept ${path}`);
  }
}

/** Accepts every change under the workspace directory. */
export async function acceptAll(target: RuntimeTarget) {
  const result = await run(target, "git add -A -- .");
  if (result.exit_code !== 0) {
    throw new Error(result.stderr?.trim() || "Couldn't accept changes");
  }
}

/**
 * Records `content` as the reviewed version of `path` without touching the
 * working tree — used to accept individual changes within a file.
 */
export async function writeReviewedVersion(
  target: RuntimeTarget,
  path: string,
  content: string,
) {
  // Content goes through a temp file: it can be larger than a command line.
  const tempPath = `/tmp/grokbot-review-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2)}`;
  const saved = await WorkspaceFileOperationsService.saveFileContent(
    target.conversationUrl,
    target.sessionApiKey,
    target.workingDir,
    tempPath,
    content,
  );
  if (saved.exit_code !== 0) {
    throw new Error(
      saved.stderr?.trim() || `Couldn't accept changes in ${path}`,
    );
  }

  const command = [
    decodeInto("F", path),
    decodeInto("T", tempPath),
    'BLOB=$(git hash-object -w -- "$T"); STATUS=$?; rm -f -- "$T"; [ $STATUS -eq 0 ] || exit 1',
    `MODE=$(git ls-files -s -- "$F" | awk 'NR==1{print $1}')`,
    // --cacheinfo paths are relative to the repository root.
    'git update-index --add --cacheinfo "${MODE:-100644},$BLOB,$(git rev-parse --show-prefix)$F"',
  ].join("; ");
  const result = await run(target, command);
  if (result.exit_code !== 0) {
    throw new Error(
      result.stderr?.trim() || `Couldn't accept changes in ${path}`,
    );
  }
}

/**
 * Rejects every change to a file: restores the reviewed version, or removes
 * the file when git has never seen it.
 */
export async function rejectFile(target: RuntimeTarget, path: string) {
  const command = [
    decodeInto("F", path),
    `if git cat-file -e ":./$F" 2>/dev/null; then git checkout -- "$F"; else rm -f -- "$F"; fi`,
  ].join("; ");
  const result = await run(target, command);
  if (result.exit_code !== 0) {
    throw new Error(result.stderr?.trim() || `Couldn't reject ${path}`);
  }
}
