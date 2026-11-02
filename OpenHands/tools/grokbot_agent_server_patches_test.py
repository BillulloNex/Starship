import threading
import time
import unittest

from grokbot_agent_server_patches import bound_conversation_close


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


if __name__ == "__main__":
    unittest.main()
