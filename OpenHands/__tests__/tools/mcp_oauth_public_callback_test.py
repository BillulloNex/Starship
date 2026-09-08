from urllib.parse import parse_qsl

from mcp_oauth_public_callback import rewrite_token_form_body


def test_rewrites_localhost_redirect_uri_in_token_body():
    body = (
        b"grant_type=authorization_code&code=abc"
        b"&redirect_uri=http%3A%2F%2Flocalhost%3A41643%2Fcallback"
        b"&client_id=id.apps.googleusercontent.com"
    )
    rewritten = rewrite_token_form_body(body, "https://ship.beenex.org/callback")
    assert rewritten is not None
    params = dict(parse_qsl(rewritten.decode("utf-8")))
    assert params["redirect_uri"] == "https://ship.beenex.org/callback"
    assert params["code"] == "abc"
    assert params["client_id"] == "id.apps.googleusercontent.com"


def test_leaves_unrelated_form_bodies_alone():
    assert rewrite_token_form_body(b"grant_type=refresh_token", "https://ship.beenex.org/callback") is None


if __name__ == "__main__":
    test_rewrites_localhost_redirect_uri_in_token_body()
    test_leaves_unrelated_form_bodies_alone()
    print("ok")
