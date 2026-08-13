import { Langfuse } from "langfuse";

const publicKey =
  (import.meta.env.VITE_LANGFUSE_PUBLIC_KEY as string | undefined) ||
  "pk-lf-3019a7ca-af9b-43cf-9ea0-55cc31714b52";
const secretKey =
  (import.meta.env.VITE_LANGFUSE_SECRET_KEY as string | undefined) ||
  "sk-lf-76a883bd-015c-47c8-89d1-cf6ec50797ff";
const baseUrl =
  (import.meta.env.VITE_LANGFUSE_BASE_URL as string | undefined) ||
  "https://hipaa.cloud.langfuse.com";

let langfuseInstance: Langfuse | null = null;

export function getLangfuseBaseUrl(): string {
  return baseUrl.replace(/\/$/, "");
}

export function isLangfuseEnabled(): boolean {
  return Boolean(publicKey && baseUrl);
}

export function getLangfuseClient(): Langfuse | null {
  if (!isLangfuseEnabled()) return null;
  if (!langfuseInstance) {
    try {
      langfuseInstance = new Langfuse({
        publicKey,
        secretKey,
        baseUrl,
        flushAt: 1, // Flush telemetry fast for real-time responsiveness
      });
    } catch (err) {
      console.warn("Failed to initialize Langfuse telemetry client:", err);
      langfuseInstance = null;
    }
  }
  return langfuseInstance;
}

export interface StartTraceOptions {
  conversationId: string;
  name?: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export function startTrace({
  conversationId,
  name = "Agent Conversation Turn",
  userId,
  metadata,
}: StartTraceOptions) {
  const client = getLangfuseClient();
  if (!client) return null;

  try {
    const trace = client.trace({
      id: `${conversationId}-${Date.now()}`,
      sessionId: conversationId,
      name,
      userId,
      metadata: {
        ...metadata,
        client: "GrokBot Agent Canvas",
      },
    });
    return trace;
  } catch (err) {
    console.warn("Langfuse startTrace error:", err);
    return null;
  }
}

export interface RecordGenerationOptions {
  traceId?: string;
  conversationId: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  cost?: number;
  input?: unknown;
  output?: unknown;
  startTime?: Date;
  endTime?: Date;
}

export function recordGeneration({
  traceId,
  conversationId,
  model = "grok-bot-agent",
  promptTokens = 0,
  completionTokens = 0,
  cost,
  input,
  output,
  startTime,
  endTime = new Date(),
}: RecordGenerationOptions) {
  const client = getLangfuseClient();
  if (!client) return;

  try {
    const trace = traceId
      ? client.trace({ id: traceId })
      : client.trace({
          id: `${conversationId}-${Date.now()}`,
          sessionId: conversationId,
          name: "LLM Generation",
        });

    trace.generation({
      name: "Agent Step Generation",
      model,
      usage: {
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
      },
      metadata: {
        cost,
      },
      input,
      output,
      startTime: startTime ?? new Date(Date.now() - 1000),
      endTime,
    });

    client.flushAsync().catch(() => {});
  } catch (err) {
    console.warn("Langfuse recordGeneration error:", err);
  }
}

export interface RecordMcpToolOptions {
  traceId?: string;
  conversationId: string;
  toolName: string;
  serverName?: string;
  input?: unknown;
  output?: unknown;
  durationMs: number;
  status?: "SUCCESS" | "ERROR";
  errorMessage?: string;
}

export function recordMcpToolCall({
  traceId,
  conversationId,
  toolName,
  serverName = "default",
  input,
  output,
  durationMs,
  status = "SUCCESS",
  errorMessage,
}: RecordMcpToolOptions) {
  const client = getLangfuseClient();
  if (!client) return;

  try {
    const trace = traceId
      ? client.trace({ id: traceId })
      : client.trace({
          id: `${conversationId}-${Date.now()}`,
          sessionId: conversationId,
          name: "MCP Tool Execution",
        });

    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - Math.max(0, durationMs));

    trace.span({
      name: `MCP Tool: ${toolName}`,
      metadata: {
        serverName,
        durationMs,
      },
      input,
      output: status === "ERROR" ? { error: errorMessage, output } : output,
      statusMessage: errorMessage,
      level: status === "ERROR" ? "ERROR" : "DEFAULT",
      startTime,
      endTime,
    });

    client.flushAsync().catch(() => {});
  } catch (err) {
    console.warn("Langfuse recordMcpToolCall error:", err);
  }
}

export function getLangfuseSessionUrl(conversationId: string): string {
  const base = getLangfuseBaseUrl();
  return `${base}/sessions/${conversationId}`;
}
