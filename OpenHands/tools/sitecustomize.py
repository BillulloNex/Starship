"""
Auto-initialization hook for Datadog LLM / Agent Observability.
Runs automatically on Python startup when /opt/agent-canvas/tools is on PYTHONPATH / sys.path.
Wraps LiteLLM and OpenHands agent calls to generate first-class Datadog LLMObs spans.
"""
import os
import sys
import time

def setup_datadog_llmobs():
    dd_api_key = os.environ.get("DD_API_KEY", "").strip()
    if not dd_api_key:
        return

    llmobs_enabled = os.environ.get("DD_LLMOBS_ENABLED", "1").lower() in ("1", "true", "yes")
    if not llmobs_enabled:
        return

    site = os.environ.get("DD_SITE", "us5.datadoghq.com").strip()
    ml_app = os.environ.get("DD_LLMOBS_ML_APP", "grokbot").strip()
    agentless = os.environ.get("DD_LLMOBS_AGENTLESS_ENABLED", "1").lower() in ("1", "true", "yes")

    # 1. Initialize ddtrace
    try:
        import ddtrace.auto
        from ddtrace import patch
        patch(litellm=True, openai=True, httpx=True, urllib3=True)
    except Exception as e:
        print(f"[grokbot] ddtrace patch warning: {e}", file=sys.stderr, flush=True)

    # 2. Initialize LLMObs
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
        return

    # 3. Intercept litellm.acompletion to guarantee LLMObs spans
    try:
        import litellm
        original_acompletion = litellm.acompletion

        async def traced_acompletion(*args, **kwargs):
            model = kwargs.get("model", "unknown")
            messages = kwargs.get("messages", [])
            try:
                response = await original_acompletion(*args, **kwargs)
                try:
                    output_text = ""
                    usage_metrics = {}
                    if hasattr(response, "choices") and response.choices:
                        choice = response.choices[0]
                        if hasattr(choice, "message") and hasattr(choice.message, "content"):
                            output_text = choice.message.content or ""
                    elif hasattr(response, "text"):
                        output_text = response.text or ""

                    if hasattr(response, "usage") and response.usage:
                        usage_metrics = {
                            "input_tokens": getattr(response.usage, "prompt_tokens", 0) or 0,
                            "output_tokens": getattr(response.usage, "completion_tokens", 0) or 0,
                            "total_tokens": getattr(response.usage, "total_tokens", 0) or 0,
                        }

                    formatted_inputs = []
                    if isinstance(messages, list):
                        for m in messages:
                            if isinstance(m, dict):
                                formatted_inputs.append({"role": m.get("role", "user"), "content": str(m.get("content", ""))[:2000]})
                            else:
                                formatted_inputs.append({"role": "user", "content": str(m)[:2000]})
                    else:
                        formatted_inputs = [{"role": "user", "content": str(messages)[:2000]}]

                    with LLMObs.llm(model_name=str(model), name="agent_completion", model_provider="litellm") as span:
                        LLMObs.annotate(
                            span=span,
                            input_data=formatted_inputs,
                            output_data=[{"role": "assistant", "content": str(output_text)[:4000]}],
                            metrics=usage_metrics if usage_metrics else None,
                        )
                    LLMObs.flush()
                except Exception as log_err:
                    print(f"[grokbot] LLMObs trace recording error: {log_err}", file=sys.stderr, flush=True)
                return response
            except Exception as e:
                try:
                    with LLMObs.llm(model_name=str(model), name="agent_completion", model_provider="litellm") as span:
                        LLMObs.annotate(
                            span=span,
                            input_data=str(messages)[:2000],
                            error=str(e),
                        )
                    LLMObs.flush()
                except Exception:
                    pass
                raise

        litellm.acompletion = traced_acompletion
        print("[grokbot] Successfully wrapped litellm.acompletion with Datadog LLMObs tracer", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[grokbot] Failed to wrap litellm: {e}", file=sys.stderr, flush=True)

setup_datadog_llmobs()
