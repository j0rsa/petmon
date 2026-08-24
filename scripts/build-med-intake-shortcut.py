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
UNSIGNED = OUT_DIR / "petmon-med-intake.unsigned.plist"
BINARY = OUT_DIR / "petmon-med-intake.unsigned.shortcut"
SIGNED = OUT_DIR / "petmon-med-intake.shortcut"
PLACEHOLDER = "\ufffc"


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

    menu_url_template = f"{PLACEHOLDER}/api/v1/shortcuts/med-intake/menu?pet_id={PLACEHOLDER}&date={PLACEHOLDER}"
    take_url_template = f"{PLACEHOLDER}/api/v1/shortcuts/med-intake/take/{PLACEHOLDER}"
    auth_template = f"Bearer {PLACEHOLDER}"

    repeat_uuid = str(uuid.uuid4()).upper()
    split_uuid = str(uuid.uuid4()).upper()
    token_uuid = str(uuid.uuid4()).upper()
    post_uuid = str(uuid.uuid4()).upper()

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
                "WFDictionaryKey": "choices",
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
                "WFItemIndex": 2,
                "WFItemSpecifier": "Item At Index",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": post_uuid,
                "GroupingIdentifier": repeat_uuid,
                "WFURL": wf_token_string(
                    take_url_template,
                    [
                        (uid_server, "Server URL"),
                        (token_uuid, "Item from List"),
                    ],
                ),
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
        },
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
        "WFWorkflowName": "Petmon Take Meds",
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
