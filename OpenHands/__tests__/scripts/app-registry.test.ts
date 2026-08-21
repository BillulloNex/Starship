import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  allocateNextPort,
  getApp,
  getAppByPort,
  listApps,
  normalizeAppName,
  registerApp,
  registerStaticApp,
  unregisterApp,
  buildStartCommand,
} from "../../scripts/app-registry.mjs";

describe("app-registry.mjs", () => {
  let tempDir: string;
  let registryPath: string;

  beforeEach(() => {
    tempDir = mkdtempSync(path.join(tmpdir(), "grokbot-app-registry-test-"));
    registryPath = path.join(tempDir, "apps.json");
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  describe("normalizeAppName", () => {
    it("normalizes mixed-case and spaces into clean slugs", () => {
      expect(normalizeAppName("Teddy Bear")).toBe("teddy-bear");
      expect(normalizeAppName("  SNAKE_GAME 2  ")).toBe("snake-game-2");
      expect(normalizeAppName("my-cool-app")).toBe("my-cool-app");
    });

    it("rejects invalid or empty names", () => {
      expect(normalizeAppName("")).toBeNull();
      expect(normalizeAppName("   ")).toBeNull();
      expect(normalizeAppName("---")).toBeNull();
      expect(normalizeAppName("!@#$%^")).toBeNull();
      expect(normalizeAppName(null as unknown as string)).toBeNull();
    });
  });

  describe("registerApp and getApp", () => {
    it("registers an app and retrieves it", async () => {
      const record = await registerApp(
        {
          name: "teddybear",
          port: 3000,
          title: "The Humble Teddy",
        },
        registryPath,
      );

      expect(record.name).toBe("teddybear");
      expect(record.port).toBe(3000);
      expect(record.title).toBe("The Humble Teddy");
      expect(record.type).toBe("dynamic");

      const fetched = await getApp("teddybear", registryPath);
      expect(fetched).toEqual(record);

      const byPort = await getAppByPort(3000, registryPath);
      expect(byPort).toEqual(record);
    });

    it("rejects reserved or invalid ports", async () => {
      await expect(
        registerApp({ name: "bad", port: 8000 }, registryPath),
      ).rejects.toThrow("reserved");

      await expect(
        registerApp({ name: "bad", port: 80 }, registryPath),
      ).rejects.toThrow("Invalid or reserved port");
    });
  });

  describe("registerStaticApp", () => {
    it("registers a static Cloudflare Pages app", async () => {
      const record = await registerStaticApp(
        {
          name: "space-invaders",
          title: "Space Invaders 3D",
          url: "https://space-invaders.pages.dev",
          branch: "main",
        },
        registryPath,
      );

      expect(record.type).toBe("static");
      expect(record.name).toBe("space-invaders");
      expect(record.url).toBe("https://space-invaders.pages.dev");
      expect(record.provider).toBe("cloudflare_pages");

      const fetched = await getApp("space-invaders", registryPath);
      expect(fetched?.type).toBe("static");
      expect(fetched?.url).toBe("https://space-invaders.pages.dev");
    });
  });

  describe("listApps and unregisterApp", () => {
    it("lists registered apps and removes them", async () => {
      await registerApp({ name: "app-one", port: 3000 }, registryPath);
      await registerStaticApp({ name: "app-static", url: "https://app-static.pages.dev" }, registryPath);

      const list = await listApps(registryPath);
      expect(list.length).toBe(2);
      expect(list.map((a) => a.name)).toContain("app-one");
      expect(list.map((a) => a.name)).toContain("app-static");

      const removed = await unregisterApp("app-one", registryPath, false);
      expect(removed).toBe(true);

      const listAfter = await listApps(registryPath);
      expect(listAfter.length).toBe(1);
      expect(listAfter[0].name).toBe("app-static");
    });
  });

  describe("allocateNextPort", () => {
    it("allocates the next available port in 3000-3999 range", async () => {
      await registerApp({ name: "app1", port: 3000 }, registryPath);
      await registerApp({ name: "app2", port: 3001 }, registryPath);

      const port = await allocateNextPort({}, registryPath);
      expect(port).toBe(3002);
    });

    it("honors preferred port if available", async () => {
      const port = await allocateNextPort(
        { preferredPort: 3050 },
        registryPath,
      );
      expect(port).toBe(3050);
    });
  });

  describe("buildStartCommand", () => {
    it("injects port parameter into npm run dev", () => {
      const cmd = buildStartCommand("/dummy", 3005, "npm run dev");
      expect(cmd).toBe("npm run dev -- --port 3005 --host 0.0.0.0");
    });

    it("preserves parameterized commands with $PORT", () => {
      const cmd = buildStartCommand("/dummy", 3005, "python3 -m http.server $PORT");
      expect(cmd).toBe("python3 -m http.server $PORT");
    });
  });
});
