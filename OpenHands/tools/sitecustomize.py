"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

This module is auto-loaded via PYTHONPATH. It initializes Datadog LLMObs
in agentless mode using in-code setup (without ddtrace-run).

The approach: LLMObs.enable(integrations_enabled=True) patches litellm
and other LLM libraries automatically. We then explicitly patch litellm
as well to be safe.
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

        # Check if LLMObs was already initialized
        try:
            if LLMObs.enabled:
                print(
                    f"[grokbot-sitecustomize] LLMObs already enabled — skipping",
                    file=sys.stderr, flush=True,
                )
                return
        except AttributeError:
            pass

        # Enable LLMObs with auto-instrumentation of LLM integrations
        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
            integrations_enabled=True,  # Auto-patch litellm, openai, etc.
        )

        # Also explicitly patch litellm to be safe
        try:
            from ddtrace import patch
            patch(litellm=True)
            print(
                f"[grokbot-sitecustomize] ddtrace.patch(litellm=True) OK",
                file=sys.stderr, flush=True,
            )
        except Exception as e:
            print(
                f"[grokbot-sitecustomize] ddtrace.patch(litellm=True) failed: {e}",
                file=sys.stderr, flush=True,
            )

        enabled = getattr(LLMObs, 'enabled', 'unknown')
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK — "
            f"ml_app={ml_app}, site={site}, agentless={agentless}, "
            f"LLMObs.enabled={enabled}, integrations_enabled=True",
            file=sys.stderr, flush=True,
        )

        # Report ddtrace version
        try:
            import ddtrace
            print(
                f"[grokbot-sitecustomize] ddtrace={ddtrace.__version__}",
                file=sys.stderr, flush=True,
            )
        except Exception:
            pass

    except Exception as e:
        import traceback
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )
        traceback.print_exc(file=sys.stderr)


_init_llmobs()
