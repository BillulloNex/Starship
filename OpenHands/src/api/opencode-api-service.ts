import axios from "axios";
import { SettingsClient } from "@openhands/typescript-client/clients";
import { getAgentServerClientOptions } from "./agent-server-client-options";
import { getAgentServerBaseUrl } from "./agent-server-config";
import type { OpencodeModelsResponse } from "./opencode-api-service.types";

async function getSavedOpencodeKey(): Promise<string | null> {
  const secretNames = [
    "OPENCODE_GO_API_KEY",
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "OPENCODE_AUTH_JSON",
  ];
  for (const name of secretNames) {
    try {
      const raw = await new SettingsClient(
        getAgentServerClientOptions(),
      ).getSecret(name);
      if (!raw) continue;
      const value = typeof raw === "string" ? raw : String(raw);
      if (value.trim() && !/^\*+$/.test(value.trim())) {
        return value.trim();
      }
    } catch {
      // Continue checking next secret
    }
  }
  return null;
}

export class OpencodeApiService {
  static async getModels(
    refresh = false,
  ): Promise<OpencodeModelsResponse | null> {
    const baseUrl = getAgentServerBaseUrl() ?? "";
    const url = `${baseUrl}/api/observability/opencode/models${refresh ? "?refresh=true" : ""}`;

    try {
      const response = await axios.get<OpencodeModelsResponse>(url, {
        timeout: 15_000,
        validateStatus: (status) =>
          status === 200 || status === 400 || status === 401 || status === 404,
      });
      if (response.status === 200 && response.data?.provider === "opencode") {
        return response.data;
      }

      if (response.status === 400 || response.status === 401) {
        const key = await getSavedOpencodeKey();
        if (!key) return null;
        const retry = await axios.post<OpencodeModelsResponse>(url, key, {
          headers: { "Content-Type": "text/plain" },
          timeout: 15_000,
          validateStatus: (status) => status === 200 || status === 401,
        });
        if (retry.status === 200 && retry.data?.provider === "opencode") {
          return retry.data;
        }
      }
      return null;
    } catch (error) {
      console.warn("Failed to fetch OpenCode models:", error);
      return null;
    }
  }
}
