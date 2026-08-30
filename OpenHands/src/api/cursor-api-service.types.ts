export interface CursorModelOption {
  /** Exact ACP model selection value, including Cursor variant parameters. */
  id: string;
  /** Cursor's base catalog id (for example, `grok-4.6`). */
  baseId: string;
  label: string;
  params: Array<{ id: string; value: string }>;
  isDefault?: boolean;
}

export interface CursorModelsResponse {
  provider: "cursor";
  models: CursorModelOption[];
  modelCount: number;
  updatedAt: number;
}

export interface CursorTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens: number;
  cacheReadTokens: number;
  totalTokens: number;
}

export interface CursorUsageSnapshot {
  provider: "cursor";
  scope: "cloud-agents";
  agentCount: number;
  activeAgentCount: number;
  runCount: number;
  unavailableAgentCount: number;
  truncated: boolean;
  totalUsage: CursorTokenUsage;
  updatedAt: number;
  /** Always false for a user API key; Cursor exposes plan quota in its dashboard. */
  planQuotaAvailable: false;
}
