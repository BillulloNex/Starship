import asyncio
import sys
import types
import unittest
from unittest import mock

import automation_glitchtip as ag


class FakeRun:
    def __init__(self, error_detail=None):
        self.id = "run-1"
        self.automation_id = "d50e8f8f-0253-436d-b960-2a2f97e441a8"
        self.conversation_id = None
        self.error_detail = error_detail


class AutomationGlitchtipTests(unittest.TestCase):
    def test_heartbeat_map_parses_pairs_and_skips_junk(self):
        self.assertEqual(ag.heartbeat_map(""), {})
        self.assertEqual(ag.heartbeat_map("junk,=x,y="), {})
        self.assertEqual(
            ag.heartbeat_map("automation:ab=1-2, ship-log-monitor = 3"),
            {"automation:ab": "1-2", "ship-log-monitor": "3"},
        )

    def test_automation_key_matches_db_hex_ids(self):
        self.assertEqual(
            ag.automation_key("D50E8F8F-0253-436D-B960-2A2F97E441A8"),
            "automation:d50e8f8f0253436db9602a2f97e441a8",
        )

    def test_summarize_error_prefers_stderr_and_normalizes_ids(self):
        detail = (
            "exit_code=1\nstderr: [setup] ERROR: Failed to fetch SDK version\n\n"
            "stdout: [setup] Linked .venv"
        )
        self.assertEqual(
            ag.summarize_error(detail), "[setup] ERROR: Failed to fetch SDK version"
        )
        self.assertEqual(
            ag.summarize_error("Timed out: run 0123456789abcdef gone"),
            "Timed out: run {ID} gone",
        )
        self.assertEqual(ag.summarize_error(""), "no detail")

    def test_completed_run_pings_heartbeat_and_calls_original(self):
        calls = []

        async def original(event, **kwargs):
            calls.append(event)

        wrapped = ag.wrap_capture(original)
        self.assertIs(ag.wrap_capture(wrapped), wrapped)
        with mock.patch.object(ag, "_ping_in_background") as ping:
            asyncio.run(wrapped("automation_run_completed", run=FakeRun()))
        ping.assert_called_once_with("automation:d50e8f8f0253436db9602a2f97e441a8")
        self.assertEqual(calls, ["automation_run_completed"])

    def test_failed_run_never_pings_and_never_raises(self):
        async def original(event, **kwargs):
            return "ok"

        wrapped = ag.wrap_capture(original)
        with mock.patch.object(ag, "_ping_in_background") as ping, mock.patch.object(
            ag, "report_run_event", side_effect=RuntimeError("boom")
        ):
            self.assertEqual(asyncio.run(wrapped("automation_run_failed")), "ok")
        ping.assert_not_called()
        with mock.patch.object(ag, "_ping_in_background") as ping:
            asyncio.run(
                wrapped("automation_run_failed", run=FakeRun("exit_code=1"))
            )
        ping.assert_not_called()

    def test_install_patches_modules_that_imported_the_function(self):
        async def original(event, **kwargs):
            return None

        telemetry = types.ModuleType("openhands.automation.telemetry")
        telemetry.capture_automation_event = original
        dispatcher = types.ModuleType("openhands.automation.dispatcher")
        dispatcher.capture_automation_event = original
        pkg = types.ModuleType("openhands.automation")
        pkg.telemetry = telemetry
        root = types.ModuleType("openhands")
        root.automation = pkg
        modules = {
            "openhands": root,
            "openhands.automation": pkg,
            "openhands.automation.telemetry": telemetry,
            "openhands.automation.dispatcher": dispatcher,
        }
        with mock.patch.dict(sys.modules, modules):
            self.assertTrue(ag.install())
            self.assertIsNot(telemetry.capture_automation_event, original)
            self.assertIs(
                dispatcher.capture_automation_event, telemetry.capture_automation_event
            )


if __name__ == "__main__":
    unittest.main()
