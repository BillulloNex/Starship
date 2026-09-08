"""Advertise a public MCP OAuth redirect URI instead of localhost.

FastMCP's OAuth helper always binds a loopback callback server and uses
``http://localhost:{port}/callback`` as ``redirect_uri``. That works on a
laptop; in the production container Google redirects the user's browser to
that localhost URL and the handshake dies with connection refused.

When ``GROKBOT_MCP_OAUTH_REDIRECT_URI`` is set (Coolify), rewrite the
advertised redirect URI used for both authorize and token exchange, and pin
the loopback listener to a fixed port so static-server can proxy
``GET /callback`` to it.
"""

from __future__ import annotations

import os
import sys
from typing import Any

DEFAULT_CALLBACK_PORT = 18765


def resolve_public_oauth_callback(
    env: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    source = os.environ if env is None else env
    redirect_uri = str(source.get("GROKBOT_MCP_OAUTH_REDIRECT_URI", "")).strip()
    if not redirect_uri:
        return None
    raw_port = str(
        source.get("GROKBOT_MCP_OAUTH_CALLBACK_PORT", DEFAULT_CALLBACK_PORT)
    ).strip()
    try:
        port = int(raw_port)
    except (TypeError, ValueError):
        port = DEFAULT_CALLBACK_PORT
    if port <= 0 or port > 65535:
        port = DEFAULT_CALLBACK_PORT
    return {"redirect_uri": redirect_uri, "callback_port": port}


def apply_public_oauth_callback(oauth: Any, config: dict[str, Any]) -> None:
    """Pin FastMCP's loopback listener before ``_bind`` chooses a random port."""
    oauth._callback_port = config["callback_port"]
    extra = dict(getattr(oauth, "_additional_client_metadata", None) or {})
    extra["redirect_uris"] = [config["redirect_uri"]]
    oauth._additional_client_metadata = extra


def rewrite_bound_redirect_uris(oauth: Any, redirect_uri: str) -> None:
    """Force the public URI onto every metadata object FastMCP may use."""
    urls: list[Any]
    try:
        from pydantic import AnyHttpUrl

        urls = [AnyHttpUrl(redirect_uri)]
    except Exception:
        urls = [redirect_uri]

    for obj in (
        getattr(oauth, "client_metadata", None),
        getattr(oauth, "_static_client_info", None),
        getattr(getattr(oauth, "context", None), "client_metadata", None),
        getattr(getattr(oauth, "context", None), "client_info", None),
    ):
        if obj is not None and hasattr(obj, "redirect_uris"):
            try:
                obj.redirect_uris = urls
            except Exception:
                continue


def install_fastmcp_public_callback_patch(
    env: dict[str, str] | None = None,
) -> bool:
    config = resolve_public_oauth_callback(env)
    if config is None:
        return False

    from fastmcp.client.auth.oauth import OAuth

    orig_bind = OAuth._bind

    def _bind(self, mcp_url: str) -> None:
        apply_public_oauth_callback(self, config)
        orig_bind(self, mcp_url)
        rewrite_bound_redirect_uris(self, config["redirect_uri"])

    OAuth._bind = _bind  # type: ignore[method-assign]
    print(
        "[grokbot-sitecustomize] MCP OAuth public callback -> "
        f"{config['redirect_uri']} (port {config['callback_port']})",
        file=sys.stderr,
        flush=True,
    )
    return True
