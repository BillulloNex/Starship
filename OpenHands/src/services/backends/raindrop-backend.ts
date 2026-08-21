import { Raindrop } from "@raindrop-ai/browser-sdk";
import {
  GenerationData,
  ToolCallData,
  ObservabilityBackend,
  registerBackend,
} from "../observability-fanout";
import {
  RAINDROP_WRITE_KEY,
  RAINDROP_PROJECT_ID,
  RAINDROP_BASE_URL,
} from "./observability-config";

/**
 * Observability backend adapter for Raindrop.
 * Uses @raindrop-ai/browser-sdk with fetch-based fallback to ship LLM generations
 * and MCP tool executions to Raindrop.
 *
 * `enabled` is evaluated dynamically at runtime so runtime injection
 * (window.__OBSERVABILITY_CONFIG__) works seamlessly.
 */
export class RaindropBackend implements ObservabilityBackend {
  readonly name = "Raindrop";

  private client: Raindrop | null = null;
  private lastKey = "";
  private lastProject = "";

  get enabled(): boolean {
    return !!this.writeKey;
  }

  private get writeKey(): string {
    return RAINDROP_WRITE_KEY;
  }

  private get projectId(): string | undefined {
    return RAINDROP_PROJECT_ID || undefined;
  }

  private getClient(): Raindrop {
    if (
      !this.client ||
      this.lastKey !== this.writeKey ||
      this.lastProject !== (this.projectId || "")
    ) {
      this.lastKey = this.writeKey;
      this.lastProject = this.projectId || "";
      this.client = new Raindrop({
        apiKey: this.writeKey,
        projectId: this.projectId,
        baseUrl: RAINDROP_BASE_URL,
        localWorkshopUrl: false,
      });
    }
    return this.client;
  }

  private getUserId(): string {
    try {
      if (typeof window !== "undefined") {
        const stored =
          localStorage.getItem("openhands-user-id") ||
          localStorage.getItem("grokbot-user-id");
        if (stored) return stored;
        const anon =
          "user_" +
          (typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID().slice(0, 8)
            : Math.random().toString(36).slice(2, 10));
        localStorage.setItem("grokbot-user-id", anon);
        return anon;
      }
    } catch {}
    return "anonymous-user";
  }

  recordGeneration(data: GenerationData): void {
    if (!this.enabled) return;

    try {
      const client = this.getClient();
      const userId = this.getUserId();
      const eventId =
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "evt_" + Math.random().toString(36).slice(2, 12);

      client
        .trackAi({
          event: "chat_message",
          eventId,
          userId,
          model: data.modelName,
          input: data.input || "Agent generation",
          output: data.output || "Generation completed",
          convoId: data.conversationId,
          properties: {
            cost: data.accumulatedCost,
            promptTokens: data.promptTokens,
            completionTokens: data.completionTokens,
            totalTokens: data.promptTokens + data.completionTokens,
            cacheReadTokens: data.cacheReadTokens,
            cacheWriteTokens: data.cacheWriteTokens,
            reasoningTokens: data.reasoningTokens,
            responseLatencies: data.responseLatencies,
          },
        })
        .catch((err) => {
          console.warn("[observability:Raindrop] trackAi error:", err);
        });
    } catch (err) {
      console.warn("[observability:Raindrop] recordGeneration error:", err);
    }
  }

  recordToolCall(data: ToolCallData): void {
    if (!this.enabled) return;

    try {
      const client = this.getClient();
      const userId = this.getUserId();
      const eventId =
        data.traceId ||
        (typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "tool_" + Math.random().toString(36).slice(2, 12));

      client
        .trackAi({
          event: "tool_call",
          eventId,
          userId,
          input:
            typeof data.input === "string"
              ? data.input
              : JSON.stringify(data.input || {}),
          output:
            typeof data.output === "string"
              ? data.output
              : JSON.stringify(data.output || {}),
          convoId: data.conversationId,
          properties: {
            toolName: data.toolName,
            serverName: data.serverName,
            durationMs: data.durationMs,
            status: data.status,
            errorMessage: data.errorMessage,
          },
        })
        .catch((err) => {
          console.warn("[observability:Raindrop] tool tracking error:", err);
        });
    } catch (err) {
      console.warn("[observability:Raindrop] recordToolCall error:", err);
    }
  }
}

registerBackend(new RaindropBackend());
