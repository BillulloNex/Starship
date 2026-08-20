import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getAgentServerBaseUrl } from "#/api/agent-server-config";

export interface AppRecord {
  name: string;
  port: number;
  title?: string;
  pid?: number;
  dir?: string;
  start_cmd?: string;
  created_at?: string;
  updated_at?: string;
  is_listening: boolean;
  url_space: string;
  url_org: string;
}

export interface AppsResponse {
  apps: AppRecord[];
  listening: number[];
  unassignedPorts: number[];
}

const PREVIEW_APPS_ENDPOINT = "/api/preview/apps";

export async function fetchApps(): Promise<AppsResponse> {
  const baseUrl = getAgentServerBaseUrl() ?? "";
  const response = await fetch(`${baseUrl}${PREVIEW_APPS_ENDPOINT}`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch apps (${response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    return { apps: [], listening: [], unassignedPorts: [] };
  }

  const data = await response.json();
  if (Array.isArray(data)) {
    return { apps: data, listening: [], unassignedPorts: [] };
  }
  return {
    apps: data.apps || [],
    listening: data.listening || [],
    unassignedPorts: data.unassignedPorts || [],
  };
}

export function useApps(enabled = true) {
  return useQuery({
    queryKey: ["preview-apps"],
    queryFn: fetchApps,
    enabled,
    refetchInterval: 3000,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function useStartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const baseUrl = getAgentServerBaseUrl() ?? "";
      const res = await fetch(`${baseUrl}${PREVIEW_APPS_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to start ${name}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preview-apps"] });
      queryClient.invalidateQueries({ queryKey: ["preview-ports"] });
    },
  });
}

export function useStopApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const baseUrl = getAgentServerBaseUrl() ?? "";
      const res = await fetch(`${baseUrl}${PREVIEW_APPS_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", name }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to stop ${name}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preview-apps"] });
      queryClient.invalidateQueries({ queryKey: ["preview-ports"] });
    },
  });
}

export function useDeleteApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const baseUrl = getAgentServerBaseUrl() ?? "";
      const res = await fetch(
        `${baseUrl}${PREVIEW_APPS_ENDPOINT}?name=${encodeURIComponent(name)}`,
        {
          method: "DELETE",
        },
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to delete ${name}`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preview-apps"] });
      queryClient.invalidateQueries({ queryKey: ["preview-ports"] });
    },
  });
}

export function useRegisterApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      name: string;
      port: number;
      title?: string;
      dir?: string;
      start_cmd?: string;
    }) => {
      const baseUrl = getAgentServerBaseUrl() ?? "";
      const res = await fetch(`${baseUrl}${PREVIEW_APPS_ENDPOINT}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to register app`);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["preview-apps"] });
      queryClient.invalidateQueries({ queryKey: ["preview-ports"] });
    },
  });
}
