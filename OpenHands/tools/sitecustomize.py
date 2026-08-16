"""
Grokbot sitecustomize — Datadog LLM Observability initialization.

This module is auto-loaded via PYTHONPATH. It initializes Datadog LLMObs
in agentless mode and registers a custom litellm callback that creates
manual LLMObs spans for every LLM call.

Why a custom callback instead of ddtrace.patch(litellm=True)?
  - ddtrace's auto-patching patches litellm.completion/acompletion at the
    module level, but OpenHands SDK imports litellm through its own
    abstraction layer, bypassing the patched functions.
  - litellm's callback system (litellm.callbacks) fires for ALL LLM calls
    regardless of how litellm is invoked.
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

    # ── Step 1: Enable LLMObs ──
    try:
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
            integrations_enabled=False,  # We handle it via custom callback
        )
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK — "
            f"ml_app={ml_app}, site={site}, agentless={agentless}",
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

    # Report ddtrace version
    try:
        import ddtrace
        print(
            f"[grokbot-sitecustomize] ddtrace={ddtrace.__version__}",
            file=sys.stderr, flush=True,
        )
    except Exception:
        pass

    # ── Step 2: Register custom litellm callback ──
    try:
        import litellm
        from litellm.integrations.custom_logger import CustomLogger

        class DatadogLLMObsCallback(CustomLogger):
            """litellm callback that creates Datadog LLMObs spans."""

            def _create_span(self, kwargs, response_obj, start_time, end_time):
                """Create an LLMObs span from a litellm call."""
                try:
                    print(
                        f"[grokbot-dd-callback] _create_span called! "
                        f"model={kwargs.get('model', '?')}",
                        file=sys.stderr, flush=True,
                    )
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
                    if hasattr(response_obj, "usage") and response_obj.usage:
                        prompt_tokens = getattr(response_obj.usage, "prompt_tokens", 0) or 0
                        completion_tokens = getattr(response_obj.usage, "completion_tokens", 0) or 0

                    # Build input_data in the format LLMObs expects
                    input_data = []
                    for msg in messages:
                        if isinstance(msg, dict):
                            input_data.append({
                                "role": msg.get("role", "user"),
                                "content": str(msg.get("content", "")),
                            })

                    # Build output_data
                    output_data = output_text if output_text else "No output"

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
                                "total_tokens": prompt_tokens + completion_tokens,
                            },
                        )

                    print(
                        f"[grokbot-dd-callback] span created OK "
                        f"model={model} tokens={prompt_tokens}+{completion_tokens}",
                        file=sys.stderr, flush=True,
                    )

                except Exception as e:
                    import traceback
                    print(
                        f"[grokbot-dd-callback] span creation error: {type(e).__name__}: {e}",
                        file=sys.stderr, flush=True,
                    )
                    traceback.print_exc(file=sys.stderr)

            def log_success_event(self, kwargs, response_obj, start_time, end_time):
                """Sync success callback."""
                self._create_span(kwargs, response_obj, start_time, end_time)

            async def async_log_success_event(self, kwargs, response_obj, start_time, end_time):
                """Async success callback — called for litellm.acompletion."""
                print(
                    f"[grokbot-dd-callback] async_log_success_event fired",
                    file=sys.stderr, flush=True,
                )
                self._create_span(kwargs, response_obj, start_time, end_time)

            def log_failure_event(self, kwargs, response_obj, start_time, end_time):
                """Sync failure callback."""
                try:
                    model = kwargs.get("model", "unknown")
                    error_msg = str(kwargs.get("exception", "unknown error"))
                    with LLMObs.llm(
                        model_name=model,
                        name="litellm.completion",
                        model_provider=kwargs.get("custom_llm_provider", "litellm"),
                    ) as span:
                        LLMObs.annotate(
                            span=span,
                            input_data=[{"role": "user", "content": "error"}],
                            output_data=f"ERROR: {error_msg}",
                        )
                except Exception:
                    pass

            async def async_log_failure_event(self, kwargs, response_obj, start_time, end_time):
                """Async failure callback."""
                self.log_failure_event(kwargs, response_obj, start_time, end_time)

        # Register the callback via multiple mechanisms for compatibility
        callback_instance = DatadogLLMObsCallback()

        # Method 1: litellm.callbacks (newer litellm)
        if not hasattr(litellm, "callbacks") or litellm.callbacks is None:
            litellm.callbacks = []
        litellm.callbacks.append(callback_instance)

        # Method 2: litellm.success_callback / failure_callback (older litellm)
        if hasattr(litellm, "success_callback"):
            if not isinstance(litellm.success_callback, list):
                litellm.success_callback = []
            litellm.success_callback.append(callback_instance)

        if hasattr(litellm, "failure_callback"):
            if not isinstance(litellm.failure_callback, list):
                litellm.failure_callback = []
            litellm.failure_callback.append(callback_instance)

        # Log litellm version and callback state
        lv = getattr(litellm, "__version__", "unknown")
        cb_count = len(litellm.callbacks) if hasattr(litellm, "callbacks") else 0
        sc_count = len(litellm.success_callback) if hasattr(litellm, "success_callback") and isinstance(litellm.success_callback, list) else 0

        print(
            f"[grokbot-sitecustomize] Datadog LLMObs callback registered "
            f"(litellm={lv}, callbacks={cb_count}, success_callback={sc_count})",
            file=sys.stderr, flush=True,
        )

    except ImportError as e:
        print(
            f"[grokbot-sitecustomize] litellm callback setup skipped (import error): {e}",
            file=sys.stderr, flush=True,
        )
    except Exception as e:
        import traceback
        print(
            f"[grokbot-sitecustomize] litellm callback setup FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )
        traceback.print_exc(file=sys.stderr)


_init_llmobs()
