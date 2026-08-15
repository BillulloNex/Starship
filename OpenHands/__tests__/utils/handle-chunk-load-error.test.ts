import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isChunkLoadError,
  reloadOnChunkError,
  setupChunkLoadErrorHandler,
} from "#/utils/handle-chunk-load-error";

describe("handle-chunk-load-error", () => {
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    vi.clearAllMocks();
    // Mock window.location.reload
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...originalLocation,
        reload: vi.fn(),
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, "location", {
      configurable: true,
      value: originalLocation,
    });
  });

  describe("isChunkLoadError", () => {
    it("identifies dynamic import fetch failures (Chromium)", () => {
      const err = new TypeError(
        "Failed to fetch dynamically imported module: https://grok.beenex.org/assets/manifest-912e5204.js",
      );
      expect(isChunkLoadError(err)).toBe(true);
    });

    it("identifies dynamic import fetch failures (Firefox)", () => {
      const err = new TypeError(
        "error loading dynamically imported module: https://grok.beenex.org/assets/foo.js",
      );
      expect(isChunkLoadError(err)).toBe(true);
    });

    it("identifies module script failures (Safari / WebKit)", () => {
      const err = new TypeError("Importing a module script failed.");
      expect(isChunkLoadError(err)).toBe(true);
    });

    it("identifies chunk and css preload errors", () => {
      expect(isChunkLoadError("Loading chunk 123 failed.")).toBe(true);
      expect(isChunkLoadError("Unable to preload CSS /assets/root.css")).toBe(
        true,
      );
      expect(
        isChunkLoadError(new Error("ChunkLoadError: Loading chunk 456 failed")),
      ).toBe(true);
    });

    it("handles error objects and nested reasons", () => {
      expect(
        isChunkLoadError({
          reason: new Error("Failed to fetch dynamically imported module"),
        }),
      ).toBe(true);
      expect(
        isChunkLoadError({
          message: "Failed to fetch dynamically imported module",
        }),
      ).toBe(true);
    });

    it("returns false for unrelated errors", () => {
      expect(isChunkLoadError(null)).toBe(false);
      expect(isChunkLoadError(undefined)).toBe(false);
      expect(isChunkLoadError(new Error("Network Error 500"))).toBe(false);
      expect(isChunkLoadError(new TypeError("x is not a function"))).toBe(
        false,
      );
    });
  });

  describe("reloadOnChunkError", () => {
    it("reloads window when called", () => {
      reloadOnChunkError();
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });

    it("throttles reloads if called multiple times within threshold", () => {
      reloadOnChunkError();
      expect(window.location.reload).toHaveBeenCalledTimes(1);

      // Second call immediately after should be throttled
      reloadOnChunkError();
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });

  describe("setupChunkLoadErrorHandler", () => {
    it("registers vite:preloadError and triggers reload", () => {
      setupChunkLoadErrorHandler();

      const event = new Event("vite:preloadError");
      window.dispatchEvent(event);

      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });

    it("registers unhandledrejection for chunk errors", () => {
      setupChunkLoadErrorHandler();

      const event = new CustomEvent("unhandledrejection", {
        detail: {},
      }) as unknown as PromiseRejectionEvent;
      Object.defineProperty(event, "reason", {
        value: new Error("Failed to fetch dynamically imported module"),
      });

      window.dispatchEvent(event as Event);
      expect(window.location.reload).toHaveBeenCalledTimes(1);
    });
  });
});
