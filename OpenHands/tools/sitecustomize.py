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
        # ── Step 1: Patch ALL integrations first (before any imports) ──
        # This must happen before litellm or openai is imported anywhere.
        from ddtrace import patch_all, patch
        patch_all()
        print(
            f"[grokbot-sitecustomize] ddtrace.patch_all() OK",
            file=sys.stderr, flush=True,
        )

        # Also explicit litellm patch
        try:
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

        # ── Step 2: Enable LLMObs ──
        from ddtrace.llmobs import LLMObs

        try:
            if LLMObs.enabled:
                print(
                    f"[grokbot-sitecustomize] LLMObs already enabled — skipping",
                    file=sys.stderr, flush=True,
                )
                return
        except AttributeError:
            pass

        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
            integrations_enabled=True,
        )

        enabled = getattr(LLMObs, 'enabled', 'unknown')
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK — "
            f"ml_app={ml_app}, site={site}, agentless={agentless}, "
            f"LLMObs.enabled={enabled}",
            file=sys.stderr, flush=True,
        )

        # ── Step 3: Report ddtrace version ──
        try:
            import ddtrace
            print(
                f"[grokbot-sitecustomize] ddtrace={ddtrace.__version__}",
                file=sys.stderr, flush=True,
            )
        except Exception:
            pass

        # ── Step 4: Verify litellm patch status ──
        # Check if litellm is importable and if its functions are wrapped
        try:
            import litellm
            comp_wrapped = hasattr(litellm.completion, '__wrapped__') or 'datadog' in str(type(litellm.completion)).lower()
            acomp_wrapped = hasattr(litellm.acompletion, '__wrapped__') or 'datadog' in str(type(litellm.acompletion)).lower()
            print(
                f"[grokbot-sitecustomize] litellm.completion wrapped={comp_wrapped}, "
                f"litellm.acompletion wrapped={acomp_wrapped}, "
                f"litellm={litellm.__version__}",
                file=sys.stderr, flush=True,
            )
            # Check the actual types
            print(
                f"[grokbot-sitecustomize] litellm.completion type={type(litellm.completion)}, "
                f"litellm.acompletion type={type(litellm.acompletion)}",
                file=sys.stderr, flush=True,
            )
        except ImportError:
            print(
                f"[grokbot-sitecustomize] litellm not importable in this env",
                file=sys.stderr, flush=True,
            )
        except Exception as e:
            print(
                f"[grokbot-sitecustomize] litellm check error: {e}",
                file=sys.stderr, flush=True,
            )

    except Exception as e:
        import traceback
        print(
            f"[grokbot-sitecustomize] init FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )
        traceback.print_exc(file=sys.stderr)


_init_llmobs()
