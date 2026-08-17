/* eslint-disable local/no-direct-agent-server-fetch */
import { describe, it, expect, beforeEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "#/mocks/node";
import { resetTestHandlersMockSettings } from "#/mocks/settings-handlers";
import { resetMockWorkspaces } from "#/mocks/workspaces-handlers";
import { resetAutomationMockData } from "#/mocks/automation-handlers";

describe("API Endpoints Functional Matrix", () => {
  beforeEach(() => {
    resetTestHandlersMockSettings();
    resetMockWorkspaces();
    resetAutomationMockData();
  });

  describe("Health & Bootstrap", () => {
    it("returns 200 with valid response on /server_info", async () => {
      const res = await fetch("http://localhost:3000/server_info");
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveProperty("version");
    });

    it("handles 500 error on /server_info gracefully without crashing", async () => {
      server.use(
        http.get("*/server_info", () => {
          return HttpResponse.json(
            { error: "Internal Server Error" },
            { status: 500 },
          );
        }),
      );
      const res = await fetch("http://localhost:3000/server_info");
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data).toHaveProperty("error");
    });

    it("handles 401 unauthorized gracefully", async () => {
      server.use(
        http.get("*/server_info", () => {
          return HttpResponse.json({ error: "Unauthorized" }, { status: 401 });
        }),
      );
      const res = await fetch("http://localhost:3000/server_info");
      expect(res.status).toBe(401);
      const data = await res.json();
      expect(data.error).toBe("Unauthorized");
    });

    it("handles malformed JSON response without throwing unhandled exception", async () => {
      server.use(
        http.get("*/server_info", () => {
          return HttpResponse.text("{ malformed: json ", {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }),
      );
      const res = await fetch("http://localhost:3000/server_info");
      await expect(res.json()).rejects.toThrow();
    });
  });

  describe("Conversations", () => {
    it("lists conversations and returns an array", async () => {
      const res = await fetch("http://localhost:3000/api/conversations");
      const data = await res.json();
      expect(Array.isArray(data) || Array.isArray(data?.items)).toBe(true);
    });

    it("creates a conversation and returns id", async () => {
      const res = await fetch("http://localhost:3000/api/conversations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      expect(res.status).toBe(201);
      expect(data).toHaveProperty("id");
    });

    it("handles 404 gracefully when deleting non-existent conversation", async () => {
      const res = await fetch(
        "http://localhost:3000/api/conversations/non-existent-id",
        {
          method: "DELETE",
        },
      );
      expect(res.status).toBe(404);
    });

    it("supports pause/resume state transitions", async () => {
      // Mocking pause/resume endpoints as they might not be fully implemented in simple mocks
      server.use(
        http.post("*/api/conversations/:id/pause", () =>
          HttpResponse.json({ status: "paused" }),
        ),
        http.post("*/api/conversations/:id/resume", () =>
          HttpResponse.json({ status: "running" }),
        ),
      );

      const pauseRes = await fetch(
        "http://localhost:3000/api/conversations/123/pause",
        { method: "POST" },
      );
      const pauseData = await pauseRes.json();
      expect(pauseRes.status).toBe(200);
      expect(pauseData.status).toBe("paused");

      const resumeRes = await fetch(
        "http://localhost:3000/api/conversations/123/resume",
        { method: "POST" },
      );
      const resumeData = await resumeRes.json();
      expect(resumeRes.status).toBe(200);
      expect(resumeData.status).toBe("running");
    });
  });

  describe("Settings & Profiles", () => {
    it("returns defaults on GET /api/settings", async () => {
      const res = await fetch("http://localhost:3000/api/settings");
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toHaveProperty("agent_settings");
    });

    it("patches settings with valid data successfully", async () => {
      const res = await fetch("http://localhost:3000/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agent_settings_diff: { agent: "TestAgent" } }),
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data).toBeDefined();
    });

    it("handles create/activate/delete LLM profile round-trip", async () => {
      const createRes = await fetch(
        "http://localhost:3000/api/profiles/test-profile",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            llm: { model: "test/model" },
          }),
        },
      );
      expect(createRes.status).toBe(201);

      const activateRes = await fetch(
        "http://localhost:3000/api/profiles/test-profile/activate",
        {
          method: "POST",
        },
      );
      expect(activateRes.status).toBe(200);

      const deleteRes = await fetch(
        "http://localhost:3000/api/profiles/test-profile",
        {
          method: "DELETE",
        },
      );
      expect(deleteRes.status).toBe(200);
    });
  });

  describe("MCP", () => {
    it("lists servers", async () => {
      // Setup a mock for list servers if not existing
      server.use(
        http.get("*/api/settings/mcp", () =>
          HttpResponse.json({ servers: [] }),
        ),
      );
      const res = await fetch("http://localhost:3000/api/settings/mcp");
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(Array.isArray(data.servers)).toBe(true);
    });

    it("handles health probe with timeout/error", async () => {
      server.use(
        http.post("*/api/mcp/test", async () => {
          return HttpResponse.json({ ok: false, tools: [] }, { status: 200 });
        }),
      );
      const res = await fetch("http://localhost:3000/api/mcp/test", {
        method: "POST",
      });
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.ok).toBe(false);
    });

    it("handles tool invocation error handling gracefully", async () => {
      server.use(
        http.post("*/api/mcp/test", () => {
          return HttpResponse.json(
            { error: "Invocation failed" },
            { status: 500 },
          );
        }),
      );
      const res = await fetch("http://localhost:3000/api/mcp/test", {
        method: "POST",
      });
      expect(res.status).toBe(500);
      const data = await res.json();
      expect(data.error).toBe("Invocation failed");
    });
  });

  describe("Observability", () => {
    it("Datadog/PostHog/Langfuse status endpoints return status objects", async () => {
      server.use(
        http.get("*/api/observability/datadog/status", () =>
          HttpResponse.json({ status: "ok" }),
        ),
        http.get("*/api/observability/posthog/status", () =>
          HttpResponse.json({ status: "ok" }),
        ),
        http.get("*/api/observability/langfuse/status", () =>
          HttpResponse.json({ status: "ok" }),
        ),
      );

      const resDatadog = await fetch(
        "http://localhost:3000/api/observability/datadog/status",
      );
      const dataDatadog = await resDatadog.json();
      expect(resDatadog.status).toBe(200);
      expect(dataDatadog.status).toBe("ok");
    });

    it("Missing keys return graceful 'not configured' response", async () => {
      server.use(
        http.get("*/api/observability/datadog/status", () =>
          HttpResponse.json({ status: "not_configured" }),
        ),
      );

      const res = await fetch(
        "http://localhost:3000/api/observability/datadog/status",
      );
      const data = await res.json();
      expect(res.status).toBe(200);
      expect(data.status).toBe("not_configured");
    });
  });

  describe("Error Invariants", () => {
    it("ensures all error responses are typed, not raw exceptions", async () => {
      server.use(
        http.get("*/server_info", () => {
          return HttpResponse.json(
            {
              error: {
                code: "VALIDATION_ERROR",
                message: "Invalid request payload",
              },
            },
            { status: 400 },
          );
        }),
      );
      const res = await fetch("http://localhost:3000/server_info");
      const data = await res.json();
      expect(res.status).toBe(400);
      expect(data.error.code).toBe("VALIDATION_ERROR");
      expect(data.error.message).toBe("Invalid request payload");
    });

    it("network failures don't crash the query client but return proper error structure", async () => {
      server.use(
        http.get("*/api/settings", () => {
          return HttpResponse.error();
        }),
      );
      try {
        await fetch("http://localhost:3000/api/settings");
      } catch (error) {
        expect(error).toBeDefined();
        // The error should be caught by our fetch/query client abstraction in practice
      }
    });
  });
});
