// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getAcpProvider } from "#/constants/acp-providers";

const here = path.dirname(fileURLToPath(import.meta.url));
const openhandsRoot = path.resolve(here, "../..");
const starshipRoot = path.resolve(openhandsRoot, "..");

const PACKAGE_VERSION = /@agentclientprotocol\/codex-acp@(\d+\.\d+\.\d+)/;

// The SDK rewrites any `npx @agentclientprotocol/codex-acp@<version>` launch to
// the `codex-acp` binary on PATH, so the version that actually runs is the one
// the Dockerfile installs. A pin that only lives in the provider registry is
// silently ignored (the base image's 1.1.2 ran instead, without GPT-6).
describe("codex-acp version pin", () => {
  const dockerfile = readFileSync(
    path.join(starshipRoot, "Dockerfile"),
    "utf8",
  );
  const dockerVersion = dockerfile.match(
    /^ARG CODEX_ACP_VERSION="(\d+\.\d+\.\d+)"$/m,
  )?.[1];

  it("installs codex-acp on PATH in the production image", () => {
    expect(dockerVersion).toBeDefined();
    expect(dockerfile).toContain(
      'npm install -g --prefix /opt/codex-acp "@agentclientprotocol/codex-acp@${CODEX_ACP_VERSION}"',
    );
    expect(dockerfile).toContain(
      "ln -sfn /opt/codex-acp/bin/codex-acp /usr/local/bin/codex-acp",
    );
  });

  it("matches the frontend provider default command", () => {
    const command = getAcpProvider("codex")?.default_command.join(" ") ?? "";
    expect(command.match(PACKAGE_VERSION)?.[1]).toBe(dockerVersion);
  });

  it("matches the backend registry override in sitecustomize", () => {
    const sitecustomize = readFileSync(
      path.join(openhandsRoot, "tools", "sitecustomize.py"),
      "utf8",
    );
    const versions = [
      ...sitecustomize.matchAll(new RegExp(PACKAGE_VERSION, "g")),
    ].map((m) => m[1]);
    expect(versions.length).toBeGreaterThan(0);
    expect(new Set(versions)).toEqual(new Set([dockerVersion]));
  });
});
