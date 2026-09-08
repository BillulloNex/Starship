"""Advertise a public MCP OAuth redirect URI instead of localhost.

FastMCP's OAuth helper binds a loopback callback server and uses
``http://localhost:{port}/callback`` as ``redirect_uri``. In production that
sends the user's browser to their laptop after Google Allow.

Enable whenever ``GROKBOT_MCP_OAUTH_REDIRECT_URI`` is set, or whenever the
server-side Google OAuth client is present (Starship production). Pin the
loopback listener to a fixed port so static-server can proxy ``GET /callback``.
"""

from __future__ import annotations

import os
import sys
import threading
import time
from typing import Any

DEFAULT_CALLBACK_PORT = 18765
DEFAULT_PUBLIC_REDIRECT_URI = "https://ship.beenex.org/callback"


def resolve_public_oauth_callback(
    env: dict[str, str] | None = None,
) -> dict[str, Any] | None:
    source = os.environ if env is None else env
    flag = str(source.get("GROKBOT_MCP_OAUTH_PUBLIC_CALLBACK", "1")).strip().lower()
    if flag in ("0", "false", "no", "off"):
        return None
    redirect_uri = str(source.get("GROKBOT_MCP_OAUTH_REDIRECT_URI", "")).strip()
    if not redirect_uri:
        if not str(source.get("GOOGLE_OAUTH_CLIENT_ID", "")).strip():
            return None
        redirect_uri = DEFAULT_PUBLIC_REDIRECT_URI
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
    """Pin FastMCP's loopback listener. Do not set redirect_uris here.

    FastMCP passes ``redirect_uris`` as a named argument to
    ``OAuthClientMetadata``, so putting the same key in
    ``additional_client_metadata`` raises TypeError.
    """
    oauth._callback_port = config["callback_port"]


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


def _patch_fastmcp_oauth(config: dict[str, Any]) -> None:
    from fastmcp.client.auth.oauth import OAuth

    orig_init = OAuth.__init__

    def _init(self, *args: Any, **kwargs: Any) -> None:
        kwargs["callback_port"] = kwargs.get("callback_port") or config["callback_port"]
        orig_init(self, *args, **kwargs)
        apply_public_oauth_callback(self, config)
        rewrite_bound_redirect_uris(self, config["redirect_uri"])

    OAuth.__init__ = _init  # type: ignore[method-assign]

    orig_bind = getattr(OAuth, "_bind", None)
    if callable(orig_bind):

        def _bind(self, mcp_url: str) -> None:
            apply_public_oauth_callback(self, config)
            orig_bind(self, mcp_url)
            rewrite_bound_redirect_uris(self, config["redirect_uri"])
            print(
                "[grokbot-sitecustomize] FastMCP OAuth bound "
                f"redirect_uri={config['redirect_uri']} port={self.redirect_port}",
                file=sys.stderr,
                flush=True,
            )

        OAuth._bind = _bind  # type: ignore[method-assign]


def _patch_mcp_router(config: dict[str, Any]) -> bool:
    from openhands.agent_server import mcp_router

    orig = getattr(mcp_router, "_oauth_auth_from_authentication", None)
    if not callable(orig) or getattr(orig, "_grokbot_public_callback", False):
        return False

    def wrapped(authentication, *args: Any, **kwargs: Any):
        oauth = orig(authentication, *args, **kwargs)
        apply_public_oauth_callback(oauth, config)
        rewrite_bound_redirect_uris(oauth, config["redirect_uri"])
        return oauth

    wrapped._grokbot_public_callback = True  # type: ignore[attr-defined]
    mcp_router._oauth_auth_from_authentication = wrapped
    return True


def _retry_mcp_router_patch(config: dict[str, Any]) -> None:
    for _ in range(40):
        try:
            if _patch_mcp_router(config):
                print(
                    "[grokbot-sitecustomize] MCP OAuth factory pinned to "
                    f"{config['redirect_uri']}",
                    file=sys.stderr,
                    flush=True,
                )
                return
        except Exception:
            pass
        time.sleep(0.25)


def install_fastmcp_public_callback_patch(
    env: dict[str, str] | None = None,
) -> bool:
    config = resolve_public_oauth_callback(env)
    if config is None:
        print(
            "[grokbot-sitecustomize] MCP OAuth public callback disabled",
            file=sys.stderr,
            flush=True,
        )
        return False

    try:
        _patch_fastmcp_oauth(config)
    except Exception as exc:
        print(
            f"[grokbot-sitecustomize] FastMCP OAuth patch skipped: {exc}",
            file=sys.stderr,
            flush=True,
        )

    try:
        patched_router = _patch_mcp_router(config)
    except Exception as exc:
        patched_router = False
        print(
            f"[grokbot-sitecustomize] MCP router OAuth patch deferred: {exc}",
            file=sys.stderr,
            flush=True,
        )
    if not patched_router:
        threading.Thread(
            target=_retry_mcp_router_patch,
            args=(config,),
            name="grokbot-mcp-oauth-patch",
            daemon=True,
        ).start()

    print(
        "[grokbot-sitecustomize] MCP OAuth public callback -> "
        f"{config['redirect_uri']} (port {config['callback_port']})",
        file=sys.stderr,
        flush=True,
    )
    return True
