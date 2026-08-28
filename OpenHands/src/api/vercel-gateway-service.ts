import axios from "axios";

export interface VercelGatewayCredits {
  balance: number;
  total_used: number;
}

/**
 * Fetch Vercel AI Gateway credit balance.
 *
 * Requires a VERCEL_AI_GATEWAY_KEY stored in the agent-server settings.
 * Returns null when the key is not configured or the request fails,
 * allowing the fuel gauge to degrade gracefully.
 */
export class VercelGatewayService {
  static async getCredits(
    apiKey: string | null,
  ): Promise<VercelGatewayCredits | null> {
    if (!apiKey) return null;

    try {
      const response = await axios.get<VercelGatewayCredits>(
        "https://ai-gateway.vercel.sh/v1/credits",
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            Accept: "application/json",
          },
          timeout: 8000,
          validateStatus: (status) => status === 200 || status === 401 || status === 403 || status === 404,
        },
      );

      if (response.status === 200 && typeof response.data?.balance === "number") {
        return response.data;
      }

      return null;
    } catch (error) {
      console.warn("Failed to fetch Vercel AI Gateway credits:", error);
      return null;
    }
  }
}
