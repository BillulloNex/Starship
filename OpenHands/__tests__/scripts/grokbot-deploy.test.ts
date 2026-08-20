import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  findStaticRoot,
  sanitizeSlug,
} from "../../scripts/grokbot-deploy.mjs";

describe("grokbot-deploy.mjs", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "grokbot-deploy-test-"));
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("sanitizeSlug", () => {
    it("sanitizes spaces, capitals, and special characters", () => {
      expect(sanitizeSlug("Space Invaders Game!")).toBe("space-invaders-game");
      expect(sanitizeSlug("My_Cool_Arcade")).toBe("my-cool-arcade");
      expect(sanitizeSlug("retro-synth-123")).toBe("retro-synth-123");
    });

    it("generates a fallback slug when input is empty or invalid", () => {
      const fallback = sanitizeSlug("");
      expect(fallback).toMatch(/^app-[a-z0-9]+$/);
    });
  });

  describe("findStaticRoot", () => {
    it("identifies direct index.html in the root directory", () => {
      writeFileSync(path.join(tempDir, "index.html"), "<h1>Hello</h1>");
      const root = findStaticRoot(tempDir);
      expect(root).toBe(tempDir);
    });

    it("finds index.html in a dist build subfolder", () => {
      const distDir = path.join(tempDir, "dist");
      mkdirSync(distDir);
      writeFileSync(path.join(distDir, "index.html"), "<h1>Vite App</h1>");

      const root = findStaticRoot(tempDir);
      expect(root).toBe(distDir);
    });

    it("throws an error when no index.html or html files exist", () => {
      expect(() => findStaticRoot(tempDir)).toThrowError(
        /No "index.html" found/,
      );
    });
  });
});
