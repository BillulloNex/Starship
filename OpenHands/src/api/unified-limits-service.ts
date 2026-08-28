import { ClaudeUsageService } from "./claude-usage-service";
import { CodexUsageService } from "./codex-usage-service";
import { VercelGatewayService } from "./vercel-gateway-service";
import LLMBalanceService from "./llm-balance-service";
import type {
  UnifiedProviderLimit,
  ManualCreditEntry,
} from "./unified-limits.types";

const MANUAL_CREDITS_KEY = "grokbot-manual-credits";

// ---------------------------------------------------------------------------
// localStorage helpers
// ---------------------------------------------------------------------------

export function loadManualCredits(): ManualCreditEntry[] {
  try {
    const raw = localStorage.getItem(MANUAL_CREDITS_KEY);
    return raw ? (JSON.parse(raw) as ManualCreditEntry[]) : [];
  } catch {
    return [];
  }
}

export function saveManualCredits(entries: ManualCreditEntry[]): void {
  localStorage.setItem(MANUAL_CREDITS_KEY, JSON.stringify(entries));
}

export function upsertManualCredit(entry: ManualCreditEntry): void {
  const entries = loadManualCredits();
  const idx = entries.findIndex((e) => e.providerId === entry.providerId);
  if (idx >= 0) {
    entries[idx] = entry;
  } else {
    entries.push(entry);
  }
  saveManualCredits(entries);
}

export function deleteManualCredit(providerId: string): void {
  const entries = loadManualCredits().filter(
    (e) => e.providerId !== providerId,
  );
  saveManualCredits(entries);
}

// ---------------------------------------------------------------------------
// Normalisation helpers
// ---------------------------------------------------------------------------

function statusFromPercent(
  remainingPercent: number,
): UnifiedProviderLimit["status"] {
  if (remainingPercent <= 0) return "exhausted";
  if (remainingPercent < 15) return "limited";
  return "available";
}

function statusFromBalance(
  remaining: number | null,
): UnifiedProviderLimit["status"] {
  if (remaining === null) return "unknown";
  if (remaining <= 0) return "exhausted";
  if (remaining < 1) return "limited";
  return "available";
}

// ---------------------------------------------------------------------------
// Aggregator
// ---------------------------------------------------------------------------

export class UnifiedLimitsService {
  /**
   * Fan out to every known provider and return normalised snapshots.
   * Providers that fail or are unconfigured are silently omitted.
   */
  static async getAll(): Promise<UnifiedProviderLimit[]> {
    const results: UnifiedProviderLimit[] = [];

    // --- Resolve Vercel key from settings store ---
    let vercelKey: string | null = null;
    try {
      const { SettingsClient } = await import(
        "@openhands/typescript-client/clients"
      );
      const { getAgentServerClientOptions } = await import(
        "./agent-server-client-options"
      );
      const client = new SettingsClient(getAgentServerClientOptions());
      const raw = await client.getSecret("VERCEL_AI_GATEWAY_KEY");
      if (raw) vercelKey = typeof raw === "string" ? raw : String(raw);
    } catch {
      // Settings store unavailable
    }

    // --- Claude (ACP subscription) ---
    try {
      const claude = await ClaudeUsageService.getUsage(false);
      if (claude) {
        // CRITICAL: Detect fake/unverified responses.
        // The proxy sets `unverified: true` when it has a token but
        // can't actually verify quota (Anthropic has no public API).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const isUnverified = (claude as any).unverified === true;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const warning = (claude as any).warning as string | undefined;

        if (isUnverified || (!claude.primaryWindow && !claude.secondaryWindow)) {
          // Show as UNKNOWN — never fake a green status
          results.push({
            providerId: "claude-code",
            displayName: claude.planType ?? "Claude",
            icon: "claude-code",
            category: "subscription-acp",
            source: "auto",
            status: "unknown",
            limits: [],
            lastUpdated: claude.updatedAt,
            error: warning ?? "Quota cannot be verified — check claude.ai/settings",
          });
        } else {
          const primaryRemaining =
            claude.primaryWindow?.remainingPercent ?? 0;
          results.push({
            providerId: "claude-code",
            displayName:
              claude.planType?.toLowerCase().includes("team")
                ? "Claude Team"
                : claude.planType?.toLowerCase().includes("max")
                  ? "Claude Max"
                  : "Claude Pro",
            icon: "claude-code",
            category: "subscription-acp",
            source: "auto",
            status: statusFromPercent(primaryRemaining),
            limits: [
              ...(claude.primaryWindow
                ? [
                    {
                      label: "5-hour session",
                      usedPercent: claude.primaryWindow.usedPercent,
                      remainingPercent: claude.primaryWindow.remainingPercent,
                      resetAt: claude.primaryWindow.resetAt,
                      limitReached: claude.primaryWindow.limitReached,
                    },
                  ]
                : []),
              ...(claude.secondaryWindow
                ? [
                    {
                      label: "Weekly",
                      usedPercent: claude.secondaryWindow.usedPercent,
                      remainingPercent: claude.secondaryWindow.remainingPercent,
                      resetAt: claude.secondaryWindow.resetAt,
                      limitReached: claude.secondaryWindow.limitReached,
                    },
                  ]
                : []),
            ],
            lastUpdated: claude.updatedAt,
          });
        }
      }
    } catch {
      // Claude unavailable — silently omit
    }

    // --- Codex / ChatGPT (ACP subscription) ---
    try {
      const codex = await CodexUsageService.getUsage(false);
      if (codex) {
        const primaryRemaining =
          codex.primaryWindow?.remainingPercent ?? 100;
        results.push({
          providerId: "codex",
          displayName:
            codex.planType === "pro"
              ? "ChatGPT Pro"
              : codex.planType === "team"
                ? "ChatGPT Team"
                : codex.planType === "plus"
                  ? "ChatGPT Plus"
                  : "ChatGPT Plan",
          icon: "codex",
          category: "subscription-acp",
          source: "auto",
          status: statusFromPercent(primaryRemaining),
          limits: [
            ...(codex.primaryWindow
              ? [
                  {
                    label: "5-hour session",
                    usedPercent: codex.primaryWindow.usedPercent,
                    remainingPercent: codex.primaryWindow.remainingPercent,
                    resetAt: codex.primaryWindow.resetAt,
                    limitReached: codex.primaryWindow.limitReached,
                  },
                ]
              : []),
            ...(codex.secondaryWindow
              ? [
                  {
                    label: "Weekly",
                    usedPercent: codex.secondaryWindow.usedPercent,
                    remainingPercent: codex.secondaryWindow.remainingPercent,
                    resetAt: codex.secondaryWindow.resetAt,
                    limitReached: codex.secondaryWindow.limitReached,
                  },
                ]
              : []),
          ],
          lastUpdated: codex.updatedAt,
        });
      }
    } catch {
      // Codex unavailable
    }

    // --- OpenRouter (API provider) ---
    try {
      const balance = await LLMBalanceService.getBalance();
      if (balance) {
        results.push({
          providerId: "openrouter",
          displayName: balance.isFreeTier
            ? "OpenRouter (Free)"
            : "OpenRouter",
          icon: "openrouter",
          category: "api",
          source: "auto",
          status: statusFromBalance(balance.limitRemaining),
          limits: [],
          balance: {
            used: balance.usage,
            remaining: balance.limitRemaining,
            limit: balance.limit,
            isFreeTier: balance.isFreeTier,
          },
          lastUpdated: Math.floor(Date.now() / 1000),
        });
      }
    } catch {
      // OpenRouter unavailable
    }

    // --- Vercel AI Gateway (API gateway) ---
    try {
      const vercel = await VercelGatewayService.getCredits(
        vercelKey,
      );
      if (vercel) {
        results.push({
          providerId: "vercel-gateway",
          displayName: "Vercel AI Gateway",
          icon: "vercel-gateway",
          category: "gateway",
          source: "auto",
          status: statusFromBalance(vercel.balance),
          limits: [],
          balance: {
            used: vercel.total_used,
            remaining: vercel.balance,
            limit: vercel.balance + vercel.total_used,
          },
          lastUpdated: Math.floor(Date.now() / 1000),
        });
      }
    } catch {
      // Vercel unavailable
    }

    // --- Manual credit entries (Router by Ramp, direct API keys, etc.) ---
    const manualEntries = loadManualCredits();
    for (const entry of manualEntries) {
      const totalUsed = Math.max(entry.usedCredits, entry.estimatedUsed);
      const remaining = Math.max(0, entry.totalCredits - totalUsed);
      const usedPercent =
        entry.totalCredits > 0
          ? Math.round((totalUsed / entry.totalCredits) * 100)
          : 0;
      const remainingPercent = Math.max(0, 100 - usedPercent);

      results.push({
        providerId: entry.providerId,
        displayName: entry.displayName,
        icon: entry.icon,
        category: "api",
        source: "manual",
        status: statusFromPercent(remainingPercent),
        limits: [
          {
            label: "Credit balance",
            usedPercent,
            remainingPercent,
            resetAt: null,
            limitReached: remaining <= 0,
          },
        ],
        balance: {
          used: totalUsed,
          remaining,
          limit: entry.totalCredits,
        },
        lastUpdated: Math.floor(entry.updatedAt / 1000),
      });
    }

    return results;
  }
}
