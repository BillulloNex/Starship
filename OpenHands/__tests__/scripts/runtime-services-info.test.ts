// @vitest-environment node
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  buildRuntimeServicesInfo,
  parseArgs,
} from "../../scripts/runtime-services-info.mjs";

const SCRIPT_PATH = fileURLToPath(
  new URL("../../scripts/runtime-services-info.mjs", import.meta.url),
);

// buildRuntimeServicesInfo comes from a .mjs module, so tsc infers `object`;
// cast to the structural shape we assert on (mirrors dev-safe.test.ts).
interface RuntimeServicesInfoShape {
  mode?: string;
  agent_host_alias: string;
  services: {
    agent_server?: { url_from_agent: string };
    automation?: {
      url_from_agent: string;
      api_prefix: string;
      docs_url: string;
      openapi_url: string;
      auth_env_var: string;
    };
    app_preview?: {
      url_template: string;
      reserved_ports: number[];
    };
  };
}

describe("runtime-services-info.mjs", () => {
  describe("app preview", () => {
    it("advertises the template and the ports this stack reserves", () => {
      const info = buildRuntimeServicesInfo({
        agentServerUrl: "http://127.0.0.1:18000",
        appPreview: {
          urlTemplate: "https://p{port}.example.org",
          reservedPorts: [8000, 18000],
        },
      }) as RuntimeServicesInfoShape;

      expect(info.services.app_preview).toMatchObject({
        url_template: "https://p{port}.example.org",
        reserved_ports: [8000, 18000],
      });
    });

    it("omits the entry when no template is configured", () => {
      // A deployment with no published hostnames must not advertise a preview
      // the agent would then hand to the user as a dead link.
      const info = buildRuntimeServicesInfo({
        agentServerUrl: "http://127.0.0.1:18000",
        appPreview: { reservedPorts: [8000] },
      }) as RuntimeServicesInfoShape;

      expect(info.services.app_preview).toBeUndefined();
    });

    it("parses the preview flags from argv", () => {
      const options = parseArgs([
        "--preview-url-template",
        "https://p{port}.example.org",
        "--preview-reserved-ports",
        "8000, 18000",
      ]) as {
        appPreview?: { urlTemplate?: string; reservedPorts?: number[] };
      };

      expect(options.appPreview).toEqual({
        urlTemplate: "https://p{port}.example.org",
        reservedPorts: [8000, 18000],
      });
    });
  });

  // Port-based behavior (the dev path) is covered in dev-safe.test.ts. These
  // cover the URL-override path the Docker image uses.
  describe("buildRuntimeServicesInfo — URL overrides", () => {
    it("uses explicit agent-server and automation URLs verbatim", () => {
      const info = buildRuntimeServicesInfo({
        mode: "docker",
        agentHostAlias: "127.0.0.1",
        agentServerUrl: "http://127.0.0.1:18000",
        automation: { url: "http://127.0.0.1:8000" },
      }) as RuntimeServicesInfoShape;
      expect(info.agent_host_alias).toBe("127.0.0.1");
      expect(info.services.agent_server?.url_from_agent).toBe(
        "http://127.0.0.1:18000",
      );
      expect(info.services.automation).toMatchObject({
        url_from_agent: "http://127.0.0.1:8000",
        api_prefix: "/api/automation",
        docs_url: "http://127.0.0.1:8000/api/automation/docs",
        openapi_url: "http://127.0.0.1:8000/api/automation/openapi.json",
        auth_env_var: "OPENHANDS_AUTOMATION_API_KEY",
      });
    });

    it("prefers an explicit agentServerUrl over agentServerPort", () => {
      const info = buildRuntimeServicesInfo({
        agentServerPort: 99999,
        agentServerUrl: "http://127.0.0.1:18000",
      }) as RuntimeServicesInfoShape;
      expect(info.services.agent_server?.url_from_agent).toBe(
        "http://127.0.0.1:18000",
      );
    });

    it("omits automation when neither url nor port is provided", () => {
      const info = buildRuntimeServicesInfo({
        agentServerUrl: "http://127.0.0.1:18000",
        automation: {},
      }) as RuntimeServicesInfoShape;
      expect(info.services.automation).toBeUndefined();
    });

    it("throws when neither port nor url is provided", () => {
      expect(() => buildRuntimeServicesInfo({ mode: "x" })).toThrow(
        /agentServerPort or agentServerUrl is required/,
      );
    });
  });

  describe("parseArgs", () => {
    it("maps flags to builder options", () => {
      const opts = parseArgs([
        "--mode",
        "docker",
        "--agent-host-alias",
        "127.0.0.1",
        "--agent-server-url",
        "http://127.0.0.1:18000",
        "--automation-url",
        "http://127.0.0.1:8000",
      ]);
      expect(opts).toEqual({
        mode: "docker",
        agentHostAlias: "127.0.0.1",
        agentServerUrl: "http://127.0.0.1:18000",
        automation: { url: "http://127.0.0.1:8000" },
      });
    });

    it("omits automation when no --automation-url is given", () => {
      const opts = parseArgs(["--agent-server-url", "http://127.0.0.1:18000"]);
      expect(opts.automation).toBeUndefined();
    });

    it("throws on an unknown flag", () => {
      expect(() => parseArgs(["--nope"])).toThrow(/Unknown flag/);
    });
  });

  describe("CLI", () => {
    // This is the exact path docker/entrypoint.sh relies on: run the module
    // directly and capture the JSON it prints to stdout.
    it("emits valid <RUNTIME_SERVICES> JSON on stdout", () => {
      const stdout = execFileSync(
        process.execPath,
        [
          SCRIPT_PATH,
          "--mode",
          "docker",
          "--agent-host-alias",
          "127.0.0.1",
          "--agent-server-url",
          "http://127.0.0.1:18000",
          "--automation-url",
          "http://127.0.0.1:8000",
        ],
        { encoding: "utf8" },
      );
      const info = JSON.parse(stdout);
      expect(info.mode).toBe("docker");
      expect(info.services.agent_server.url_from_agent).toBe(
        "http://127.0.0.1:18000",
      );
      expect(info.services.automation.url_from_agent).toBe(
        "http://127.0.0.1:8000",
      );
      expect(info.services.job_board.cli).toBe("grokbot-job");
    });
  });
});
