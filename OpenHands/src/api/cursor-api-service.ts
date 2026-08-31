import axios from "axios";
import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { getAgentServerBaseUrl } from "./agent-server-config";
import type {
  CursorModelsResponse,
  CursorUsageSnapshot,
} from "./cursor-api-service.types";

type CursorResponse = CursorModelsResponse | CursorUsageSnapshot;

async function getSavedCursorKey(): Promise<string | null> {
  try {
    const raw = await new SettingsClient(
      getAgentServerClientOptions(),
    ).getSecret("CURSOR_API_KEY");
    if (!raw) return null;
    const value = typeof raw === "string" ? raw : String(raw);
    if (!value.trim() || /^\*+$/.test(value.trim())) return null;
    return value.trim();
  } catch {
    return null;
  }
}

export class CursorApiService {
  private static async request<T extends CursorResponse>(
    resource: "models" | "usage",
    refresh: boolean,
  ): Promise<T | null> {
    const baseUrl = getAgentServerBaseUrl() ?? "";
    const url = `${baseUrl}/api/observability/cursor/${resource}${refresh ? "?refresh=true" : ""}`;

    try {
      const response = await axios.get<T>(url, {
        timeout: resource === "usage" ? 45_000 : 15_000,
        validateStatus: (status) =>
          status === 200 || status === 400 || status === 401 || status === 404,
      });
      if (response.status === 200 && response.data?.provider === "cursor") {
        return response.data;
      }

      // The proxy may not have a host-level key. Reuse the encrypted settings
      // store path already used by the ACP credential form; the key is posted
      // only to Grokbot's same-origin server proxy, never directly from the
      // browser to Cursor.
      if (response.status === 400 || response.status === 401) {
        const key = await getSavedCursorKey();
        if (!key) return null;
        const retry = await axios.post<T>(url, key, {
          headers: { "Content-Type": "text/plain" },
          timeout: resource === "usage" ? 45_000 : 15_000,
          validateStatus: (status) => status === 200 || status === 401,
        });
        if (retry.status === 200 && retry.data?.provider === "cursor") {
          return retry.data;
        }
      }
      return null;
    } catch (error) {
      console.warn(`Failed to fetch Cursor ${resource}:`, error);
      return null;
    }
  }

  static getModels(refresh = false): Promise<CursorModelsResponse | null> {
    return this.request<CursorModelsResponse>("models", refresh);
  }

  static getUsage(refresh = false): Promise<CursorUsageSnapshot | null> {
    return this.request<CursorUsageSnapshot>("usage", refresh);
  }
}

/**
 * Calibrated formulation to estimate Cursor Pro quota consumption % from token metrics.
 * - Cursor Models (Cursor Grok, Composer): 80M effective tokens ceiling (~440M raw).
 * - Other Models (Claude, GPT, auto): 22M effective tokens ceiling (~175M raw).
 */
export function estimateCursorProUsagePercentage(
  tokens: {
    inputTokens?: number;
    prompt_tokens?: number;
    cacheReadTokens?: number;
    cache_read_tokens?: number;
    outputTokens?: number;
    completion_tokens?: number;
  },
  modelId?: string | null,
): import("./cursor-api-service.types").CursorProUsageEstimate {
  const model = (modelId || "cursor-grok").toLowerCase();
  const isCursorModel =
    model.includes("cursor") ||
    model.includes("composer") ||
    model.includes("grok");

  const input = tokens.inputTokens ?? tokens.prompt_tokens ?? 0;
  const cacheRead = tokens.cacheReadTokens ?? tokens.cache_read_tokens ?? 0;
  const output = tokens.outputTokens ?? tokens.completion_tokens ?? 0;

  // Effective token calculation: uncached input (1x) + cache read (0.1x) + output (3.0x)
  const effectiveTokens = input + 0.1 * cacheRead + 3.0 * output;

  // 100% capacity ceiling in effective tokens
  const ceiling = isCursorModel ? 80_000_000 : 22_000_000;
  const percentUsed = Math.min(
    100,
    Math.max(0, Math.round((effectiveTokens / ceiling) * 100)),
  );
  const percentRemaining = Math.max(0, 100 - percentUsed);

  return {
    category: isCursorModel ? "cursor-models" : "other-models",
    categoryLabel: isCursorModel
      ? "Cursor Models (Grok/Composer)"
      : "Other Models",
    effectiveTokens,
    percentUsed,
    percentRemaining,
    isLimitReached: percentRemaining <= 0,
  };
}
