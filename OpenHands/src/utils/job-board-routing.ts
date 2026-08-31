export interface QuotaProvider {
  providerId: string;
  displayName: string;
  status: string;
}

export interface RoutableAgentProfile {
  id?: string | null;
  name?: string | null;
  agent_kind?: string | null;
  acp_server?: string | null;
}

const PROVIDER_ALIASES: Record<string, string[]> = {
  "claude-code": ["claude", "anthropic"],
  claude: ["claude-code", "anthropic"],
  codex: ["chatgpt", "openai"],
  cursor: ["cursor"],
  opencode: ["opencode"],
  antigravity: ["antigravity", "gemini", "agy"],
  "gemini-cli": ["gemini", "antigravity"],
  openhands: ["openhands", "openrouter"],
};

function tokensFor(value: string | null | undefined): string[] {
  if (!value) return [];
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length > 2);
}

export function profileMatchesProvider(
  profile: RoutableAgentProfile,
  provider: QuotaProvider,
): boolean {
  const aliases = [
    provider.providerId,
    provider.displayName,
    ...(PROVIDER_ALIASES[provider.providerId] ?? []),
  ]
    .flatMap(tokensFor)
    .filter(Boolean);
  const haystack = new Set(
    [
      ...tokensFor(profile.name),
      ...tokensFor(profile.agent_kind),
      ...tokensFor(profile.acp_server),
    ].filter(Boolean),
  );
  return aliases.some((alias) => haystack.has(alias));
}

export function pickProfileForQuota(
  profiles: RoutableAgentProfile[] | undefined,
  providers: QuotaProvider[] | undefined,
): RoutableAgentProfile | null {
  if (!profiles?.length) return null;
  const available = (providers ?? []).filter(
    (provider) => provider.status === "available",
  );
  for (const provider of available) {
    const match = profiles.find(
      (profile) => profile.id && profileMatchesProvider(profile, provider),
    );
    if (match) return match;
  }
  return null;
}
