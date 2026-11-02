import { describe, it, expect } from "vitest";
import { resolveWorkspaceImageSrc } from "#/utils/resolve-workspace-image-src";

const BASE = "http://localhost:18000/api/conversations/abc/workspace/";
const opts = { baseUrl: BASE, workingDir: "/workspace" };

describe("resolveWorkspaceImageSrc", () => {
  it("joins a workspace-relative path onto the fileserver base", () => {
    expect(resolveWorkspaceImageSrc("guardian-screenshot.png", opts)).toBe(
      `${BASE}guardian-screenshot.png`,
    );
    expect(resolveWorkspaceImageSrc("./shots/page one.png", opts)).toBe(
      `${BASE}shots/page%20one.png`,
    );
  });

  it("maps an absolute path under the working dir", () => {
    expect(resolveWorkspaceImageSrc("/workspace/shots/page.png", opts)).toBe(
      `${BASE}shots/page.png`,
    );
    expect(
      resolveWorkspaceImageSrc("/workspace/shots/page.png", {
        ...opts,
        workingDir: "/workspace/",
      }),
    ).toBe(`${BASE}shots/page.png`);
  });

  it("leaves absolute paths outside the working dir alone", () => {
    expect(resolveWorkspaceImageSrc("/tmp/shot.png", opts)).toBe(
      "/tmp/shot.png",
    );
    expect(resolveWorkspaceImageSrc("/workspace-two/shot.png", opts)).toBe(
      "/workspace-two/shot.png",
    );
    expect(
      resolveWorkspaceImageSrc("/workspace/shot.png", {
        baseUrl: BASE,
        workingDir: undefined,
      }),
    ).toBe("/workspace/shot.png");
  });

  it("passes URLs, data URIs, fragments and traversal through untouched", () => {
    const png = "data:image/png;base64,abc";
    expect(resolveWorkspaceImageSrc(png, opts)).toBe(png);
    expect(resolveWorkspaceImageSrc("https://x.test/a.png", opts)).toBe(
      "https://x.test/a.png",
    );
    expect(resolveWorkspaceImageSrc("//cdn.test/a.png", opts)).toBe(
      "//cdn.test/a.png",
    );
    expect(resolveWorkspaceImageSrc("#top", opts)).toBe("#top");
    expect(resolveWorkspaceImageSrc("../etc/passwd.png", opts)).toBe(
      "../etc/passwd.png",
    );
  });

  it("does nothing until the workspace session exists", () => {
    expect(
      resolveWorkspaceImageSrc("shot.png", { baseUrl: null, workingDir: "/w" }),
    ).toBe("shot.png");
    expect(resolveWorkspaceImageSrc(undefined, opts)).toBeUndefined();
  });
});
