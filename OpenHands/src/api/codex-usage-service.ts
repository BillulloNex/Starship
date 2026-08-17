import axios from "axios";
import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { CodexUsageQuota } from "./codex-usage-service.types";

export class CodexUsageService {
  /**
   * Fetch real-time Codex quota and remaining usage from the proxy.
   *
   * 1. Attempts GET /api/observability/codex/usage (proxy uses server-side auth if present).
   * 2. If the proxy needs credentials (400), attempts to fetch CODEX_AUTH_JSON from the
   *    local agent-server secret store and sends it to the proxy.
   * 3. Returns normalized quota info with 5-hour and 7-day rate-limit percentages.
   */
  static async getUsage(refresh = false): Promise<CodexUsageQuota | null> {
    const url = `/api/observability/codex/usage${refresh ? "?refresh=true" : ""}`;
    try {
      const response = await axios.get<CodexUsageQuota>(url, {
        timeout: 12000,
        validateStatus: (status) =>
          status === 200 || status === 400 || status === 401 || status === 404,
      });

      if (response.status === 200 && response.data?.provider === "codex") {
        return response.data;
      }

      // If missing credentials (400), try to retrieve CODEX_AUTH_JSON from the agent server settings store
      if (response.status === 400) {
        try {
          const client = new SettingsClient(getAgentServerClientOptions());
          const secretValue = await client.getSecret("CODEX_AUTH_JSON");
          if (secretValue) {
            const postRes = await axios.post<CodexUsageQuota>(
              url,
              secretValue,
              {
                headers: { "Content-Type": "text/plain" },
                timeout: 12000,
              },
            );
            if (postRes.status === 200 && postRes.data?.provider === "codex") {
              return postRes.data;
            }
          }
        } catch {
          // Secret not found or backend unavailable
        }
      }

      return null;
    } catch (error) {
      console.warn("Failed to fetch Codex usage quota:", error);
      return null;
    }
  }
}
