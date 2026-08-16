"""
Grokbot sitecustomize — Diagnostic logging only.

LLMObs is initialized by ddtrace-run via environment variables:
  - DD_LLMOBS_ENABLED=1
  - DD_LLMOBS_ML_APP=grokbot
  - DD_LLMOBS_AGENTLESS_ENABLED=1
  - DD_API_KEY=<key>
  - DD_SITE=us5.datadoghq.com

We do NOT call LLMObs.enable() here — ddtrace-run handles it natively
when DD_LLMOBS_ENABLED=1 is set. Calling it in sitecustomize.py may
conflict with ddtrace-run's initialization order.
"""
import os
import sys


def _diag():
    dd_api_key = os.environ.get("DD_API_KEY", "").strip()
    if not dd_api_key:
        return

    print(
        f"[grokbot-sitecustomize] DD env state: "
        f"DD_API_KEY={'set' if dd_api_key else 'MISSING'}, "
        f"DD_SITE={os.environ.get('DD_SITE', 'unset')}, "
        f"DD_LLMOBS_ENABLED={os.environ.get('DD_LLMOBS_ENABLED', 'unset')}, "
        f"DD_LLMOBS_AGENTLESS_ENABLED={os.environ.get('DD_LLMOBS_AGENTLESS_ENABLED', 'unset')}, "
        f"DD_LLMOBS_ML_APP={os.environ.get('DD_LLMOBS_ML_APP', 'unset')}, "
        f"DD_TRACE_ENABLED={os.environ.get('DD_TRACE_ENABLED', 'unset')}, "
        f"DD_TRACE_LITELLM_ENABLED={os.environ.get('DD_TRACE_LITELLM_ENABLED', 'unset')}, "
        f"DD_TRACE_OTEL_ENABLED={os.environ.get('DD_TRACE_OTEL_ENABLED', 'unset')}, "
        f"DD_TRACE_DEBUG={os.environ.get('DD_TRACE_DEBUG', 'unset')}",
        file=sys.stderr, flush=True,
    )


_diag()
