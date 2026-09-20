import axios from "axios";
import { getAgentServerBaseUrl } from "./agent-server-config";

export interface CloudflareLiveModel {
  id: string;
  label: string;
  task: string;
}

export interface CloudflareCatalogResponse {
  source: "catalog" | "search";
  modelCount: number;
  models: CloudflareLiveModel[];
}

export async function fetchCloudflareCatalogModels(params: {
  accountId: string;
  apiToken: string;
}): Promise<CloudflareCatalogResponse | null> {
  const accountId = params.accountId.trim();
  const apiToken = params.apiToken.trim();
  if (!accountId || !apiToken) return null;

  const baseUrl = getAgentServerBaseUrl() ?? "";
  const url = `${baseUrl}/api/cloudflare/models`;

  try {
    const response = await axios.post<CloudflareCatalogResponse>(
      url,
      { account_id: accountId, api_token: apiToken },
      {
        timeout: 20_000,
        validateStatus: (status) => status === 200 || status === 400,
      },
    );
    if (response.status === 200 && Array.isArray(response.data?.models)) {
      return response.data;
    }
    return null;
  } catch (error) {
    console.warn("Failed to fetch Cloudflare model catalog:", error);
    return null;
  }
}
