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

_init_datadog_llmobs()
