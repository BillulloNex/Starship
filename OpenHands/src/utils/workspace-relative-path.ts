import { DEFAULT_WORKING_DIR } from "#/api/agent-server-config";

function normalizeWorkspaceRoot(root: string): string {
  const trimmed = root.trim();
  const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  return withLeading.replace(/\/+$/, "");
}

/**
 * Convert an agent file path into a workspace-relative path for the Files
 * drawer / workspace file APIs.
 *
 * File-editor events typically carry absolute sandbox paths
 * (e.g. `/workspace/project/report.md`) while `selectedPath` and
 * `useWorkspaceFileContent` expect paths relative to the conversation
 * working directory (e.g. `report.md`).
 */
export function toWorkspaceRelativePath(
  path: string,
  workingDir?: string | null,
): string {
  const trimmedPath = path.trim();
  if (!trimmedPath) {
    return trimmedPath;
  }

  if (!trimmedPath.startsWith("/")) {
    return trimmedPath.replace(/^\.\//, "");
  }

  // 1. Explicit workingDir matching (when provided by caller)
  if (workingDir && workingDir.trim()) {
    const normalizedWorkingDir = normalizeWorkspaceRoot(workingDir);
    if (trimmedPath === normalizedWorkingDir) {
      return "";
    }
    if (trimmedPath.startsWith(`${normalizedWorkingDir}/`)) {
      return trimmedPath.slice(normalizedWorkingDir.length + 1);
    }
  }

  // 2. Dynamic conversation hex project directories (e.g. /workspace/project/<hex32>/file.ext)
  const hexProjectMatch = trimmedPath.match(
    /^(?:\/home\/openhands)?\/workspace\/project\/[a-f0-9]{32}\/(.+)$/i,
  );
  if (hexProjectMatch) {
    return hexProjectMatch[1];
  }

  // 3. General sandbox project/workspace fallback roots
  const roots = [
    DEFAULT_WORKING_DIR,
    `/${DEFAULT_WORKING_DIR}`,
    `/home/openhands/${DEFAULT_WORKING_DIR}`,
  ].filter((value): value is string => Boolean(value?.trim()));

  for (const root of roots) {
    const normalizedRoot = normalizeWorkspaceRoot(root);
    if (trimmedPath === normalizedRoot) {
      return "";
    }
    if (trimmedPath.startsWith(`${normalizedRoot}/`)) {
      return trimmedPath.slice(normalizedRoot.length + 1);
    }
  }

  const sandboxWorkspaceMatch = trimmedPath.match(
    /^(?:\/home\/openhands)?\/workspace\/(.+)$/,
  );
  if (sandboxWorkspaceMatch) {
    return sandboxWorkspaceMatch[1];
  }

  return trimmedPath.replace(/^\/+/, "");
}
