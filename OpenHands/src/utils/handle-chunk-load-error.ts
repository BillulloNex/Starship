const RELOAD_KEY = "grokbot_chunk_reload_timestamp";
const RELOAD_THROTTLE_MS = 10_000;

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
 * Triggers a page reload if a chunk load fails, throttled to prevent reload loops.
 */
export function reloadOnChunkError(): void {
  if (typeof window === "undefined") return;

  try {
    const lastReload = sessionStorage.getItem(RELOAD_KEY);
    const now = Date.now();

    if (lastReload && now - Number(lastReload) < RELOAD_THROTTLE_MS) {
      console.warn(
        "[Grokbot] Chunk load error detected, but reload was recently attempted. Skipping to prevent loop.",
      );
      return;
    }

    sessionStorage.setItem(RELOAD_KEY, String(now));
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
