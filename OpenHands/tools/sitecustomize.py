"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

This module is auto-loaded via PYTHONPATH. It initializes Datadog LLMObs
in agentless mode and monkey-patches litellm.completion / litellm.acompletion
to create manual LLMObs spans for every LLM call.

Why monkey-patching instead of litellm callbacks?
  - OpenHands reinitializes litellm's callback lists, so callbacks
    registered at startup are lost by the time actual LLM calls happen.
  - Monkey-patching the functions themselves is immune to callback resets.
"""
import os
import sys
import functools
import time


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

    # ── Step 1: Enable LLMObs ──
    try:
        from ddtrace.llmobs import LLMObs
        import ddtrace

        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
            integrations_enabled=True,
        )
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK — ml_app={ml_app}, "
            f"site={site}, agentless={agentless}",
            file=sys.stderr, flush=True,
        )
        print(
            f"[grokbot-sitecustomize] ddtrace={ddtrace.__version__}",
            file=sys.stderr, flush=True,
        )
    except Exception as e:
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {e}",
            file=sys.stderr, flush=True,
        )
        return

    # ── Step 2: Monkey-patch litellm functions ──
    # Instead of relying on litellm's callback system (which OpenHands may
    # reinitialize), we wrap the actual functions to guarantee interception.
    try:
        import litellm

        lv = getattr(litellm, "__version__", "unknown")

        # ── Register Kimi K3 (Moonshot AI) pricing for cost tracking ──
        # Official API prices: $3/M input, $15/M output.
        # Self-hosted on Modal so actual cost differs, but this gives
        # directional visibility in observability dashboards.
        try:
            litellm.register_model({
                "openai/kimi-k3": {
                    "max_tokens": 1048576,
                    "max_input_tokens": 1048576,
                    "max_output_tokens": 65536,
                    "input_cost_per_token": 0.000003,    # $3.00 / 1M
                    "output_cost_per_token": 0.000015,   # $15.00 / 1M
                    "litellm_provider": "openai",
                },
            })
            print(
                "[grokbot-sitecustomize] Kimi K3 pricing registered: "
                "$3/M input, $15/M output",
                file=sys.stderr, flush=True,
            )
        except Exception as e:
            print(
                f"[grokbot-sitecustomize] Kimi K3 pricing registration failed: {e}",
                file=sys.stderr, flush=True,
            )

        def _create_llmobs_span(kwargs, response_obj):
            """Create an LLMObs span from a completed litellm call."""
            try:
                from ddtrace.llmobs import LLMObs

                model = kwargs.get("model", "unknown")
                messages = kwargs.get("messages", [])
                provider = kwargs.get("custom_llm_provider", "litellm")

                # Extract output text
                output_text = ""
                if hasattr(response_obj, "choices") and response_obj.choices:
                    choice = response_obj.choices[0]
                    if hasattr(choice, "message"):
                        output_text = getattr(choice.message, "content", "") or ""

                # Extract token usage
                prompt_tokens = 0
                completion_tokens = 0
                total_tokens = 0
                usage = getattr(response_obj, "usage", None)
                if usage:
                    prompt_tokens = getattr(usage, "prompt_tokens", 0) or 0
                    completion_tokens = getattr(usage, "completion_tokens", 0) or 0
                    total_tokens = getattr(usage, "total_tokens", 0) or 0

                # Build input data for LLMObs
                input_data = []
                for msg in messages:
                    if isinstance(msg, dict):
                        input_data.append({
                            "role": msg.get("role", "user"),
                            "content": str(msg.get("content", ""))[:4096],
                        })

                output_data = output_text[:4096] if output_text else ""

                with LLMObs.llm(
                    model_name=model,
                    name="litellm.completion",
                    model_provider=provider,
                ) as span:
                    LLMObs.annotate(
                        span=span,
                        input_data=input_data,
                        output_data=output_data,
                        metrics={
                            "input_tokens": prompt_tokens,
                            "output_tokens": completion_tokens,
                            "total_tokens": total_tokens,
                        },
                    )

                print(
                    f"[grokbot-dd-obs] span OK model={model} "
                    f"tokens={prompt_tokens}+{completion_tokens}",
                    file=sys.stderr, flush=True,
                )

            except Exception as e:
                import traceback
                print(
                    f"[grokbot-dd-obs] span error: {type(e).__name__}: {e}",
                    file=sys.stderr, flush=True,
                )
                traceback.print_exc(file=sys.stderr)

        # ── Patch litellm.completion ──
        _original_completion = litellm.completion

        @functools.wraps(_original_completion)
        def _patched_completion(*args, **kwargs):
            print(
                f"[grokbot-dd-obs] completion() called model={kwargs.get('model', args[0] if args else '?')}",
                file=sys.stderr, flush=True,
            )
            result = _original_completion(*args, **kwargs)
            _create_llmobs_span(kwargs, result)
            return result

        litellm.completion = _patched_completion

        # ── Patch litellm.acompletion ──
        _original_acompletion = litellm.acompletion

        @functools.wraps(_original_acompletion)
        async def _patched_acompletion(*args, **kwargs):
            print(
                f"[grokbot-dd-obs] acompletion() called model={kwargs.get('model', args[0] if args else '?')}",
                file=sys.stderr, flush=True,
            )
            result = await _original_acompletion(*args, **kwargs)
            _create_llmobs_span(kwargs, result)
            return result

        litellm.acompletion = _patched_acompletion

        # ── Also patch litellm.text_completion if it exists ──
        if hasattr(litellm, "text_completion"):
            _original_text_completion = litellm.text_completion

            @functools.wraps(_original_text_completion)
            def _patched_text_completion(*args, **kwargs):
                print(
                    f"[grokbot-dd-obs] text_completion() called",
                    file=sys.stderr, flush=True,
                )
                result = _original_text_completion(*args, **kwargs)
                _create_llmobs_span(kwargs, result)
                return result

            litellm.text_completion = _patched_text_completion

        print(
            f"[grokbot-sitecustomize] litellm monkey-patched OK "
            f"(litellm={lv}, completion/acompletion wrapped)",
            file=sys.stderr, flush=True,
        )

    except ImportError as e:
        print(
            f"[grokbot-sitecustomize] litellm patch skipped (import error): {e}",
            file=sys.stderr, flush=True,
        )
    except Exception as e:
        import traceback
        print(
            f"[grokbot-sitecustomize] litellm patch FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )
        traceback.print_exc(file=sys.stderr)


_init_llmobs()
