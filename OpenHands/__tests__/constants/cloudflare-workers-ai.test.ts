import { describe, expect, it } from "vitest";
import {
  CLOUDFLARE_DEFAULT_MODEL,
  CLOUDFLARE_PROVIDER_ID,
  buildCloudflareWorkersAiBaseUrl,
  isCloudflareModel,
  isCloudflareWorkersAiBaseUrl,
  mergeCloudflareWorkersAiModels,
  mergeCloudflareWorkersAiProviders,
  parseCloudflareAccountIdFromBaseUrl,
} from "#/constants/cloudflare-workers-ai";

describe("cloudflare workers ai helpers", () => {
  it("builds the official OpenAI-compatible Workers AI base URL", () => {
    expect(buildCloudflareWorkersAiBaseUrl("abc123")).toBe(
      "https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1",
    );
  });

  it("parses account ids from /ai/v1 and legacy /ai/run URLs", () => {
    expect(
      parseCloudflareAccountIdFromBaseUrl(
        "https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1",
      ),
    ).toBe("acct-1");
    expect(
      parseCloudflareAccountIdFromBaseUrl(
        "https://api.cloudflare.com/client/v4/accounts/acct-1/ai/v1/",
      ),
    ).toBe("acct-1");
    expect(
      parseCloudflareAccountIdFromBaseUrl(
        "https://api.cloudflare.com/client/v4/accounts/acct-1/ai/run/@cf/meta/llama-3.1-8b-instruct",
      ),
    ).toBe("acct-1");
    expect(
      parseCloudflareAccountIdFromBaseUrl("https://api.openai.com/v1"),
    ).toBeNull();
  });

  it("recognizes Cloudflare model strings", () => {
    expect(isCloudflareModel(`cloudflare/${CLOUDFLARE_DEFAULT_MODEL}`)).toBe(
      true,
    );
    expect(isCloudflareModel(CLOUDFLARE_DEFAULT_MODEL)).toBe(true);
    expect(isCloudflareModel("openai/gpt-4o")).toBe(false);
    expect(isCloudflareWorkersAiBaseUrl("https://api.openai.com/v1")).toBe(
      false,
    );
  });

  it("injects Cloudflare as a verified provider when the catalog omits it", () => {
    const merged = mergeCloudflareWorkersAiProviders([
      { name: "openai", verified: true },
    ]);
    expect(merged[0]).toEqual({
      name: CLOUDFLARE_PROVIDER_ID,
      verified: true,
    });
  });

  it("marks an existing Cloudflare provider verified and prepends curated models", () => {
    expect(
      mergeCloudflareWorkersAiProviders([
        { name: CLOUDFLARE_PROVIDER_ID, verified: false },
      ]),
    ).toEqual([{ name: CLOUDFLARE_PROVIDER_ID, verified: true }]);

    const models = mergeCloudflareWorkersAiModels("cloudflare", [
      { provider: "cloudflare", name: "legacy-model", verified: false },
    ]);
    expect(models[0]).toEqual({
      provider: "cloudflare",
      name: CLOUDFLARE_DEFAULT_MODEL,
      verified: true,
    });
    expect(models.some((model) => model.name === "legacy-model")).toBe(true);
  });
});
