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
  unregisterApp,
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

  describe("listApps and unregisterApp", () => {
    it("lists registered apps and removes them", async () => {
      await registerApp({ name: "app-one", port: 3000 }, registryPath);
      await registerApp({ name: "app-two", port: 3001 }, registryPath);

      const list = await listApps(registryPath);
      expect(list.length).toBe(2);
      expect(list.map((a) => a.name)).toContain("app-one");
      expect(list.map((a) => a.name)).toContain("app-two");

      const removed = await unregisterApp("app-one", registryPath);
      expect(removed).toBe(true);

      const listAfter = await listApps(registryPath);
      expect(listAfter.length).toBe(1);
      expect(listAfter[0].name).toBe("app-two");
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

  describe("start_cmd and autoStartApps", () => {
    it("persists dir and start_cmd", async () => {
      const record = await registerApp(
        {
          name: "mario-game",
          port: 3005,
          dir: "/projects/mario-game",
          start_cmd: "npm run dev",
        },
        registryPath,
      );

      expect(record.dir).toBe("/projects/mario-game");
      expect(record.start_cmd).toBe("npm run dev");

      const fetched = await getApp("mario-game", registryPath);
      expect(fetched?.dir).toBe("/projects/mario-game");
      expect(fetched?.start_cmd).toBe("npm run dev");
    });
  });
});
