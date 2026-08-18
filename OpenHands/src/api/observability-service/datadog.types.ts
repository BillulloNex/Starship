export interface DatadogStatusResponse {
  enabled: boolean;
  hasApiKey: boolean;
  hasAppKey: boolean;
  isValidKey?: boolean;
  site: string;
  env: string;
  service: string;
  version?: string;
  configured?: boolean;
  message?: string;
  missing?: string[];
}

export interface DatadogServiceInfo {
  name: string;
  status: "healthy" | "degraded" | "error" | "connected";
  port?: number;
  site?: string;
}

export interface DatadogSummaryResponse {
  configured: boolean;
  timeframe: string;
  from: number;
  to: number;
  site: string;
  env: string;
  service: string;
  metrics: {
    totalRequests: number;
    totalErrors: number;
    errorRate: number;
    latencyP50Ms: number;
    latencyP95Ms: number;
    cpuUsagePercent: number | null;
    requestsTrend: [number, number][];
    latencyTrend: [number, number][];
  };
  monitors: {
    ok: number;
    alert: number;
    warn: number;
    noData: number;
    total: number;
  };
  services: {
    agentServer: DatadogServiceInfo;
    automation: DatadogServiceInfo;
    frontend: DatadogServiceInfo;
    sidecar: DatadogServiceInfo;
  };
  error?: string;
}

export interface DatadogLogEntry {
  id: string;
  timestamp: string;
  service: string;
  host?: string;
  status: "info" | "warn" | "error" | "debug" | string;
  message: string;
  tags?: string[];
  attributes?: Record<string, unknown>;
}

export interface DatadogLogsResponse {
  configured: boolean;
  count: number;
  logs: DatadogLogEntry[];
  error?: string;
}

export interface DatadogMonitorItem {
  id: number;
  name: string;
  type: string;
  state: "OK" | "Alert" | "Warn" | "No Data" | string;
  query?: string;
  message?: string;
  tags: string[];
  creator?: string;
  modified?: string;
}

export interface DatadogMonitorsResponse {
  configured: boolean;
  count: number;
  monitors: DatadogMonitorItem[];
  error?: string;
}

