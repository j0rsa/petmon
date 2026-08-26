"""The Petmon med-intake shortcut workflow.

Runtime shape (see docs/apple-shortcut-med-intake.md):

    read config -> GET menu -> if menu empty: say so
                            -> otherwise pick meds
                               for each picked label
                                 find its line, branch on kind, POST the take
                               report what was actually logged

Two build modes:

* interactive (default) — asks import questions, uses pickers
* harness (`--harness`)  — config baked in, pickers replaced by fixed choices
  so `shortcuts run` needs no taps. Used by `make shortcut-engine-test`.
"""

from __future__ import annotations

import hashlib
import plistlib
from dataclasses import dataclass

import shortcut_plist as sp

SHORTCUT_NAME = "Petmon Take Meds"
HARNESS_NAME = "Petmon Take Meds (Test)"

# Bump only to intentionally regenerate every action UUID.
LOGIC_VERSION = "med-intake.v2"

MENU_PATH = "/api/v1/shortcuts/meds/intake/menu"
TAKE_PATH = "/api/v1/shortcuts/meds/intake/take/"

DEFAULT_SERVER = "https://petmon.j0rsa.com"

# The menu is asked for the device's own day; the take endpoint is real-time
# only and stamps the time itself, so the workflow sends no timestamp.
MENU_DATE_FORMAT = "yyyy-MM-dd"

# Server-side line layout: label|token|kind[|dose options csv]
FIELD_LABEL = 1
FIELD_TOKEN = 2
FIELD_KIND = 3
FIELD_DOSE_OPTIONS = 4

KIND_OPTIONAL_PILL = "optional_pill"
KIND_OPTIONAL_LIQUID = "optional_liquid"

STATUS_EMPTY = "empty"

NOTHING_DUE_MESSAGE = "Nothing due in Petmon today."
NOTHING_LOGGED_MESSAGE = (
    "No doses were logged. Check the Petmon server URL, pet id, and API key."
)
LOGGED_MESSAGE = f"Petmon logged: {sp.PLACEHOLDER}"

LOGGED_VARIABLE = "Logged"


@dataclass
class Harness:
    """Fixed answers so the workflow can run without any taps."""

    server: str
    pet_id: str
    api_key: str
    liquid_ml: str = "0.4"


def uid(key: str) -> str:
    return sp.stable_uuid(LOGIC_VERSION, key)


def import_questions() -> list[dict]:
    return [
        {
            "ActionIndex": 0,
            "Category": "Parameter",
            "DefaultValue": DEFAULT_SERVER,
            "ParameterKey": "WFTextActionText",
            "Text": (
                "Petmon server URL\n\n"
                "Use the site address from your browser, including https://.\n"
                f"Example: {DEFAULT_SERVER}"
            ),
        },
        {
            "ActionIndex": 1,
            "Category": "Parameter",
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Text": (
                "Pet ID\n\n"
                "UUID of the pet you are logging meds for.\n"
                "Copy it from the pet profile card in Petmon."
            ),
        },
        {
            "ActionIndex": 2,
            "Category": "Parameter",
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Text": (
                "API key\n\n"
                "Create one in Petmon → Settings → API tokens (Write scope).\n"
                "Stored in plain text on this device."
            ),
        },
    ]


def build_workflow(harness: Harness | None = None) -> dict:
    """Assemble the workflow plist.

    Every cross-action reference is explicit: `sp.repeat_item(group)` names the
    loop it belongs to, so a nested loop can never shadow it.
    """
    id_server = uid("server")
    id_pet = uid("pet")
    id_key = uid("api-key")
    id_menu_date_src = uid("menu-date-source")
    id_menu_date = uid("menu-date")
    id_menu = uid("menu-request")
    id_status = uid("menu-status")
    id_labels = uid("menu-labels")
    id_lines = uid("menu-lines")
    id_choose = uid("choose-meds")
    id_split = uid("split-line")
    id_line_label = uid("line-label")
    id_token = uid("take-token")
    id_kind = uid("line-kind")
    id_dose_csv = uid("dose-options-csv")
    id_dose_list = uid("dose-options")
    id_dose_choice = uid("dose-choice")
    id_ml = uid("liquid-ml")
    id_post_pill = uid("post-pill")
    id_post_liquid = uid("post-liquid")
    id_post_scheduled = uid("post-scheduled")

    g_empty = uid("group-menu-empty")
    g_selected = uid("group-selected-loop")
    g_lines = uid("group-lines-loop")
    g_match = uid("group-line-match")
    g_pill = uid("group-pill")
    g_liquid = uid("group-liquid")
    g_report = uid("group-report")

    server_ref = (id_server, "Server URL")
    key_ref = (id_key, "API Key")
    token_ref = (id_token, "Take Token")

    baked = harness is not None
    server_default = harness.server if harness else DEFAULT_SERVER
    pet_default = harness.pet_id if harness else ""
    key_default = harness.api_key if harness else ""

    def take_url(extra: str = "", extra_refs: list[tuple[str | None, str]] | None = None):
        """`{server}/…/take/{token}` plus the dose param the kind needs.

        No timestamp: the endpoint records the dose as taken now.
        """
        template = f"{sp.PLACEHOLDER}{TAKE_PATH}{sp.PLACEHOLDER}{extra}"
        return sp.wf_token_string(template, [server_ref, token_ref, *(extra_refs or [])])

    def post_take(*, uuid_: str, url: dict, group: str) -> list[dict]:
        """POST the take, then record the label we just logged."""
        return [
            sp.http_request(
                uuid_=uuid_,
                name=None,
                url=url,
                method="POST",
                bearer_ref=key_ref,
                group=group,
            ),
            sp.append_to_variable(
                name=LOGGED_VARIABLE,
                value=sp.single_token((id_line_label, "Line label")),
                group=group,
            ),
        ]

    actions: list[dict] = [
        # 0-2: configuration. Import questions overwrite these three texts.
        sp.get_text(uuid_=id_server, name="Server URL", text=server_default),
        sp.get_text(uuid_=id_pet, name="Pet ID", text=pet_default),
        sp.get_text(uuid_=id_key, name="API Key", text=key_default),
        # The device's own calendar day, so the menu matches what the phone
        # shows even if the server sits in another time zone.
        sp.current_date(uuid_=id_menu_date_src),
        sp.format_date(
            uuid_=id_menu_date,
            name="Menu Date",
            fmt=MENU_DATE_FORMAT,
            date_ref=sp.wf_output_ref(id_menu_date_src, "Current Date"),
        ),
        sp.http_request(
            uuid_=id_menu,
            name="Menu",
            method="GET",
            bearer_ref=key_ref,
            url=sp.wf_token_string(
                f"{sp.PLACEHOLDER}{MENU_PATH}"
                f"?pet_id={sp.PLACEHOLDER}&date={sp.PLACEHOLDER}",
                [server_ref, (id_pet, "Pet ID"), (id_menu_date, "Menu Date")],
            ),
        ),
        sp.dictionary_value(
            uuid_=id_status, name="Menu Status", key="status",
            source=sp.wf_output_ref(id_menu, "Menu"),
        ),
        sp.dictionary_value(
            uuid_=id_labels, name="Labels", key="labels",
            source=sp.wf_output_ref(id_menu, "Menu"),
        ),
        sp.dictionary_value(
            uuid_=id_lines, name="Menu Lines", key="lines",
            source=sp.wf_output_ref(id_menu, "Menu"),
        ),
        # Nothing due -> say so instead of opening an empty picker.
        sp.if_equals(
            group=g_empty,
            subject=sp.wf_output_ref(id_status, "Menu Status"),
            expected=STATUS_EMPTY,
        ),
        sp.show_result(text=sp.wf_text(NOTHING_DUE_MESSAGE), group=g_empty),
        sp.otherwise(group=g_empty),
    ]

    if baked:
        # Harness: take every menu entry, no picker.
        selected_source = sp.wf_output_ref(id_labels, "Labels")
    else:
        actions.append(
            sp.choose_from_list(
                uuid_=id_choose,
                name="Selected Meds",
                prompt="Select meds to log",
                source=sp.wf_output_ref(id_labels, "Labels"),
                multiple=True,
                group=g_empty,
            )
        )
        selected_source = sp.wf_output_ref(id_choose, "Selected Meds")

    actions += [
        sp.repeat_each(group=g_selected, source=selected_source),
        sp.repeat_each(group=g_lines, source=sp.wf_output_ref(id_lines, "Menu Lines")),
        sp.split_text(
            uuid_=id_split,
            name="Split Line",
            separator="|",
            # Explicitly the *inner* loop's item.
            source=sp.repeat_item(g_lines),
            group=g_lines,
        ),
        sp.item_at_index(
            uuid_=id_line_label,
            name="Line label",
            index=FIELD_LABEL,
            source=sp.wf_output_ref(id_split, "Split Line"),
            group=g_lines,
        ),
        # The fix that matters: compare against the *outer* loop's item (the
        # label the user picked), not the bare `Repeat Item` magic variable,
        # which resolves to the inner loop and never matches.
        sp.if_equals(
            group=g_match,
            subject=sp.wf_output_ref(id_line_label, "Line label"),
            expected=sp.single_token((g_selected, "Repeat Item")),
        ),
        sp.item_at_index(
            uuid_=id_token,
            name="Take Token",
            index=FIELD_TOKEN,
            source=sp.wf_output_ref(id_split, "Split Line"),
            group=g_match,
        ),
        sp.item_at_index(
            uuid_=id_kind,
            name="Kind",
            index=FIELD_KIND,
            source=sp.wf_output_ref(id_split, "Split Line"),
            group=g_match,
        ),
        sp.if_equals(
            group=g_pill,
            subject=sp.wf_output_ref(id_kind, "Kind"),
            expected=KIND_OPTIONAL_PILL,
        ),
        sp.item_at_index(
            uuid_=id_dose_csv,
            name="Dose Options CSV",
            index=FIELD_DOSE_OPTIONS,
            source=sp.wf_output_ref(id_split, "Split Line"),
            group=g_pill,
        ),
        sp.split_text(
            uuid_=id_dose_list,
            name="Dose Options",
            separator=",",
            source=sp.wf_output_ref(id_dose_csv, "Dose Options CSV"),
            group=g_pill,
        ),
    ]

    if baked:
        actions.append(
            sp.item_at_index(
                uuid_=id_dose_choice,
                name="Dose Choice",
                index=1,
                source=sp.wf_output_ref(id_dose_list, "Dose Options"),
                group=g_pill,
            )
        )
    else:
        actions.append(
            sp.choose_from_list(
                uuid_=id_dose_choice,
                name="Dose Choice",
                prompt="Dose",
                source=sp.wf_output_ref(id_dose_list, "Dose Options"),
                group=g_pill,
            )
        )

    actions += post_take(
        uuid_=id_post_pill,
        group=g_pill,
        url=take_url("?dose_fraction=" + sp.PLACEHOLDER, [(id_dose_choice, "Dose Choice")]),
    )
    actions += [
        sp.otherwise(group=g_pill),
        sp.if_equals(
            group=g_liquid,
            subject=sp.wf_output_ref(id_kind, "Kind"),
            expected=KIND_OPTIONAL_LIQUID,
        ),
    ]

    if baked:
        actions.append(
            sp.get_text(uuid_=id_ml, name="Liquid ml", text=harness.liquid_ml)
        )
    else:
        actions.append(
            sp.ask_for_input(
                uuid_=id_ml, name="Liquid ml", prompt="Liquid dose (ml)", group=g_liquid
            )
        )

    actions += post_take(
        uuid_=id_post_liquid,
        group=g_liquid,
        url=take_url("?liquid_dose_ml=" + sp.PLACEHOLDER, [(id_ml, "Liquid ml")]),
    )
    actions += [
        sp.otherwise(group=g_liquid),
        # Scheduled dose: the assignment already fixes the amount.
        *post_take(uuid_=id_post_scheduled, group=g_liquid, url=take_url()),
        sp.end_if(group=g_liquid),
        sp.end_if(group=g_pill),
        sp.end_if(group=g_match),
        sp.end_repeat(group=g_lines, uuid_=uid("lines-loop-end")),
        sp.end_repeat(group=g_selected, uuid_=uid("selected-loop-end")),
        # Report what was actually recorded, not what was selected.
        sp.if_equals(
            group=g_report,
            subject=sp.wf_variable_ref(LOGGED_VARIABLE),
            expected="",
        ),
        sp.show_result(text=sp.wf_text(NOTHING_LOGGED_MESSAGE), group=g_report),
        sp.otherwise(group=g_report),
    ]

    logged_summary = sp.wf_token_string(LOGGED_MESSAGE, [(None, LOGGED_VARIABLE)])
    if baked:
        actions.append(
            sp.action("output", {"WFOutput": logged_summary, "WFNoOutputSurfaceBehavior": 0})
        )
    else:
        actions.append(sp.show_result(text=logged_summary, group=g_report))

    actions += [
        sp.end_if(group=g_report),
        sp.end_if(group=g_empty),
    ]

    return {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "2700.0.4",
        "WFWorkflowClientRelease": "2.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowName": HARNESS_NAME if baked else SHORTCUT_NAME,
        "WFWorkflowImportQuestions": [] if baked else import_questions(),
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 463140863,
            "WFWorkflowIconGlyphNumber": 59788,
        },
        # Plain shortcut: the pickers and prompts below do not work in the
        # widget or watch surfaces.
        "WFWorkflowTypes": [],
        "WFWorkflowInputContentItemClasses": [],
        "WFWorkflowHasOutputFallback": False,
    }


def plist_bytes(workflow: dict) -> bytes:
    return plistlib.dumps(workflow, fmt=plistlib.FMT_XML)


def workflow_digest(workflow: dict) -> str:
    """Stable hash of the workflow logic.

    Signing is not reproducible, so this hashes the XML plist instead. It is
    recorded in assets/shortcuts/publish.json to detect an iCloud link that no
    longer matches the committed logic.
    """
    return hashlib.sha256(plist_bytes(workflow)).hexdigest()
