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

export interface DatadogComplianceFrameworkSummary {
  passed: number;
  failed: number;
  total: number;
  passRate: number;
  framework: string;
}

export interface DatadogSecuritySummaryResponse {
  configured: boolean;
  site: string;
  env: string;
  service: string;
  timeframe: string;
  score: number;
  posture: "healthy" | "warning" | "critical";
  signals: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    info: number;
    total: number;
  };
  compliance: {
    soc2: DatadogComplianceFrameworkSummary;
    hipaa: DatadogComplianceFrameworkSummary;
    cis: DatadogComplianceFrameworkSummary;
  };
  asm: {
    status: "active" | "inactive";
    runtimeProtection: "enabled" | "disabled";
    vulnerabilitiesCount: number;
    threatsBlocked: number;
  };
  recentAuditCount: number;
  error?: string;
}

export interface DatadogSecuritySignal {
  id: string;
  type: string;
  timestamp: string;
  severity: "critical" | "high" | "medium" | "low" | "info" | string;
  title: string;
  ruleName: string;
  ruleId?: string;
  message?: string;
  tags: string[];
  attributes?: Record<string, unknown>;
}

export interface DatadogSecuritySignalsResponse {
  configured: boolean;
  count: number;
  signals: DatadogSecuritySignal[];
  error?: string;
}

export interface DatadogComplianceFinding {
  id: string;
  framework: "SOC 2" | "HIPAA" | "CIS" | string;
  category: string;
  ruleId: string;
  title: string;
  status: "passed" | "failed" | "warn";
  severity: "critical" | "high" | "medium" | "low";
  description: string;
  remediation: string;
}

export interface DatadogComplianceFindingsResponse {
  configured: boolean;
  count: number;
  findings: DatadogComplianceFinding[];
  error?: string;
}

export interface DatadogAuditLogPayload {
  action: string;
  actor?: string;
  tool?: string;
  command?: string;
  workspace?: string;
  securityRisk?: number;
  status?: "success" | "error" | "warn";
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export interface DatadogAuditLogResponse {
  success: boolean;
  event: DatadogAuditLogPayload;
  error?: string;
}
