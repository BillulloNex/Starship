import { create } from "zustand";

export interface McpToolStat {
  toolName: string;
  serverName: string;
  callCount: number;
  totalDurationMs: number;
  avgDurationMs: number;
  errorCount: number;
  lastCalledAt: number;
}

export interface ObservabilityMetrics {
  lastTurnDurationMs: number | null;
  avgTurnDurationMs: number | null;
  totalTurns: number;
  mcpToolMetrics: Record<string, McpToolStat>;
}

/**
 * Per-model token/cost breakdown, keyed by model name.
 * Populated from the `usage_to_metrics` WebSocket stats event.
 */
export interface PerModelMetrics {
  modelName: string;
  usageId: string;
  cost: number;
  promptTokens: number;
  completionTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface MetricsState {
  cost: number | null;
  max_budget_per_task: number | null;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    cache_read_tokens: number;
    cache_write_tokens: number;
    context_window: number;
    per_turn_token: number;
  } | null;
  perModelMetrics: Record<string, PerModelMetrics>;
  observability: ObservabilityMetrics;
}

export interface MetricsStore extends MetricsState {
  setMetrics: (metrics: Partial<MetricsState>) => void;
  setPerModelMetrics: (metrics: Record<string, PerModelMetrics>) => void;
  recordTurnDuration: (durationMs: number) => void;
  recordMcpToolExecution: (
    toolName: string,
    serverName: string,
    durationMs: number,
    success: boolean,
  ) => void;
  resetMetrics: () => void;
}

const EMPTY_OBSERVABILITY: ObservabilityMetrics = {
  lastTurnDurationMs: null,
  avgTurnDurationMs: null,
  totalTurns: 0,
  mcpToolMetrics: {},
};

const EMPTY_METRICS: MetricsState = {
  cost: null,
  max_budget_per_task: null,
  usage: null,
  perModelMetrics: {},
  observability: EMPTY_OBSERVABILITY,
};

const useMetricsStore = create<MetricsStore>((set, get) => ({
  ...EMPTY_METRICS,
  setMetrics: (metrics) => set((state) => ({ ...state, ...metrics })),
  setPerModelMetrics: (metrics) =>
    set((state) => ({ ...state, perModelMetrics: metrics })),
  recordTurnDuration: (durationMs: number) => {
    const { observability } = get();
    const newTotalTurns = observability.totalTurns + 1;
    const currentSum =
      (observability.avgTurnDurationMs ?? 0) * observability.totalTurns;
    const newAvg = (currentSum + durationMs) / newTotalTurns;

    set((state) => ({
      ...state,
      observability: {
        ...state.observability,
        lastTurnDurationMs: durationMs,
        avgTurnDurationMs: Math.round(newAvg),
        totalTurns: newTotalTurns,
      },
    }));
  },
  recordMcpToolExecution: (
    toolName: string,
    serverName: string,
    durationMs: number,
    success: boolean,
  ) => {
    const key = `${serverName}:${toolName}`;
    const { observability } = get();
    const existing = observability.mcpToolMetrics[key] || {
      toolName,
      serverName,
      callCount: 0,
      totalDurationMs: 0,
      avgDurationMs: 0,
      errorCount: 0,
      lastCalledAt: Date.now(),
    };

    const newCallCount = existing.callCount + 1;
    const newTotalDuration = existing.totalDurationMs + durationMs;
    const newAvgDuration = Math.round(newTotalDuration / newCallCount);
    const newErrorCount = existing.errorCount + (success ? 0 : 1);

    const updatedStat: McpToolStat = {
      ...existing,
      callCount: newCallCount,
      totalDurationMs: newTotalDuration,
      avgDurationMs: newAvgDuration,
      errorCount: newErrorCount,
      lastCalledAt: Date.now(),
    };

    set((state) => ({
      ...state,
      observability: {
        ...state.observability,
        mcpToolMetrics: {
          ...state.observability.mcpToolMetrics,
          [key]: updatedStat,
        },
      },
    }));
  },
  resetMetrics: () => set(EMPTY_METRICS),
}));

if (typeof window !== "undefined" && import.meta.env.DEV) {
  (
    window as unknown as { __OH_METRICS_STORE__?: typeof useMetricsStore }
  ).__OH_METRICS_STORE__ = useMetricsStore;
}

export default useMetricsStore;
