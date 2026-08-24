#!/usr/bin/env python3
"""Build and sign the Petmon med-intake Apple Shortcut."""

from __future__ import annotations

import plistlib
import subprocess
import sys
import uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "shortcuts"
SHORTCUT_NAME = "Petmon Take Meds"
UNSIGNED = OUT_DIR / f"{SHORTCUT_NAME}.unsigned.plist"
BINARY = OUT_DIR / f"{SHORTCUT_NAME}.unsigned.shortcut"
SIGNED = OUT_DIR / f"{SHORTCUT_NAME}.shortcut"
PLACEHOLDER = "\ufffc"

MENU_PATH = "/api/v1/shortcuts/meds/intake/menu"
TAKE_PATH = "/api/v1/shortcuts/meds/intake/take/"


def wf_text(value: str) -> dict:
    return {
        "Value": {"string": value, "attachmentsByRange": {}},
        "WFSerializationType": "WFTextTokenString",
    }


def wf_token_string(template: str, outputs: list[tuple[str, str]]) -> dict:
    attachments: dict[str, dict] = {}
    search_from = 0
    for output_uuid, output_name in outputs:
        idx = template.find(PLACEHOLDER, search_from)
        if idx == -1:
            raise ValueError(f"missing placeholder in template: {template!r}")
        attachments[f"{{{idx}, 1}}"] = {
            "Type": "ActionOutput",
            "OutputUUID": output_uuid,
            "OutputName": output_name,
        }
        search_from = idx + 1
    return {
        "Value": {"string": template, "attachmentsByRange": attachments},
        "WFSerializationType": "WFTextTokenString",
    }


def wf_output_ref(output_uuid: str, output_name: str) -> dict:
    return {
        "Value": {
            "OutputUUID": output_uuid,
            "OutputName": output_name,
            "Type": "ActionOutput",
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def wf_conditional(
    group: str,
    repeat_group: str,
    mode: int,
    *,
    compare_to: str | None = None,
    input_ref: dict | None = None,
) -> dict:
    params: dict = {
        "UUID": group,
        "GroupingIdentifier": repeat_group,
        "WFControlFlowMode": mode,
    }
    if mode == 0:
        params["WFCondition"] = 4
        params["WFConditionalActionString"] = compare_to or ""
        params["WFInput"] = input_ref or {}
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": params,
    }


def post_take_action(
    *,
    repeat_group: str,
    action_uuid: str,
    uid_server: str,
    uid_api_key: str,
    url_value: dict,
) -> dict:
    auth_template = f"Bearer {PLACEHOLDER}"
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
        "WFWorkflowActionParameters": {
            "UUID": action_uuid,
            "GroupingIdentifier": repeat_group,
            "WFURL": url_value,
            "WFHTTPMethod": "POST",
            "WFHTTPHeaders": {
                "Value": {
                    "WFDictionaryFieldValueItems": [
                        {
                            "WFItemType": 0,
                            "WFKey": wf_text("Authorization"),
                            "WFValue": wf_token_string(
                                auth_template,
                                [(uid_api_key, "API Key")],
                            ),
                        }
                    ]
                },
                "WFSerializationType": "WFDictionaryFieldValue",
            },
        },
    }


def build_workflow() -> dict:
    uid_server = str(uuid.uuid4()).upper()
    uid_pet = str(uuid.uuid4()).upper()
    uid_api_key = str(uuid.uuid4()).upper()
    uid_date = str(uuid.uuid4()).upper()
    uid_date_fmt = str(uuid.uuid4()).upper()

    import_questions = [
        {
            "ActionIndex": 0,
            "Category": "Parameter",
            "DefaultValue": "https://petmon.j0rsa.com",
            "ParameterKey": "WFTextActionText",
            "Text": (
                "Petmon server URL\n\n"
                "Use the site address from your browser, including https://.\n"
                "Example: https://petmon.j0rsa.com"
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
                "Copy it from Petmon Settings → Developer mode."
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

    menu_url_template = f"{PLACEHOLDER}{MENU_PATH}?pet_id={PLACEHOLDER}&date={PLACEHOLDER}"
    take_url_template = f"{PLACEHOLDER}{TAKE_PATH}{PLACEHOLDER}"
    take_pill_url_template = f"{PLACEHOLDER}{TAKE_PATH}{PLACEHOLDER}?dose_fraction={PLACEHOLDER}"
    take_liquid_url_template = f"{PLACEHOLDER}{TAKE_PATH}{PLACEHOLDER}?liquid_dose_ml={PLACEHOLDER}"
    auth_template = f"Bearer {PLACEHOLDER}"

    repeat_uuid = str(uuid.uuid4()).upper()
    split_uuid = str(uuid.uuid4()).upper()
    token_uuid = str(uuid.uuid4()).upper()
    kind_uuid = str(uuid.uuid4()).upper()
    fractions_csv_uuid = str(uuid.uuid4()).upper()
    split_fractions_uuid = str(uuid.uuid4()).upper()
    picked_fraction_uuid = str(uuid.uuid4()).upper()
    ml_amount_uuid = str(uuid.uuid4()).upper()
    if_kind_uuid = str(uuid.uuid4()).upper()
    if_liquid_uuid = str(uuid.uuid4()).upper()
    post_scheduled_uuid = str(uuid.uuid4()).upper()
    post_pill_uuid = str(uuid.uuid4()).upper()
    post_liquid_uuid = str(uuid.uuid4()).upper()

    kind_ref = wf_output_ref(kind_uuid, "Kind")

    actions: list[dict] = [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": uid_server,
                "CustomOutputName": "Server URL",
                "WFTextActionText": "https://petmon.j0rsa.com",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": uid_pet,
                "CustomOutputName": "Pet ID",
                "WFTextActionText": "",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": uid_api_key,
                "CustomOutputName": "API Key",
                "WFTextActionText": "",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.date",
            "WFWorkflowActionParameters": {
                "UUID": uid_date,
                "WFDateActionMode": "Current Date",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
            "WFWorkflowActionParameters": {
                "UUID": uid_date_fmt,
                "WFDateFormatStyle": "Custom",
                "WFDateFormat": "yyyy-MM-dd",
                "WFISO8601IncludeTime": False,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "WFURL": wf_token_string(
                    menu_url_template,
                    [
                        (uid_server, "Server URL"),
                        (uid_pet, "Pet ID"),
                        (uid_date_fmt, "Formatted Date"),
                    ],
                ),
                "WFHTTPMethod": "GET",
                "WFHTTPHeaders": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                "WFItemType": 0,
                                "WFKey": wf_text("Authorization"),
                                "WFValue": wf_token_string(
                                    auth_template,
                                    [(uid_api_key, "API Key")],
                                ),
                            }
                        ]
                    },
                    "WFSerializationType": "WFDictionaryFieldValue",
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "WFDictionaryKey": "lines",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefromlist",
            "WFWorkflowActionParameters": {
                "WFChooseFromListActionShowMultipleSelection": True,
                "WFChooseFromListActionPrompt": "Select meds to log",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.each",
            "WFWorkflowActionParameters": {
                "UUID": repeat_uuid,
                "GroupingIdentifier": repeat_uuid,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.text.split",
            "WFWorkflowActionParameters": {
                "UUID": split_uuid,
                "GroupingIdentifier": repeat_uuid,
                "WFTextSeparator": "Custom",
                "WFTextCustomSeparator": "|",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": token_uuid,
                "GroupingIdentifier": repeat_uuid,
                "CustomOutputName": "Token",
                "WFItemIndex": 2,
                "WFItemSpecifier": "Item At Index",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": kind_uuid,
                "GroupingIdentifier": repeat_uuid,
                "CustomOutputName": "Kind",
                "WFItemIndex": 3,
                "WFItemSpecifier": "Item At Index",
            },
        },
        wf_conditional(
            if_kind_uuid,
            repeat_uuid,
            0,
            compare_to="optional_pill",
            input_ref=kind_ref,
        ),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": fractions_csv_uuid,
                "GroupingIdentifier": repeat_uuid,
                "CustomOutputName": "Fractions CSV",
                "WFItemIndex": 4,
                "WFItemSpecifier": "Item At Index",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.text.split",
            "WFWorkflowActionParameters": {
                "UUID": split_fractions_uuid,
                "GroupingIdentifier": repeat_uuid,
                "WFTextSeparator": "Custom",
                "WFTextCustomSeparator": ",",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefromlist",
            "WFWorkflowActionParameters": {
                "UUID": picked_fraction_uuid,
                "GroupingIdentifier": repeat_uuid,
                "CustomOutputName": "Dose fraction",
                "WFChooseFromListActionPrompt": "Dose fraction",
            },
        },
        post_take_action(
            repeat_group=repeat_uuid,
            action_uuid=post_pill_uuid,
            uid_server=uid_server,
            uid_api_key=uid_api_key,
            url_value=wf_token_string(
                take_pill_url_template,
                [
                    (uid_server, "Server URL"),
                    (token_uuid, "Token"),
                    (picked_fraction_uuid, "Dose fraction"),
                ],
            ),
        ),
        wf_conditional(if_kind_uuid, repeat_uuid, 1),
        wf_conditional(
            if_liquid_uuid,
            repeat_uuid,
            0,
            compare_to="optional_liquid",
            input_ref=kind_ref,
        ),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
            "WFWorkflowActionParameters": {
                "UUID": ml_amount_uuid,
                "GroupingIdentifier": repeat_uuid,
                "CustomOutputName": "Liquid ml",
                "WFAskActionPrompt": "Liquid dose (ml)",
                "WFInputType": "Number",
            },
        },
        post_take_action(
            repeat_group=repeat_uuid,
            action_uuid=post_liquid_uuid,
            uid_server=uid_server,
            uid_api_key=uid_api_key,
            url_value=wf_token_string(
                take_liquid_url_template,
                [
                    (uid_server, "Server URL"),
                    (token_uuid, "Token"),
                    (ml_amount_uuid, "Liquid ml"),
                ],
            ),
        ),
        wf_conditional(if_liquid_uuid, repeat_uuid, 1),
        post_take_action(
            repeat_group=repeat_uuid,
            action_uuid=post_scheduled_uuid,
            uid_server=uid_server,
            uid_api_key=uid_api_key,
            url_value=wf_token_string(
                take_url_template,
                [
                    (uid_server, "Server URL"),
                    (token_uuid, "Token"),
                ],
            ),
        ),
        wf_conditional(if_liquid_uuid, repeat_uuid, 2),
        wf_conditional(if_kind_uuid, repeat_uuid, 2),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.showresult",
            "WFWorkflowActionParameters": {
                "Text": wf_text("Logged selected meds in Petmon."),
            },
        },
    ]

    return {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "2700.0.4",
        "WFWorkflowClientRelease": "2.2",
        "WFWorkflowMinimumClientVersion": 900,
        "WFWorkflowMinimumClientVersionString": "900",
        "WFWorkflowName": SHORTCUT_NAME,
        "WFWorkflowImportQuestions": import_questions,
        "WFWorkflowIcon": {
            "WFWorkflowIconStartColor": 463140863,
            "WFWorkflowIconGlyphNumber": 59788,
        },
        "WFWorkflowTypes": ["NCWidget", "WatchKit"],
        "WFWorkflowInputContentItemClasses": [
            "WFStringContentItem",
            "WFURLContentItem",
        ],
        "WFWorkflowHasOutputFallback": False,
    }


def sign(unsigned_plist: Path, signed_out: Path) -> None:
    subprocess.run(
        ["plutil", "-convert", "binary1", "-o", str(BINARY), str(unsigned_plist)],
        check=True,
    )
    subprocess.run(
        [
            "shortcuts",
            "sign",
            "--mode",
            "anyone",
            "--input",
            str(BINARY),
            "--output",
            str(signed_out),
        ],
        check=True,
    )


def main() -> int:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    workflow = build_workflow()
    with UNSIGNED.open("wb") as fh:
        plistlib.dump(workflow, fh, fmt=plistlib.FMT_XML)
    print(f"Wrote {UNSIGNED}")
    if sys.platform != "darwin":
        print("Skipping sign step (macOS only). Commit a signed file from a Mac.")
        return 0
    sign(UNSIGNED, SIGNED)
    print(f"Signed {SIGNED}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
