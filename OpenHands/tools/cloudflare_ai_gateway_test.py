import os
import unittest

from cloudflare_ai_gateway import (
    CLOUDFLARE_AI_GATEWAY_HEADER,
    apply_cloudflare_ai_gateway_headers,
    is_cloudflare_llm_call,
)


class CloudflareAiGatewayTests(unittest.TestCase):
    def test_detects_native_and_openai_compatible_calls(self):
        self.assertTrue(
            is_cloudflare_llm_call(
                {"model": "cloudflare/@cf/moonshotai/kimi-k2.6"}
            )
        )
        self.assertTrue(is_cloudflare_llm_call({"model": "@cf/zai-org/glm-5.3"}))
        self.assertTrue(
            is_cloudflare_llm_call(
                {
                    "model": "openai/@cf/qwen/qwen3.8-27b",
                    "api_base": "https://api.cloudflare.com/client/v4/accounts/abc/ai/v1",
                }
            )
        )
        self.assertFalse(is_cloudflare_llm_call({"model": "openai/gpt-4o"}))

    def test_injects_default_gateway_header(self):
        kwargs = {"model": "cloudflare/@cf/moonshotai/kimi-k2.7-code"}
        apply_cloudflare_ai_gateway_headers(kwargs)
        self.assertEqual(
            kwargs["extra_headers"][CLOUDFLARE_AI_GATEWAY_HEADER],
            "default",
        )

    def test_preserves_explicit_gateway_and_honors_env(self):
        kwargs = {
            "model": "@cf/openai/gpt-oss-120b",
            "extra_headers": {CLOUDFLARE_AI_GATEWAY_HEADER: "ship"},
        }
        apply_cloudflare_ai_gateway_headers(kwargs)
        self.assertEqual(kwargs["extra_headers"][CLOUDFLARE_AI_GATEWAY_HEADER], "ship")

        os.environ["CLOUDFLARE_AI_GATEWAY_ID"] = "credits"
        try:
            injected = apply_cloudflare_ai_gateway_headers(
                {"model": "cloudflare/@cf/meta/llama-3.1-8b-instruct"}
            )
            self.assertEqual(
                injected["extra_headers"][CLOUDFLARE_AI_GATEWAY_HEADER],
                "credits",
            )
        finally:
            os.environ.pop("CLOUDFLARE_AI_GATEWAY_ID", None)


if __name__ == "__main__":
    unittest.main()
