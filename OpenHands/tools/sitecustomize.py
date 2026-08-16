"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

Auto-loaded by Python on startup (via PYTHONPATH=/opt/agent-canvas/tools).

Architecture:
  - ddtrace-run handles APM patching (litellm, httpx, etc.)
  - This file handles LLMObs initialization (agentless mode → llmobs-intake.{DD_SITE})
  - We do NOT call ddtrace.auto or patch() here — that would conflict with ddtrace-run.
  - We DO call LLMObs.enable() because ddtrace-run alone does not init LLMObs in
    agentless mode; it requires a programmatic call or DD_LLMOBS_AGENTLESS_ENABLED=1
    plus an explicit enable.

The OTEL_EXPORTER_OTLP_ENDPOINT env var is set to Langfuse for OpenHands' native
OTEL spans. DD_TRACE_OTEL_ENABLED=false prevents ddtrace from using that endpoint.
LLMObs sends data to llmobs-intake.{DD_SITE} independently.
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
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {e}",
            file=sys.stderr, flush=True,
        )


_init_llmobs()
