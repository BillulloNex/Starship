"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

This module is auto-loaded via PYTHONPATH. It initializes Datadog LLMObs
in agentless mode using in-code setup (without ddtrace-run).
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
            integrations_enabled=True,
        )

        # Also explicitly patch litellm
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

        # ── Send a test span to verify the full pipeline ──
        # This creates a minimal LLM span at startup. If this appears in
        # Datadog, the pipeline is working end-to-end.
        try:
            import threading

            def _send_test_span():
                import time
                time.sleep(5)  # Let the server finish starting up
                try:
                    with LLMObs.llm(
                        model_name="test-model",
                        name="grokbot.startup_test",
                        model_provider="test",
                    ) as span:
                        LLMObs.annotate(
                            span=span,
                            input_data=[{"role": "user", "content": "startup test"}],
                            output_data=[{"role": "assistant", "content": "pipeline verified"}],
                        )
                    print(
                        f"[grokbot-sitecustomize] Test LLMObs span sent successfully",
                        file=sys.stderr, flush=True,
                    )

                    # Force flush to ensure the span is sent immediately
                    try:
                        LLMObs.flush()
                        print(
                            f"[grokbot-sitecustomize] LLMObs.flush() OK",
                            file=sys.stderr, flush=True,
                        )
                    except Exception as flush_err:
                        print(
                            f"[grokbot-sitecustomize] LLMObs.flush() failed: {flush_err}",
                            file=sys.stderr, flush=True,
                        )
                except Exception as span_err:
                    print(
                        f"[grokbot-sitecustomize] Test span FAILED: {type(span_err).__name__}: {span_err}",
                        file=sys.stderr, flush=True,
                    )

            t = threading.Thread(target=_send_test_span, daemon=True)
            t.start()
        except Exception as thread_err:
            print(
                f"[grokbot-sitecustomize] Test span thread failed: {thread_err}",
                file=sys.stderr, flush=True,
            )

    except Exception as e:
        import traceback
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )
        traceback.print_exc(file=sys.stderr)


_init_llmobs()
