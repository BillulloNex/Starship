export interface ClaudeRateLimitWindow {
  limitSeconds: number;
  usedPercent: number;
  remainingPercent: number;
  resetAt: number | null;
  limitReached: boolean;
}

export interface ClaudeUsageQuota {
  provider: "claude";
  planType: string;
  primaryWindow: ClaudeRateLimitWindow | null;
  secondaryWindow: ClaudeRateLimitWindow | null;
  updatedAt: number;
}
