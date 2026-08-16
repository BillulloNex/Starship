"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

This runs via PYTHONPATH (auto-loaded by Python). ddtrace-run patches
modules before this runs, so LLMObs.enable() here is safe — it won't
conflict with ddtrace-run's APM patching.

Key insight: ddtrace-run patches litellm for APM traces, but does NOT
auto-enable LLMObs agentless mode. LLMObs.enable() must be called
explicitly for agentless operation.
"""
import os
import sys


def _init_llmobs():
    dd_api_key = os.environ.get("DD_API_KEY", "").strip()
    if not dd_api_key:
        return

    llmobs_flag = os.environ.get("DD_LLMOBS_ENABLED", "0").strip().lower()
    if llmobs_flag not in ("1", "true", "yes"):
        return

    site = os.environ.get("DD_SITE", "us5.datadoghq.com").strip()
    ml_app = os.environ.get("DD_LLMOBS_ML_APP", "grokbot").strip()
    agentless = os.environ.get("DD_LLMOBS_AGENTLESS_ENABLED", "1").strip().lower() in ("1", "true", "yes")

    try:
        from ddtrace.llmobs import LLMObs

        # Check if LLMObs was already initialized by ddtrace-run
        try:
            if LLMObs.enabled:
                print(
                    f"[grokbot-sitecustomize] LLMObs already enabled by ddtrace-run — skipping",
                    file=sys.stderr, flush=True,
                )
                return
        except AttributeError:
            pass  # .enabled may not exist in all versions

        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
        )
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK — "
            f"ml_app={ml_app}, site={site}, agentless={agentless}",
            file=sys.stderr, flush=True,
        )
    except Exception as e:
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )


_init_llmobs()
