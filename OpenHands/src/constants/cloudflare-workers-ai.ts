import type {
  LLMModel,
  LLMProvider,
} from "#/api/config-service/config-service.types";

/** LiteLLM / OpenHands provider id for Cloudflare Workers AI. */
export const CLOUDFLARE_PROVIDER_ID = "cloudflare";

/**
 * Official OpenAI-compatible Workers AI base path.
 * @see https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
 */
export const CLOUDFLARE_WORKERS_AI_API_PREFIX =
  "https://api.cloudflare.com/client/v4/accounts";

export const CLOUDFLARE_WORKERS_AI_API_SUFFIX = "/ai/v1";

/**
 * Header required for Workers AI models through AI Gateway, including prepaid
 * Unified billing credits. Cloudflare auto-creates gateway id `default`.
 * @see https://developers.cloudflare.com/ai-gateway/usage/rest-api/
 */
export const CLOUDFLARE_AI_GATEWAY_HEADER = "cf-aig-gateway-id";
export const CLOUDFLARE_DEFAULT_GATEWAY_ID = "default";

export const CLOUDFLARE_API_TOKEN_DOCS_URL =
  "https://developers.cloudflare.com/fundamentals/api/get-started/create-token/";

export const CLOUDFLARE_ACCOUNT_ID_DOCS_URL =
  "https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/";

/**
 * Agentic chat models from Cloudflare's official catalogs:
 * - Cloudflare AI (`moonshotai/…`, `minimax/…`): https://developers.cloudflare.com/ai/models/
 * - Workers AI (`@cf/…`): https://developers.cloudflare.com/workers-ai/models/
 *
 * Default is the coding-oriented Workers AI Kimi K2.7.
 */
export const CLOUDFLARE_DEFAULT_MODEL = "@cf/moonshotai/kimi-k2.7-code";

export const CLOUDFLARE_WORKERS_AI_MODELS = [
  "moonshotai/kimi-k3",
  "@cf/moonshotai/kimi-k2.7-code",
  "@cf/moonshotai/kimi-k2.6",
  "@cf/zai-org/glm-5.3",
  "@cf/zai-org/glm-5.3-flash",
  "@cf/zai-org/glm-5.2",
  "minimax/m3",
  "@cf/deepseek-ai/deepseek-v4-pro-0813",
  "@cf/deepseek-ai/deepseek-v4-flash-0731",
  "@cf/qwen/qwen3.8-27b",
  "@cf/openai/gpt-oss-120b",
  "@cf/meta/llama-3.1-8b-instruct",
] as const;

export const CLOUDFLARE_WORKERS_AI_MODEL_LABELS: Record<string, string> = {
  "moonshotai/kimi-k3": "Kimi K3",
  "@cf/moonshotai/kimi-k2.7-code": "Kimi K2.7 Code",
  "@cf/moonshotai/kimi-k2.6": "Kimi K2.6",
  "@cf/zai-org/glm-5.3": "GLM-5.3",
  "@cf/zai-org/glm-5.3-flash": "GLM-5.3 Flash",
  "@cf/zai-org/glm-5.2": "GLM-5.2",
  "minimax/m3": "MiniMax M3",
  "@cf/deepseek-ai/deepseek-v4-pro-0813": "DeepSeek V4 Pro",
  "@cf/deepseek-ai/deepseek-v4-flash-0731": "DeepSeek V4 Flash",
  "@cf/qwen/qwen3.8-27b": "Qwen 3.8 27B",
  "@cf/openai/gpt-oss-120b": "GPT-OSS 120B",
  "@cf/meta/llama-3.1-8b-instruct": "Llama 3.1 8B Instruct",
};

const ACCOUNT_ID_FROM_BASE_URL =
  /^https:\/\/api\.cloudflare\.com\/client\/v4\/accounts\/([^/]+)\/ai\/(?:v1|run)(?:\/.*)?$/i;

export function buildCloudflareWorkersAiBaseUrl(accountId: string): string {
  const trimmed = accountId.trim();
  return `${CLOUDFLARE_WORKERS_AI_API_PREFIX}/${trimmed}${CLOUDFLARE_WORKERS_AI_API_SUFFIX}`;
}

export function parseCloudflareAccountIdFromBaseUrl(
  baseUrl: string | null | undefined,
): string | null {
  if (!baseUrl) return null;
  const match = normalizeCloudflareWorkersAiBaseUrl(baseUrl).match(
    ACCOUNT_ID_FROM_BASE_URL,
  );
  return match?.[1] ?? null;
}

export function normalizeCloudflareWorkersAiBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

export function isCloudflareWorkersAiBaseUrl(
  baseUrl: string | null | undefined,
): boolean {
  return parseCloudflareAccountIdFromBaseUrl(baseUrl) !== null;
}

export function isCloudflareProvider(
  provider: string | null | undefined,
): boolean {
  return provider === CLOUDFLARE_PROVIDER_ID;
}

export function isCloudflareModel(model: string | null | undefined): boolean {
  if (!model) return false;
  const trimmed = model.trim();
  return (
    trimmed.startsWith(`${CLOUDFLARE_PROVIDER_ID}/`) ||
    trimmed.startsWith("@cf/") ||
    trimmed.startsWith("moonshotai/") ||
    trimmed.startsWith("minimax/")
  );
}

export function cloudflareModelLabel(modelId: string): string {
  return CLOUDFLARE_WORKERS_AI_MODEL_LABELS[modelId] ?? modelId;
}

/** Label plus raw ID so the picker matches dashboard searches like "kimi-k3". */
export function cloudflareModelSearchText(modelId: string): string {
  const label = cloudflareModelLabel(modelId);
  return label === modelId ? modelId : `${label} ${modelId}`;
}

export function mergeCloudflareWorkersAiProviders(
  providers: LLMProvider[],
): LLMProvider[] {
  let found = false;
  const merged = providers.map((provider) => {
    if (provider.name !== CLOUDFLARE_PROVIDER_ID) return provider;
    found = true;
    return { ...provider, verified: true };
  });
  if (found) return merged;
  return [{ name: CLOUDFLARE_PROVIDER_ID, verified: true }, ...merged];
}

export function mergeCloudflareWorkersAiModels(
  provider: string | null,
  models: LLMModel[],
  liveModels?: Array<{ id: string; label?: string }> | null,
): LLMModel[] {
  if (provider !== CLOUDFLARE_PROVIDER_ID) return models;
  if (liveModels && liveModels.length > 0) {
    const live: LLMModel[] = liveModels.map((model) => ({
      provider,
      name: model.id,
      verified: true,
    }));
    const seen = new Set(live.map((model) => model.name));
    const rest = models.filter((model) => !seen.has(model.name));
    return [...live, ...rest];
  }
  const curated: LLMModel[] = CLOUDFLARE_WORKERS_AI_MODELS.map((name) => ({
    provider,
    name,
    verified: true,
  }));
  const seen = new Set<string>(CLOUDFLARE_WORKERS_AI_MODELS);
  const rest = models.filter((model) => !seen.has(model.name));
  return [...curated, ...rest];
}
