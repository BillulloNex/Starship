"""
Grokbot sitecustomize — Datadog LLM Observability initialization with diagnostics.

This runs via PYTHONPATH (auto-loaded by Python). ddtrace-run patches
modules before this runs, so LLMObs.enable() here is safe.
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

    # 1. Validate the API key against Datadog API
    try:
        import urllib.request
        import json
        validate_url = f"https://api.{site}/api/v1/validate?api_key={dd_api_key}"
        req = urllib.request.Request(validate_url, method="GET")
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read())
            valid = body.get("valid", False)
            print(
                f"[grokbot-sitecustomize] DD_API_KEY validation: {body}",
                file=sys.stderr, flush=True,
            )
            if not valid:
                print(
                    f"[grokbot-sitecustomize] ERROR: DD_API_KEY is INVALID — LLMObs will not work",
                    file=sys.stderr, flush=True,
                )
                return
    except Exception as e:
        print(
            f"[grokbot-sitecustomize] DD_API_KEY validation failed: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )

    # 2. Initialize LLMObs
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
            pass

        LLMObs.enable(
            ml_app=ml_app,
            api_key=dd_api_key,
            site=site,
            agentless_enabled=agentless,
        )

        # Check if it's truly enabled
        enabled = getattr(LLMObs, 'enabled', 'unknown')
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() OK — "
            f"ml_app={ml_app}, site={site}, agentless={agentless}, "
            f"LLMObs.enabled={enabled}",
            file=sys.stderr, flush=True,
        )

        # 3. Report ddtrace version
        try:
            import ddtrace
            print(
                f"[grokbot-sitecustomize] ddtrace={ddtrace.__version__}",
                file=sys.stderr, flush=True,
            )
        except Exception:
            pass

        # 4. Check the LLMObs writer/exporter status
        try:
            writer = getattr(LLMObs, '_instance', None)
            if writer:
                # Try to inspect the internal writer
                span_writer = getattr(writer, '_llmobs_span_writer', None)
                eval_writer = getattr(writer, '_llmobs_eval_metric_writer', None)
                print(
                    f"[grokbot-sitecustomize] LLMObs internals: "
                    f"_instance={type(writer).__name__}, "
                    f"span_writer={type(span_writer).__name__ if span_writer else 'None'}, "
                    f"eval_writer={type(eval_writer).__name__ if eval_writer else 'None'}",
                    file=sys.stderr, flush=True,
                )
                if span_writer:
                    intake_url = getattr(span_writer, '_intake_url', 'unknown')
                    print(
                        f"[grokbot-sitecustomize] LLMObs span_writer intake_url={intake_url}",
                        file=sys.stderr, flush=True,
                    )
            else:
                print(
                    f"[grokbot-sitecustomize] WARNING: LLMObs._instance is None — "
                    f"LLMObs may not be fully initialized",
                    file=sys.stderr, flush=True,
                )
        except Exception as e:
            print(
                f"[grokbot-sitecustomize] LLMObs internals check error: {e}",
                file=sys.stderr, flush=True,
            )

    except Exception as e:
        print(
            f"[grokbot-sitecustomize] LLMObs.enable() FAILED: {type(e).__name__}: {e}",
            file=sys.stderr, flush=True,
        )


_init_llmobs()
