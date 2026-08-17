export interface CodexRateLimitWindow {
  limitSeconds: number;
  usedPercent: number;
  remainingPercent: number;
  resetAt: number | null;
  limitReached: boolean;
}

export interface CodexUsageQuota {
  provider: "codex";
  planType: string;
  primaryWindow: CodexRateLimitWindow | null;
  secondaryWindow: CodexRateLimitWindow | null;
  updatedAt: number;
}
