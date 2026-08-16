"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

Auto-loaded by Python on startup (via PYTHONPATH=/opt/agent-canvas/tools).

Architecture:
  - ddtrace-run handles APM patching (litellm, httpx, etc.)
  - This file handles LLMObs initialization (agentless mode → llmobs-intake.{DD_SITE})
  - We do NOT call ddtrace.auto or patch() here — that would conflict with ddtrace-run.
  - We DO call LLMObs.enable() because ddtrace-run alone does not init LLMObs in
    agentless mode; it requires a programmatic call.
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

    # Log env state for debugging
    print(
        f"[grokbot-sitecustomize] DD env state: "
        f"DD_API_KEY={'set' if dd_api_key else 'MISSING'}, "
        f"DD_SITE={site}, "
        f"DD_LLMOBS_ENABLED={llmobs_flag}, "
        f"DD_LLMOBS_AGENTLESS_ENABLED={agentless}, "
        f"DD_LLMOBS_ML_APP={ml_app}, "
        f"DD_TRACE_ENABLED={os.environ.get('DD_TRACE_ENABLED', 'unset')}, "
        f"DD_TRACE_LITELLM_ENABLED={os.environ.get('DD_TRACE_LITELLM_ENABLED', 'unset')}, "
        f"DD_TRACE_OTEL_ENABLED={os.environ.get('DD_TRACE_OTEL_ENABLED', 'unset')}",
        file=sys.stderr, flush=True,
    )

    try:
        from ddtrace.llmobs import LLMObs

        # Check if LLMObs is already enabled (by ddtrace-run auto-config)
        if LLMObs.enabled:
            print(
                f"[grokbot-sitecustomize] LLMObs already enabled (by ddtrace-run), skipping duplicate init",
                file=sys.stderr, flush=True,
            )
            return

        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
        )
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK — "
            f"ml_app={ml_app}, site={site}, agentless={agentless}, "
            f"LLMObs.enabled={LLMObs.enabled}",
            file=sys.stderr, flush=True,
        )
    except AttributeError:
        # LLMObs.enabled may not exist in older versions, try enable anyway
        try:
            from ddtrace.llmobs import LLMObs
            LLMObs.enable(
                ml_app=ml_app,
                api_key=dd_api_key,
                site=site,
                agentless_enabled=agentless,
            )
            print(
                f"[grokbot-sitecustomize] LLMObs.enable() OK (no .enabled attr) — "
                f"ml_app={ml_app}, site={site}, agentless={agentless}",
                file=sys.stderr, flush=True,
            )
        except Exception as e:
            print(
                f"[grokbot-sitecustomize] LLMObs.enable() FAILED (fallback): {e}",
                file=sys.stderr, flush=True,
            )
    except Exception as e:
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )

    # Log ddtrace version for debugging
    try:
        import ddtrace
        print(
            f"[grokbot-sitecustomize] ddtrace version: {ddtrace.__version__}",
            file=sys.stderr, flush=True,
        )
    except Exception:
        pass

    # Log what integrations are patched
    try:
        from ddtrace import _monkey
        patched = _monkey.get_patched_modules()
        llm_related = {k: v for k, v in patched.items() if k in ('litellm', 'openai', 'anthropic', 'httpx')}
        print(
            f"[grokbot-sitecustomize] Patched LLM integrations: {llm_related}",
            file=sys.stderr, flush=True,
        )
    except Exception:
        pass


_init_llmobs()
