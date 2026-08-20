import { useQuery } from "@tanstack/react-query";
import { getAgentServerBaseUrl } from "#/api/agent-server-config";

/**
 * Live-preview state, served by the ingress (`static-server.mjs`).
 *
 * Every listening port is previewable: the proxy matches preview hostnames by
 * pattern rather than per-port registration, so a running server always has a
 * URL that resolves.
 */
export interface PreviewPortsResponse {
  /** False when the deployment has no preview host pattern configured. */
  enabled: boolean;
  /** Ports with a server answering inside the workspace container, right now. */
  listening: number[];
  /** e.g. "https://p{port}.beenex.org"; null when disabled. */
  urlTemplate: string | null;
}

const PREVIEW_PORTS_ENDPOINT = "/api/preview/ports";

export function buildPreviewUrl(
  urlTemplate: string | null,
  port: number,
): string | null {
  if (!urlTemplate) return null;
  const templates = urlTemplate.split(",").map((s) => s.trim());
  const portTemplate =
    templates.find((t) => t.includes("{port}")) ?? templates[0];
  if (!portTemplate) return null;
  return portTemplate.replace(/\{port\}/g, String(port));
}

async function fetchPreviewPorts(): Promise<PreviewPortsResponse> {
  const baseUrl = getAgentServerBaseUrl() ?? "";
  const response = await fetch(`${baseUrl}${PREVIEW_PORTS_ENDPOINT}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Preview ports request failed (${response.status})`);
  }

  // A deployment running an older ingress has no such route, so the SPA
  // fallback answers with index.html. Treat any non-JSON reply as "the
  // feature isn't there" rather than letting a parse error surface as a
  // broken tab.
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { enabled: false, listening: [], urlTemplate: null };
  }

  return response.json();
}

export function usePreviewPorts(enabled = true) {
  return useQuery({
    queryKey: ["preview-ports"],
    queryFn: fetchPreviewPorts,
    enabled,
    // The agent starts and stops servers mid-conversation, so a port that
    // wasn't there ten seconds ago usually is now. Cheap call (one /proc read).
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
    staleTime: 0,
    retry: false,
  });
}
