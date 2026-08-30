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
