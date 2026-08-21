import axios from "axios";
import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { getAgentServerBaseUrl } from "./agent-server-config";
import { ClaudeUsageQuota } from "./claude-usage-service.types";

export class ClaudeUsageService {
  /**
   * Fetch real-time Claude Code quota and remaining usage from the proxy.
   *
   * 1. Attempts GET /api/observability/claude/usage (proxy uses server-side auth/cache if present).
   * 2. If the proxy needs credentials (400), attempts to fetch CLAUDE_AUTH_JSON or ANTHROPIC_API_KEY
   *    from the local agent-server secret store and sends it to the proxy.
   * 3. Returns normalized quota info with 5-hour and 7-day rate-limit percentages.
   */
  static async getUsage(refresh = false): Promise<ClaudeUsageQuota | null> {
    const baseUrl = getAgentServerBaseUrl() ?? "";
    const url = `${baseUrl}/api/observability/claude/usage${refresh ? "?refresh=true" : ""}`;
    try {
      const response = await axios.get<ClaudeUsageQuota>(url, {
        timeout: 12000,
        validateStatus: (status) =>
          status === 200 || status === 400 || status === 401 || status === 404,
      });

      if (response.status === 200 && response.data?.provider === "claude") {
        return response.data;
      }

      // If missing credentials (400), try to retrieve CLAUDE/ANTHROPIC credentials from the agent server settings store
      if (response.status === 400) {
        try {
          const client = new SettingsClient(getAgentServerClientOptions());
          let secretValue: string | null = null;
          try {
            const raw =
              (await client.getSecret("CLAUDE_AUTH_JSON")) ||
              (await client.getSecret("ANTHROPIC_API_KEY"));
            if (raw)
              secretValue = typeof raw === "string" ? raw : JSON.stringify(raw);
          } catch {
            const list = await client
              .listSecrets()
              .catch(() => ({ secrets: [] }));
            const match = list.secrets?.find(
              (s: { name: string }) =>
                /claude/i.test(s.name) ||
                /anthropic/i.test(s.name) ||
                /claude_auth/i.test(s.name),
            );
            if (match) {
              const res = await client.getSecret(match.name);
              if (res)
                secretValue =
                  typeof res === "string" ? res : JSON.stringify(res);
            }
          }

          if (secretValue) {
            const postRes = await axios.post<ClaudeUsageQuota>(
              url,
              secretValue,
              {
                headers: { "Content-Type": "text/plain" },
                timeout: 12000,
              },
            );
            if (postRes.status === 200 && postRes.data?.provider === "claude") {
              return postRes.data;
            }
          }
        } catch {
          // Secret not found or backend unavailable
        }
      }

      return null;
    } catch (error) {
      console.warn("Failed to fetch Claude usage quota:", error);
      return null;
    }
  }
}
