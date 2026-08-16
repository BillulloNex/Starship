"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

This module is auto-loaded via PYTHONPATH. It initializes Datadog LLMObs
in agentless mode using in-code setup (without ddtrace-run).

IMPORTANT: Do NOT use patch_all() — it starts a full APM tracer that tries
to connect to localhost:8126 and interferes with agentless LLMObs.
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

        # Check if already initialized
        try:
            if LLMObs.enabled:
                print(
                    f"[grokbot-sitecustomize] LLMObs already enabled — skipping",
                    file=sys.stderr, flush=True,
                )
                return
        except AttributeError:
            pass

        # Enable LLMObs with integrations (this patches litellm internally)
        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
            integrations_enabled=True,
        )
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK",
            file=sys.stderr, flush=True,
        )

    except Exception as e:
        import traceback
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )
        traceback.print_exc(file=sys.stderr)
        return

    # Explicitly patch litellm (belt & suspenders)
    try:
        from ddtrace import patch
        patch(litellm=True)
        print(
            f"[grokbot-sitecustomize] ddtrace.patch(litellm=True) OK",
            file=sys.stderr, flush=True,
        )
    except Exception as e:
        print(
            f"[grokbot-sitecustomize] ddtrace.patch(litellm=True) skipped: {e}",
            file=sys.stderr, flush=True,
        )

    # Report versions
    try:
        import ddtrace
        print(
            f"[grokbot-sitecustomize] ddtrace={ddtrace.__version__}",
            file=sys.stderr, flush=True,
        )
    except Exception:
        pass

    # ── Diagnostic: check if litellm functions are actually wrapped ──
    try:
        import litellm
        print(
            f"[grokbot-sitecustomize] litellm={litellm.__version__}, "
            f"completion={type(litellm.completion).__name__}, "
            f"acompletion={type(litellm.acompletion).__name__}",
            file=sys.stderr, flush=True,
        )
    except ImportError:
        print(
            f"[grokbot-sitecustomize] litellm not importable",
            file=sys.stderr, flush=True,
        )
    except Exception as e:
        print(
            f"[grokbot-sitecustomize] litellm check: {e}",
            file=sys.stderr, flush=True,
        )

    # ── Send a one-time test span to verify pipeline ──
    try:
        import threading

        def _send_test_span():
            import time
            time.sleep(5)
            try:
                with LLMObs.llm(
                    model_name="test-model",
                    name="grokbot.v0718_pipeline_test",
                    model_provider="test",
                ) as span:
                    LLMObs.annotate(
                        span=span,
                        input_data=[{"role": "user", "content": "v0.7.18 pipeline test"}],
                        output_data=[{"role": "assistant", "content": "pipeline working"}],
                    )
                LLMObs.flush()
                print(
                    f"[grokbot-sitecustomize] Test span sent + flushed OK",
                    file=sys.stderr, flush=True,
                )
            except Exception as e:
                print(
                    f"[grokbot-sitecustomize] Test span FAILED: {e}",
                    file=sys.stderr, flush=True,
                )

        t = threading.Thread(target=_send_test_span, daemon=True)
        t.start()
    except Exception as e:
        print(
            f"[grokbot-sitecustomize] Test span thread: {e}",
            file=sys.stderr, flush=True,
        )


_init_llmobs()
