export type LimitSource = "auto" | "invoked" | "manual";
export type ProviderCategory =
  | "api"
  | "subscription-acp"
  | "subscription-cli"
  | "gateway";

/**
 * Normalised snapshot of a single provider's remaining capacity, used by
 * the unified Fuel Gauge. Every data source (Claude CLI, Codex ACP,
 * OpenRouter balance, Vercel Gateway, manual entries) maps to this shape.
 */
export interface UnifiedProviderLimit {
  /** Stable key, e.g. "claude-code", "codex", "openrouter", "vercel-gateway", "router-ramp" */
  providerId: string;
  /** Human-readable label shown in the fuel gauge row. */
  displayName: string;
  /** Icon discriminator for the row. */
  icon: string;
  category: ProviderCategory;
  source: LimitSource;

  /** Overall availability status. */
  status: "available" | "limited" | "exhausted" | "unknown" | "error";
  /** Rate-limit windows (subscription providers typically have 1-2). */
  limits: UnifiedLimitWindow[];

  /** Dollar-denominated balance (API / gateway providers). */
  balance?: {
    used: number;
    remaining: number | null;
    limit: number | null;
    isFreeTier?: boolean;
  };

  /** Epoch seconds when this snapshot was captured. */
  lastUpdated: number;
  /** Human-readable error when `status === "error"`. */
  error?: string;
}

export interface UnifiedLimitWindow {
  /** Display label, e.g. "5-hour session", "Weekly". */
  label: string;
  usedPercent: number;
  remainingPercent: number;
  /** Epoch seconds when this window resets, or null. */
  resetAt: number | null;
  limitReached: boolean;
}

/**
 * Shape persisted to localStorage for manually-entered credit balances.
 */
export interface ManualCreditEntry {
  providerId: string;
  displayName: string;
  icon: string;
  /** Total credit limit (e.g. $26 for Router by Ramp). */
  totalCredits: number;
  /** How much has been used so far. */
  usedCredits: number;
  /** Estimated cost auto-subtracted by our tracking. */
  estimatedUsed: number;
  /** Last known actual cost from the provider (for drift calibration). */
  actualUsed: number | null;
  /** Epoch ms when last updated. */
  updatedAt: number;
}

/** Well-known presets for manual credit entry. */
export const MANUAL_CREDIT_PRESETS: Array<{
  providerId: string;
  displayName: string;
  icon: string;
  defaultCredits: number;
}> = [
  {
    providerId: "router-ramp",
    displayName: "Router (Ramp)",
    icon: "router-ramp",
    defaultCredits: 26,
  },
  {
    providerId: "openai-api",
    displayName: "OpenAI API",
    icon: "codex",
    defaultCredits: 0,
  },
  {
    providerId: "anthropic-api",
    displayName: "Anthropic API",
    icon: "claude-code",
    defaultCredits: 0,
  },
  {
    providerId: "google-api",
    displayName: "Google AI API",
    icon: "gemini",
    defaultCredits: 0,
  },
];
