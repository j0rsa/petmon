#!/usr/bin/env python3
"""Tests for the generated med-intake shortcut.

No macOS, no Shortcuts app, no petmon server: `shortcut_sim` executes the real
generated plist against a fake HTTP client. Run with

    make test-shortcut          # or
    python3 -m unittest discover -s scripts/tests -v
"""

from __future__ import annotations

import copy
import json
import sys
import unittest
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import shortcut_plist as sp  # noqa: E402
from med_intake_workflow import (  # noqa: E402
    LOGGED_MESSAGE,
    NOTHING_DUE_MESSAGE,
    NOTHING_LOGGED_MESSAGE,
    Harness,
    build_workflow,
    workflow_digest,
)
from shortcut_lint import validate_workflow  # noqa: E402
from shortcut_sim import (  # noqa: E402
    FakeHttp,
    HttpError,
    ScriptedUser,
    WorkflowRunner,
)

SERVER = "http://localhost:8080"
PET_ID = "550e8400-e29b-41d4-a716-446655440000"
API_KEY = "pm_api_testkey"
NOW = datetime(2026, 3, 15, 8, 30, 0)

SCHEDULED = "Benazepril · 1 tab"
PILL = "Gabapentin · As needed"
LIQUID = "Ursodiol · As needed"

DOSE_OPTIONS = "1,3/4,1/2,1/3,1/4,1/8,1/16"

MENU = {
    "status": "ok",
    "labels": [SCHEDULED, PILL, LIQUID],
    "lines": [
        f"{SCHEDULED}|token-sched|scheduled",
        f"{PILL}|token-pill|optional_pill|{DOSE_OPTIONS}",
        f"{LIQUID}|token-liquid|optional_liquid",
    ],
    "choices": [],
}

EMPTY_MENU = {"status": "empty", "labels": [], "lines": [], "choices": []}


def picker(selection: list[str], dose: str = "1/2"):
    """Scripted taps: `selection` in the med picker, `dose` in the dose picker."""

    def select(prompt: str, items: list):
        if prompt == "Select meds to log":
            return [item for item in items if item in selection]
        if prompt == "Dose":
            assert dose in items, f"{dose!r} not offered: {items}"
            return dose
        raise AssertionError(f"unexpected picker prompt {prompt!r}")

    return ScriptedUser(select=select, answers={"Liquid dose (ml)": 0.4})


def run(
    *,
    selection: list[str],
    menu=MENU,
    dose: str = "1/2",
    workflow=None,
    user=None,
) -> tuple[WorkflowRunner, FakeHttp]:
    http = FakeHttp(routes={"/shortcuts/meds/intake/menu": menu})
    http.routes["/shortcuts/meds/intake/take/"] = {"id": "rec-1", "taken": True}
    runner = WorkflowRunner(
        copy.deepcopy(workflow or build_workflow()),
        http=http,
        user=user or picker(selection, dose),
        now=NOW,
        import_answers=None if workflow else [SERVER, PET_ID, API_KEY],
    )
    runner.run()
    return runner, http


def takes(http: FakeHttp) -> list:
    return [r for r in http.requests if r.method == "POST"]


class WorkflowStructure(unittest.TestCase):
    def test_generated_workflow_is_valid(self):
        self.assertEqual(validate_workflow(build_workflow()), [])

    def test_harness_workflow_is_valid(self):
        harness = Harness(server=SERVER, pet_id=PET_ID, api_key=API_KEY)
        self.assertEqual(validate_workflow(build_workflow(harness)), [])

    def test_build_is_deterministic(self):
        self.assertEqual(workflow_digest(build_workflow()), workflow_digest(build_workflow()))

    def test_bare_repeat_item_reference_is_rejected(self):
        """The bug that shipped: `Repeat Item` by name binds to the inner loop."""
        workflow = build_workflow()
        for action in workflow["WFWorkflowActions"]:
            params = action["WFWorkflowActionParameters"]
            if "WFConditionalActionString" in params and isinstance(
                params["WFConditionalActionString"], dict
            ):
                params["WFConditionalActionString"] = sp.wf_variable_ref("Repeat Item")
                break
        else:
            self.fail("no dynamic conditional found to mutate")
        errors = validate_workflow(workflow)
        self.assertTrue(
            any("bare name" in error for error in errors),
            f"linter missed the shadowed loop variable: {errors}",
        )

    def test_unbalanced_control_flow_is_rejected(self):
        workflow = build_workflow()
        actions = workflow["WFWorkflowActions"]
        for index, action in enumerate(actions):
            if action["WFWorkflowActionParameters"].get("WFControlFlowMode") == sp.FLOW_END:
                del actions[index]
                break
        errors = validate_workflow(workflow)
        self.assertTrue(any("never closed" in e or "innermost" in e for e in errors), errors)

    def test_forward_output_reference_is_rejected(self):
        workflow = build_workflow()
        actions = workflow["WFWorkflowActions"]
        menu = next(
            i
            for i, a in enumerate(actions)
            if a["WFWorkflowActionParameters"].get("WFHTTPMethod") == "GET"
        )
        # Move the menu request after the action that reads its response.
        actions[menu], actions[menu + 1] = actions[menu + 1], actions[menu]
        errors = validate_workflow(workflow)
        self.assertTrue(any("later action" in e for e in errors), errors)

    def test_no_widget_or_watch_surface(self):
        # Choose From List / Ask do not work in those surfaces.
        self.assertEqual(build_workflow()["WFWorkflowTypes"], [])


class MenuRequest(unittest.TestCase):
    def test_menu_uses_config_and_device_local_date(self):
        _, http = run(selection=[])
        get = http.requests[0]
        self.assertEqual(get.method, "GET")
        self.assertEqual(get.path, f"{SERVER}/api/v1/shortcuts/meds/intake/menu")
        self.assertEqual(get.query["pet_id"], PET_ID)
        self.assertEqual(get.query["date"], "2026-03-15")
        self.assertEqual(get.headers["Authorization"], f"Bearer {API_KEY}")

    def test_empty_menu_says_so_and_posts_nothing(self):
        runner, http = run(selection=[], menu=EMPTY_MENU)
        self.assertEqual(takes(http), [])
        self.assertEqual(runner.messages, [NOTHING_DUE_MESSAGE])

    def test_menu_without_status_field_still_works(self):
        """An older deployment has no `status`; fall through to the picker."""
        legacy = {k: v for k, v in MENU.items() if k != "status"}
        _, http = run(selection=[SCHEDULED], menu=legacy)
        self.assertEqual(len(takes(http)), 1)


class Takes(unittest.TestCase):
    def test_scheduled_selection_posts_exactly_once(self):
        runner, http = run(selection=[SCHEDULED])
        posts = takes(http)
        self.assertEqual(len(posts), 1)
        self.assertTrue(posts[0].path.endswith("/take/token-sched"), posts[0].url)
        self.assertEqual(posts[0].headers["Authorization"], f"Bearer {API_KEY}")
        self.assertEqual(runner.messages, [LOGGED_MESSAGE.replace(sp.PLACEHOLDER, SCHEDULED)])

    def test_take_sends_no_timestamp(self):
        """The take endpoint is real-time only; it stamps the time itself."""
        _, http = run(selection=[SCHEDULED])
        post = takes(http)[0]
        self.assertEqual(post.query, {})
        self.assertNotIn("?", post.url)

    def test_every_selection_posts_once_with_its_own_token(self):
        runner, http = run(selection=[SCHEDULED, PILL, LIQUID])
        posts = takes(http)
        self.assertEqual(
            [p.path.rsplit("/", 1)[-1] for p in posts],
            ["token-sched", "token-pill", "token-liquid"],
        )
        self.assertNotIn("dose_fraction", posts[0].query)
        self.assertEqual(posts[1].query["dose_fraction"], "1/2")
        self.assertEqual(posts[2].query["liquid_dose_ml"], "0.4")
        self.assertEqual(len(runner.variables["Logged"]), 3)

    def test_dose_picker_offers_the_server_supplied_options(self):
        user = picker([PILL], dose="3/4")
        _, http = run(selection=[PILL], dose="3/4", user=user)
        self.assertIn("Dose", user.prompts)
        self.assertEqual(takes(http)[0].query["dose_fraction"], "3/4")

    def test_unselected_meds_are_not_logged(self):
        _, http = run(selection=[LIQUID])
        posts = takes(http)
        self.assertEqual(len(posts), 1)
        self.assertTrue(posts[0].path.endswith("/take/token-liquid"))

    def test_selecting_nothing_reports_nothing_logged(self):
        runner, http = run(selection=[])
        self.assertEqual(takes(http), [])
        self.assertEqual(runner.messages, [NOTHING_LOGGED_MESSAGE])

    def test_server_error_aborts_the_run(self):
        http = FakeHttp(
            routes={
                "/shortcuts/meds/intake/menu": MENU,
                "/shortcuts/meds/intake/take/": HttpError(400, "take", "take token expired"),
            }
        )
        runner = WorkflowRunner(
            build_workflow(),
            http=http,
            user=picker([SCHEDULED]),
            now=NOW,
            import_answers=[SERVER, PET_ID, API_KEY],
        )
        with self.assertRaises(HttpError):
            runner.run()
        self.assertEqual(runner.messages, [])

    def test_duplicate_labels_would_double_log(self):
        """Why the server must hand out unique labels.

        Matching is by display string, so two menu rows sharing a label make one
        tap log two doses. `shortcut_menu::med_intake_menu` disambiguates them;
        this test pins the reason.
        """
        menu = json.loads(json.dumps(MENU))
        menu["labels"] = [SCHEDULED, SCHEDULED]
        menu["lines"] = [
            f"{SCHEDULED}|token-a|scheduled",
            f"{SCHEDULED}|token-b|scheduled",
        ]
        # One tap: pick a single entry from the picker.
        one_tap = ScriptedUser(select=lambda _prompt, items: items[:1], answers={})
        _, http = run(selection=[], menu=menu, user=one_tap)
        self.assertEqual(len(takes(http)), 2, "one tap must not log two doses")


class HarnessVariant(unittest.TestCase):
    def test_harness_runs_without_any_prompt(self):
        def no_prompts(prompt, items):
            del items
            raise AssertionError(f"harness must not prompt, got {prompt!r}")

        harness = Harness(server=SERVER, pet_id=PET_ID, api_key=API_KEY, liquid_ml="0.4")
        runner, http = run(
            selection=[],
            workflow=build_workflow(harness),
            user=ScriptedUser(select=no_prompts, answers={}),
        )
        posts = takes(http)
        self.assertEqual(len(posts), 3)
        # Whole tablet is the first server-supplied option.
        self.assertEqual(posts[1].query["dose_fraction"], "1")
        self.assertEqual(posts[2].query["liquid_dose_ml"], "0.4")
        self.assertEqual(http.requests[0].query["pet_id"], PET_ID)
        self.assertIsNotNone(runner.output)


if __name__ == "__main__":
    unittest.main()
