import { joinWorkspaceUrl } from "#/hooks/query/use-workspace-session";

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

export interface WorkspaceImageSrcOptions {
  /**
   * The conversation's workspace fileserver prefix (always `/`-terminated),
   * from `useWorkspaceSession`. `null` until the session cookie is minted,
   * in which case the src is returned untouched.
   */
  baseUrl: string | null | undefined;
  /** Absolute sandbox path of the workspace root, when known. */
  workingDir?: string | null;
}

/**
 * Rewrite a workspace-relative markdown image source to the conversation's
 * static workspace fileserver, so `![shot](shots/page.png)` in an agent reply
 * renders the file the agent just wrote instead of 404ing against the GUI
 * origin.
 *
 * - Absolute URLs (any scheme, including `data:`), protocol-relative URLs
 *   and fragments pass through unchanged.
 * - A path relative to the workspace (`shots/page.png`, `./page.png`) is
 *   joined onto `baseUrl`.
 * - An absolute sandbox path is accepted only when it sits under
 *   `workingDir`; anything else is left alone rather than guessed at.
 * - Paths that climb out of the workspace (`../`) are left alone.
 */
export function resolveWorkspaceImageSrc(
  src: string | undefined,
  { baseUrl, workingDir }: WorkspaceImageSrcOptions,
): string | undefined {
  if (!src || !baseUrl) return src;

  const trimmed = src.trim();
  if (
    !trimmed ||
    HAS_SCHEME.test(trimmed) ||
    trimmed.startsWith("//") ||
    trimmed.startsWith("#")
  ) {
    return src;
  }

  let relative = trimmed;
  if (trimmed.startsWith("/")) {
    const root = workingDir?.trim().replace(/\/+$/, "");
    if (!root || !trimmed.startsWith(`${root}/`)) {
      return src;
    }
    relative = trimmed.slice(root.length);
  }

  relative = relative.replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");
  if (!relative || relative.split("/").some((segment) => segment === "..")) {
    return src;
  }

  return joinWorkspaceUrl(baseUrl, relative);
}
