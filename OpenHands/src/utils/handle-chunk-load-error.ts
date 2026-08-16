const RELOAD_KEY = "grokbot_chunk_reload_timestamp";

/**
 * Determines whether a given error or event represents a failed script/chunk load
 * typically caused by a newly deployed version invalidating old chunk hashes.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;

  let message = "";
  if (error instanceof Error) {
    message = `${error.name} ${error.message}`;
  } else if (typeof error === "string") {
    message = error;
  } else if (typeof error === "object" && error !== null) {
    if (
      "message" in error &&
      typeof (error as { message: unknown }).message === "string"
    ) {
      message = (error as { message: string }).message;
    } else if ("reason" in error && (error as { reason: unknown }).reason) {
      return isChunkLoadError((error as { reason: unknown }).reason);
    }
  }

  const normalized = message.toLowerCase();
  return (
    normalized.includes("failed to fetch dynamically imported module") ||
    normalized.includes("error loading dynamically imported module") ||
    normalized.includes("importing a module script failed") ||
    normalized.includes("loading chunk") ||
    normalized.includes("loading css chunk") ||
    normalized.includes("unable to preload css") ||
    normalized.includes("chunkloaderror")
  );
}

/**
 * Triggers a page reload if a chunk load fails.
 * Uses the current manifest hash as a version key — only reloads once per
 * manifest version to prevent infinite loops, while still recovering when
 * a new deployment arrives.
 */
export function reloadOnChunkError(): void {
  if (typeof window === "undefined") return;

  try {
    // Use the root CSS hash or entry script hash as a deploy version fingerprint.
    // The manifest JS is loaded via ES import(), not a <script src> tag.
    const versionEl =
      document.querySelector('link[href*="/assets/root-"]') ||
      document.querySelector('script[src*="/assets/entry.client-"]');
    const href = versionEl?.getAttribute("href") || versionEl?.getAttribute("src") || "";
    const buildHash = href.match(/-([a-zA-Z0-9_-]+)\.\w+$/)?.[1] || "unknown";
    const versionKey = `${RELOAD_KEY}_${buildHash}`;

    const alreadyReloaded = sessionStorage.getItem(versionKey);
    if (alreadyReloaded) {
      console.warn(
        `[Grokbot] Chunk load error detected for build ${buildHash}, but reload was already attempted. Skipping to prevent loop.`,
      );
      return;
    }

    sessionStorage.setItem(versionKey, String(Date.now()));
    console.warn(
      "[Grokbot] Deployment update or missing chunk detected. Reloading page...",
    );
    window.location.reload();
  } catch {
    window.location.reload();
  }
}

/**
 * Installs window-level error listeners to automatically recover from chunk load failures.
 */
export function setupChunkLoadErrorHandler(): void {
  if (typeof window === "undefined") return;

  // 1. Vite specific event for module/css preload failures
  window.addEventListener("vite:preloadError", (event) => {
    event.preventDefault();
    reloadOnChunkError();
  });

  // 2. Unhandled promise rejections (e.g. dynamic import() failures)
  window.addEventListener("unhandledrejection", (event) => {
    if (isChunkLoadError(event.reason)) {
      event.preventDefault();
      reloadOnChunkError();
    }
  });

  // 3. Global script/resource errors
  window.addEventListener(
    "error",
    (event) => {
      if (isChunkLoadError(event.error) || isChunkLoadError(event.message)) {
        event.preventDefault();
        reloadOnChunkError();
      }
    },
    true,
  );
}
