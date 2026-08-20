import { useQuery } from "@tanstack/react-query";

/**
 * Live-preview state, served by the ingress (`static-server.mjs`).
 *
 * `listening` and `routable` are deliberately separate. A dev server can be
 * running on a port the operator never published a hostname for — it works
 * inside the container but no link to it resolves — and the UI has to explain
 * that rather than hand out a URL that 404s.
 */
export interface PreviewPortsResponse {
  /** False when the deployment has no preview host pattern configured. */
  enabled: boolean;
  /** Ports with a server answering inside the workspace container, right now. */
  listening: number[];
  /** Ports the operator has published a public hostname for. */
  routable: number[];
  /** e.g. "https://p{port}.beenex.org"; null when disabled. */
  urlTemplate: string | null;
}

const PREVIEW_PORTS_ENDPOINT = "/api/preview/ports";

export function buildPreviewUrl(
  urlTemplate: string | null,
  port: number,
): string | null {
  if (!urlTemplate) return null;
  return urlTemplate.replace("{port}", String(port));
}

async function fetchPreviewPorts(): Promise<PreviewPortsResponse> {
  const response = await fetch(PREVIEW_PORTS_ENDPOINT, {
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
    return { enabled: false, listening: [], routable: [], urlTemplate: null };
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
