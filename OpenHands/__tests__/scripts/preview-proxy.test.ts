import { describe, expect, it } from "vitest";

import {
  createPreviewHostMatcher,
  DEFAULT_BLOCKED_PORTS,
  isPreviewablePort,
  parseListeningPorts,
} from "../../scripts/preview-proxy.mjs";

describe("preview-proxy.mjs", () => {
  describe("isPreviewablePort", () => {
    it("allows standard unblocked user ports", () => {
      expect(isPreviewablePort(3000)).toBe(true);
      expect(isPreviewablePort(5173)).toBe(true);
      expect(isPreviewablePort(8080)).toBe(true);
    });

    it("blocks stack ports and system ports", () => {
      expect(isPreviewablePort(8000)).toBe(false);
      expect(isPreviewablePort(18000)).toBe(false);
      expect(isPreviewablePort(18001)).toBe(false);
      expect(isPreviewablePort(80)).toBe(false);
      expect(isPreviewablePort(443)).toBe(false);
    });
  });

  describe("createPreviewHostMatcher", () => {
    it("matches port subdomains across beenex.space and beenex.org", async () => {
      const matcher = createPreviewHostMatcher(
        "{app}.beenex.space,p{port}.beenex.space,p{port}.beenex.org",
        DEFAULT_BLOCKED_PORTS,
        async (name: string) => {
          if (name === "teddybear") return { name: "teddybear", port: 3000 };
          if (name === "snake") return { name: "snake", port: 3001 };
          return null;
        },
      );

      expect(matcher).not.toBeNull();

      // Test numeric ports
      const p3000 = await matcher!("p3000.beenex.space");
      expect(p3000).toEqual({ port: 3000, appName: null });

      const p3000Org = await matcher!("p3000.beenex.org");
      expect(p3000Org).toEqual({ port: 3000, appName: null });

      // Test named apps
      const teddy = await matcher!("teddybear.beenex.space");
      expect(teddy).toEqual({ port: 3000, appName: "teddybear" });

      const snake = await matcher!("snake.beenex.space");
      expect(snake).toEqual({ port: 3001, appName: "snake" });

      // Test unknown app
      const unknown = await matcher!("unknownapp.beenex.space");
      expect(unknown).toEqual({
        port: null,
        appName: "unknownapp",
        notFound: true,
      });

      // Synchronous portForHost compatibility
      expect(matcher!.portForHost("p3000.beenex.space")).toBe(3000);
      expect(matcher!.portForHost("p3000.beenex.org")).toBe(3000);
    });
  });

  describe("parseListeningPorts", () => {
    it("parses hex ports in LISTEN state (0A)", () => {
      const sampleNetTcp = `
  sl  local_address rem_address   st tx_queue rx_queue tr tm->when retrnsmt   uid  timeout inode
   0: 00000000:0BB8 00000000:0000 0A 00000000:00000000 00:00-00000000 00000000     0        0 12345 1 0000000000000000 100 0 0 10 0
   1: 00000000:1F40 00000000:0000 0A 00000000:00000000 00:00-00000000 00000000     0        0 12346 1 0000000000000000 100 0 0 10 0
`;
      const ports = parseListeningPorts(sampleNetTcp);
      expect(ports.has(3000)).toBe(true); // 0x0BB8 = 3000
      expect(ports.has(8000)).toBe(true); // 0x1F40 = 8000
    });
  });
});
