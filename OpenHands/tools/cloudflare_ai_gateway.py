"""Inject Cloudflare AI Gateway headers on LiteLLM Workers AI calls.

Workers AI models billed through prepaid AI Gateway credits require
``cf-aig-gateway-id``. LiteLLM's native Cloudflare provider talks to the
OpenAI-compatible ``/ai/v1`` endpoint but does not send that header.

Official docs:
https://developers.cloudflare.com/ai-gateway/usage/rest-api/
https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
"""

from __future__ import annotations

import os
import sys

CLOUDFLARE_AI_GATEWAY_HEADER = "cf-aig-gateway-id"
CLOUDFLARE_DEFAULT_GATEWAY_ID = "default"


def is_cloudflare_llm_call(kwargs: dict) -> bool:
    model = str(kwargs.get("model") or "")
    api_base = str(kwargs.get("api_base") or kwargs.get("base_url") or "")
    if model.startswith("cloudflare/") or model.startswith("@cf/"):
        return True
    if "/@cf/" in model:
        return True
    return "api.cloudflare.com" in api_base and "/ai/" in api_base


def resolve_cloudflare_gateway_id() -> str:
    return (
        os.environ.get("CLOUDFLARE_AI_GATEWAY_ID", "").strip()
        or CLOUDFLARE_DEFAULT_GATEWAY_ID
    )


def alias_cloudflare_api_key_env() -> None:
    """Map Cloudflare's documented token names onto LiteLLM's env var."""
    if os.environ.get("CLOUDFLARE_API_KEY", "").strip():
        return
    for name in ("CLOUDFLARE_API_TOKEN", "CLOUDFLARE_AUTH_TOKEN"):
        value = os.environ.get(name, "").strip()
        if value:
            os.environ["CLOUDFLARE_API_KEY"] = value
            return


def apply_cloudflare_ai_gateway_headers(kwargs: dict) -> dict:
    if not is_cloudflare_llm_call(kwargs):
        return kwargs
    alias_cloudflare_api_key_env()
    headers = dict(kwargs.get("extra_headers") or {})
    if CLOUDFLARE_AI_GATEWAY_HEADER not in headers:
        headers[CLOUDFLARE_AI_GATEWAY_HEADER] = resolve_cloudflare_gateway_id()
        kwargs["extra_headers"] = headers
    return kwargs


def install_cloudflare_ai_gateway_patch() -> bool:
    try:
        import functools
        import litellm
    except ImportError as exc:
        print(
            f"[grokbot-cloudflare] litellm patch skipped (import error): {exc}",
            file=sys.stderr,
            flush=True,
        )
        return False

    alias_cloudflare_api_key_env()

    original_completion = litellm.completion
    original_acompletion = litellm.acompletion

    @functools.wraps(original_completion)
    def patched_completion(*args, **kwargs):
        apply_cloudflare_ai_gateway_headers(kwargs)
        return original_completion(*args, **kwargs)

    @functools.wraps(original_acompletion)
    async def patched_acompletion(*args, **kwargs):
        apply_cloudflare_ai_gateway_headers(kwargs)
        return await original_acompletion(*args, **kwargs)

    litellm.completion = patched_completion
    litellm.acompletion = patched_acompletion
    print(
        "[grokbot-cloudflare] AI Gateway header patch installed "
        f"(gateway={resolve_cloudflare_gateway_id()})",
        file=sys.stderr,
        flush=True,
    )
    return True
