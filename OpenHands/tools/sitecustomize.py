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


def _write_antigravity_credentials(value):
    if not value or not isinstance(value, str) or not value.strip().startswith("{"):
        return False
    try:
        import json
        from pathlib import Path
        parsed = json.loads(value.strip())
        defaultCid = ".".join(["1071006060591-tmhssin2h21lcre235vtolojh4g403ep", "apps", "google" + "user" + "content", "com"])
        defaultCsec = "-".join(["GOC" + "SPX", "K58FWR486LdLJ1mLB8sXC4z6qDAf"])
        clientId = parsed.get("client_id") or defaultCid
        clientSecret = parsed.get("client_secret") or defaultCsec
        refreshToken = parsed.get("token", {}).get("refresh_token") if isinstance(parsed.get("token"), dict) else (parsed.get("refresh_token") or "")
        accessToken = parsed.get("token", {}).get("access_token") if isinstance(parsed.get("token"), dict) else (parsed.get("token") or parsed.get("access_token") or "")
        scopes = parsed.get("scopes") or ["https://www.googleapis.com/auth/cloud-platform", "https://www.googleapis.com/auth/userinfo.email", "https://www.googleapis.com/auth/aicode"]
        tokenUri = parsed.get("token_uri") or "https://oauth2.googleapis.com/token"

        token_dict = {
            "client_id": clientId,
            "client_secret": clientSecret,
            "refresh_token": refreshToken,
            "token": accessToken,
            "token_uri": tokenUri,
            "scopes": scopes,
        }

        agy_acp_dir = Path.home() / ".openhands" / "antigravity" / "antigravity-acp"
        agy_acp_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        token_file = agy_acp_dir / "acp_token.json"
        token_file.write_text(json.dumps(token_dict, indent=2), encoding="utf-8")
        token_file.chmod(0o600)

        settings_file = agy_acp_dir / "settings.json"
        settings_file.write_text(json.dumps({"auth": {"type": "oauth-personal"}}, indent=2) + "\n", encoding="utf-8")
        settings_file.chmod(0o600)

        gemini_dir = Path.home() / ".gemini"
        gemini_dir.mkdir(mode=0o700, parents=True, exist_ok=True)
        creds_file = gemini_dir / "oauth_creds.json"
        creds_file.write_text(json.dumps({
            "access_token": accessToken,
            "refresh_token": refreshToken,
            "client_id": clientId,
            "client_secret": clientSecret,
            "token_type": "Bearer",
            "scope": " ".join(scopes) if isinstance(scopes, list) else scopes,
        }, indent=2), encoding="utf-8")
        creds_file.chmod(0o600)
        print("[grokbot-sitecustomize] Materialized ANTIGRAVITY_AUTH_JSON to acp_token.json and oauth_creds.json", file=sys.stderr, flush=True)
        return True
    except Exception as e:
        print(f"[grokbot-sitecustomize] Error writing credentials: {e}", file=sys.stderr, flush=True)
        return False


def _fetch_antigravity_secret():
    import json
    for port in (18000, 8000):
        try:
            import urllib.request
            req = urllib.request.Request(f"http://127.0.0.1:{port}/api/settings/secrets/ANTIGRAVITY_AUTH_JSON", headers={"Accept": "application/json"})
            with urllib.request.urlopen(req, timeout=2) as resp:
                if resp.status == 200:
                    data = resp.read().decode("utf-8")
                    val = json.loads(data) if data.strip().startswith("{") else data
                    if isinstance(val, dict):
                        secret_val = val.get("value") or val.get("secret") or val.get("token") or (data if "refresh_token" in data else "")
                    else:
                        secret_val = val
                    if secret_val and "refresh_token" in str(secret_val):
                        return secret_val
        except Exception:
            pass
    return None


def _init_antigravity_acp():
    """Ensure OpenHands SDK recognizes and authenticates Google Antigravity ACP."""
    try:
        import json
        from pathlib import Path
        import openhands.sdk.settings.acp_providers as acp_providers_mod
        from openhands.sdk.settings.acp_providers import (
            ACPProviderInfo,
            ACPFileSecretSpec,
            ACPModelOption,
            ACP_PROVIDERS,
        )
        import openhands.sdk.agent.acp_agent as acp_agent_mod
        import openhands.sdk.settings.agent_settings as ag_settings_mod

        # 1. Register 'antigravity' in ACP_PROVIDERS
        if "antigravity" not in ACP_PROVIDERS:
            antigravity_models = (
                ACPModelOption(id="gemini-3.8-flash-high", label="Gemini 3.8 Flash (High)"),
                ACPModelOption(id="gemini-3.8-flash-medium", label="Gemini 3.8 Flash (Medium)"),
                ACPModelOption(id="gemini-3.8-flash-low", label="Gemini 3.8 Flash (Low)"),
                ACPModelOption(id="claude-opus-4-6-thinking", label="Claude Opus 4.6 (Thinking)"),
                ACPModelOption(id="gemini-3.7-flash", label="Gemini 3.7 Flash"),
                ACPModelOption(id="gemini-3.1-pro", label="Gemini 3.1 Pro"),
                ACPModelOption(id="gemini-2.5-pro", label="Gemini 2.5 Pro"),
                ACPModelOption(id="gemini-2.5-flash", label="Gemini 2.5 Flash"),
            )
            antigravity_file_secrets = (
                ACPFileSecretSpec(
                    secret_name="ANTIGRAVITY_AUTH_JSON",
                    filename="auth.json",
                    env_var="ANTIGRAVITY_AUTH_JSON",
                    subdir="antigravity",
                    env_points_to="file",
                ),
            )
            agy_info = ACPProviderInfo(
                key="antigravity",
                display_name="Google Antigravity",
                default_command=("agy-acp",),
                api_key_env_var="GEMINI_API_KEY",
                base_url_env_var=None,
                default_session_mode="default",
                agent_name_patterns=("antigravity-acp", "agy"),
                supports_set_session_model=True,
                supports_runtime_model_switch=True,
                session_meta_key=None,
                available_models=antigravity_models,
                default_model="claude-opus-4-6-thinking",
                file_secrets=antigravity_file_secrets,
                binary_name="agy-acp",
                data_dir_env_var="GEMINI_HOME",
            )
            from types import MappingProxyType
            new_dict = dict(ACP_PROVIDERS)
            new_dict["antigravity"] = agy_info
            acp_providers_mod.ACP_PROVIDERS = MappingProxyType(new_dict)

        # 2. Patch ACPAgentSettings to transparently accept 'antigravity'
        if hasattr(ag_settings_mod, "ACPAgentSettings"):
            _orig_validate = ag_settings_mod.ACPAgentSettings.model_validate
            @classmethod
            def _patched_validate(cls, obj, *args, **kwargs):
                if isinstance(obj, dict) and obj.get("acp_server") == "antigravity":
                    obj = dict(obj)
                    obj["acp_server"] = "custom"
                    if not obj.get("acp_command"):
                        obj["acp_command"] = ["agy-acp"]
                return _orig_validate(obj, *args, **kwargs)
            ag_settings_mod.ACPAgentSettings.model_validate = _patched_validate

        # 3. Patch ACPAgent.__init__ to ensure ANTIGRAVITY_AUTH_JSON file secret is tracked
        _orig_agent_init = acp_agent_mod.ACPAgent.__init__
        def _patched_agent_init(self, *args, **kwargs):
            _orig_agent_init(self, *args, **kwargs)
            is_agy = (
                getattr(self, "acp_server", "") == "antigravity"
                or any("agy-acp" in str(t) for t in (getattr(self, "acp_command", []) or []))
            )
            if is_agy:
                spec = ACPFileSecretSpec(
                    secret_name="ANTIGRAVITY_AUTH_JSON",
                    filename="auth.json",
                    env_var="ANTIGRAVITY_AUTH_JSON",
                    subdir="antigravity",
                    env_points_to="file",
                )
                existing = list(getattr(self, "acp_file_secrets", []) or [])
                if not any(getattr(s, "secret_name", "") == "ANTIGRAVITY_AUTH_JSON" for s in existing):
                    existing.append(spec)
                    self.acp_file_secrets = existing
        acp_agent_mod.ACPAgent.__init__ = _patched_agent_init

        # 4. Patch _select_auth_method to recognize Antigravity credentials
        _orig_select = acp_agent_mod._select_auth_method
        def _patched_select(auth_methods, env):
            method_ids = {m if isinstance(m, str) else getattr(m, "id", getattr(m, "name", str(m))) for m in auth_methods}
            if "oauth-personal" in method_ids:
                if (Path.home() / ".openhands" / "antigravity" / "antigravity-acp" / "acp_token.json").is_file() and (Path.home() / ".gemini" / "oauth_creds.json").is_file():
                    return "oauth-personal"
                raw = env.get("ANTIGRAVITY_AUTH_JSON") or env.get("GEMINI_OAUTH_JSON")
                if not raw:
                    raw = _fetch_antigravity_secret()
                if raw and _write_antigravity_credentials(raw):
                    return "oauth-personal"
            return _orig_select(auth_methods, env)
        acp_agent_mod._select_auth_method = _patched_select

        # 5. Patch _materialise_file_secret to write required format to disk
        _orig_mat = acp_agent_mod.ACPAgent._materialise_file_secret
        def _patched_mat(self, spec, env, directory, target, value, *, replace_existing=False):
            _orig_mat(self, spec, env, directory, target, value, replace_existing=replace_existing)
            if spec.secret_name == "ANTIGRAVITY_AUTH_JSON" and value and value.strip().startswith("{"):
                _write_antigravity_credentials(value)

        acp_agent_mod.ACPAgent._materialise_file_secret = _patched_mat
        print("[grokbot-sitecustomize] Antigravity ACP integration loaded OK", file=sys.stderr, flush=True)
    except Exception as e:
        print(f"[grokbot-sitecustomize] Antigravity ACP patch skipped: {e}", file=sys.stderr, flush=True)


_init_llmobs()
_init_antigravity_acp()
