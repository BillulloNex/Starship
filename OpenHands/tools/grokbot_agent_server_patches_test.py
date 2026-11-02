import threading
import time
import types
import unittest

from grokbot_agent_server_patches import (
    FULL_AUTONOMY_SECURITY_POLICY,
    SECRETS_SHOW_BULLET,
    allow_showing_secrets,
    bound_conversation_close,
    disable_tool_usability,
    replace_default_security_policy,
)


def make_conversation_cls(body):
    class FakeConversation:
        id = "abc"

        def close(self):
            body(self)
            self._cleanup_complete = True

    return FakeConversation


class BoundConversationCloseTests(unittest.TestCase):
    def test_hung_close_is_abandoned_at_deadline(self):
        release = threading.Event()
        cls = make_conversation_cls(lambda self: release.wait())
        bound_conversation_close(cls, 0.2)

        started = time.monotonic()
        with self.assertLogs("grokbot_agent_server_patches", "ERROR"):
            cls().close()
        self.assertLess(time.monotonic() - started, 2)
        release.set()

    def test_normal_close_runs_original(self):
        calls = []
        cls = make_conversation_cls(lambda self: calls.append(self))
        bound_conversation_close(cls, 5)

        conversation = cls()
        conversation.close()
        self.assertEqual(calls, [conversation])
        conversation.close()
        self.assertEqual(len(calls), 1)

    def test_close_errors_reach_the_caller(self):
        class CredentialBindingError(Exception):
            pass

        def fail(self):
            raise CredentialBindingError("binding")

        cls = make_conversation_cls(fail)
        bound_conversation_close(cls, 5)
        with self.assertRaises(CredentialBindingError):
            cls().close()

    def test_patching_twice_is_a_noop(self):
        cls = make_conversation_cls(lambda self: None)
        self.assertTrue(bound_conversation_close(cls, 5))
        patched = cls.close
        self.assertFalse(bound_conversation_close(cls, 5))
        self.assertIs(cls.close, patched)


class DisableToolUsabilityTests(unittest.TestCase):
    def make_registry(self):
        return types.SimpleNamespace(_check_tool_usable=lambda name, checker: checker())

    def test_named_tool_is_unusable_and_others_untouched(self):
        registry = self.make_registry()
        self.assertTrue(disable_tool_usability(registry, "browser_tool_set"))

        self.assertFalse(registry._check_tool_usable("browser_tool_set", lambda: True))
        self.assertTrue(registry._check_tool_usable("terminal", lambda: True))
        self.assertFalse(registry._check_tool_usable("terminal", lambda: False))

    def test_disabling_twice_is_a_noop(self):
        registry = self.make_registry()
        disable_tool_usability(registry, "browser_tool_set")
        patched = registry._check_tool_usable
        self.assertFalse(disable_tool_usability(registry, "browser_tool_set"))
        self.assertIs(registry._check_tool_usable, patched)


class FullAutonomyPolicyTests(unittest.TestCase):
    def test_default_policy_body_is_replaced_once(self):
        class FakeSecuritySection:
            body = "<SECURITY>\n- Upload API keys only with consent\n</SECURITY>"

        self.assertTrue(
            replace_default_security_policy(
                FakeSecuritySection, FULL_AUTONOMY_SECURITY_POLICY
            )
        )
        self.assertEqual(FakeSecuritySection.body, FULL_AUTONOMY_SECURITY_POLICY)
        self.assertFalse(
            replace_default_security_policy(
                FakeSecuritySection, FULL_AUTONOMY_SECURITY_POLICY
            )
        )

    def make_secrets_section(self, text):
        class FakeSecretsSection:
            def render(self, ctx):
                return text

        return FakeSecretsSection

    def test_no_echo_bullet_is_replaced_and_rest_kept(self):
        cls = self.make_secrets_section(
            "<CUSTOM_SECRETS>\n"
            "* Security: Secret values are automatically masked.\n"
            "* Avoid exposing raw secrets: Never echo or print the full value.\n"
            "* If it still fails, report it to the user.\n"
            "</CUSTOM_SECRETS>"
        )
        self.assertTrue(allow_showing_secrets(cls))

        rendered = cls().render(None)
        self.assertNotIn("Never echo", rendered)
        self.assertIn(SECRETS_SHOW_BULLET, rendered)
        self.assertIn("* Security: Secret values are automatically masked.", rendered)
        self.assertIn("* If it still fails, report it to the user.", rendered)

    def test_block_without_the_bullet_is_untouched(self):
        text = "<CUSTOM_SECRETS>\n* Security: masked.\n</CUSTOM_SECRETS>"
        cls = self.make_secrets_section(text)
        allow_showing_secrets(cls)
        self.assertEqual(cls().render(None), text)

    def test_patching_secrets_twice_is_a_noop(self):
        cls = self.make_secrets_section(None)
        self.assertTrue(allow_showing_secrets(cls))
        patched = cls.render
        self.assertFalse(allow_showing_secrets(cls))
        self.assertIs(cls.render, patched)
        self.assertIsNone(cls().render(None))


if __name__ == "__main__":
    unittest.main()
