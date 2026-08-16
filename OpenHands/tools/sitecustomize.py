"""
Auto-initialization hook for Datadog LLM / Agent Observability.
Runs automatically on Python startup when /opt/agent-canvas/tools is on PYTHONPATH / sys.path.
"""
import os
import sys

def _init_datadog_llmobs():
    dd_api_key = os.environ.get("DD_API_KEY", "").strip()
    if not dd_api_key:
        return

    llmobs_enabled = os.environ.get("DD_LLMOBS_ENABLED", "1").lower() in ("1", "true", "yes")
    if not llmobs_enabled:
        return

    ml_app = os.environ.get("DD_LLMOBS_ML_APP", "grokbot").strip()
    site = os.environ.get("DD_SITE", "us5.datadoghq.com").strip()
    agentless = os.environ.get("DD_LLMOBS_AGENTLESS_ENABLED", "1").lower() in ("1", "true", "yes")

    # 1. Initialize ddtrace.auto & patches
    try:
        import ddtrace.auto
        from ddtrace import patch
        patch(litellm=True, openai=True, httpx=True, urllib3=True)
    except Exception as e:
        print(f"[grokbot] ddtrace patch warning: {e}", file=sys.stderr, flush=True)

    # 2. Initialize LLMObs
    try:
        from ddtrace.llmobs import LLMObs
        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
        )
        print(f"[grokbot] Datadog LLMObs enabled via sitecustomize (ml_app={ml_app}, site={site}, agentless={agentless})", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[grokbot] Failed to initialize Datadog LLMObs in sitecustomize: {e}", file=sys.stderr, flush=True)

    # 3. Configure LiteLLM callbacks
    try:
        import litellm
        if not hasattr(litellm, "success_callback"):
            litellm.success_callback = []
        if not hasattr(litellm, "failure_callback"):
            litellm.failure_callback = []

        for cb_list in [litellm.success_callback, litellm.failure_callback]:
            if "datadog_llm_observability" not in cb_list:
                cb_list.append("datadog_llm_observability")
        print(f"[grokbot] LiteLLM datadog_llm_observability callbacks registered", file=sys.stderr, flush=True)
    except Exception as e:
        pass

_init_datadog_llmobs()
