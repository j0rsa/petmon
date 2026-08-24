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


def wf_text(value: str) -> dict:
    return {
        "Value": {"string": value, "attachmentsByRange": {}},
        "WFSerializationType": "WFTextTokenString",
    }


def wf_token_string(template: str, attachments: dict[str, dict]) -> dict:
    return {
        "Value": {
            "string": template,
            "attachmentsByRange": attachments,
        },
        "WFSerializationType": "WFTextTokenString",
    }


def action_output(uuid: str, output_name: str = "Text") -> dict:
    return {
        "Type": "ActionOutput",
        "OutputUUID": uuid,
        "OutputName": output_name,
    }


def attachment(range_key: str, output_uuid: str, output_name: str = "Text") -> tuple[str, dict]:
    return range_key, {
        "Type": "ActionOutput",
        "OutputUUID": output_uuid,
        "OutputName": output_name,
    }


def build_workflow() -> dict:
    # Stable UUIDs for cross-action references.
    uid_server = str(uuid.uuid4()).upper()
    uid_pet = str(uuid.uuid4()).upper()
    uid_api_key = str(uuid.uuid4()).upper()
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
                "Example: https://petmon.j0rsa.com\n\n"
                "Docs: https://github.com/j0rsa/petmon"
            ),
        },
        {
            "ActionIndex": 1,
            "Category": "Parameter",
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Text": (
                "Pet ID\n\n"
                "UUID of the pet you're logging meds for.\n"
                "In Petmon: open the pet, copy the id from Settings → Developer mode, "
                "or from the browser URL when viewing that pet."
            ),
        },
        {
            "ActionIndex": 2,
            "Category": "Parameter",
            "DefaultValue": "",
            "ParameterKey": "WFTextActionText",
            "Text": (
                "API key\n\n"
                "Create one in Petmon → Settings → API tokens (needs Write scope).\n"
                "Stored in plain text on this device."
            ),
        },
    ]

    menu_url = wf_token_string(
        "￼/api/v1/shortcuts/med-intake/menu?pet_id=￼&date=￼",
        {
            "{0, 1}": action_output(uid_server),
            "{1, 2}": action_output(uid_pet),
            "{2, 3}": action_output(uid_date_fmt, "Formatted Date"),
        },
    )

    auth_header = wf_token_string(
        "Bearer ￼",
        {"{7, 8}": action_output(uid_api_key)},
    )

    take_url = wf_token_string(
        "￼/api/v1/shortcuts/med-intake/take/￼",
        {
            "{0, 1}": action_output(uid_server),
            "{1, 2}": {
                "Type": "ActionOutput",
                "OutputUUID": str(uuid.uuid4()).upper(),  # filled below via repeat item
                "OutputName": "Item from List",
            },
        },
    )

    actions: list[dict] = [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": uid_server,
                "WFTextActionText": "https://petmon.j0rsa.com",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": uid_pet,
                "WFTextActionText": "",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": uid_api_key,
                "WFTextActionText": "",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.date.current",
            "WFWorkflowActionParameters": {},
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.format.date",
            "WFWorkflowActionParameters": {
                "UUID": uid_date_fmt,
                "WFDateFormatStyle": "Custom",
                "WFDateFormat": "yyyy-MM-dd",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "WFURL": menu_url,
                "WFHTTPMethod": "GET",
                "WFHTTPHeaders": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                "WFItemType": 0,
                                "WFKey": wf_text("Authorization"),
                                "WFValue": auth_header,
                            }
                        ]
                    },
                    "WFSerializationType": "WFDictionaryFieldValue",
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.detectDictionary",
            "WFWorkflowActionParameters": {},
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
            "WFWorkflowActionIdentifier": "is.workflow.actions.text.split",
            "WFWorkflowActionParameters": {
                "WFTextSeparator": "Custom",
                "WFTextCustomSeparator": "|",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "WFItemIndex": 2,
                "WFItemSpecifier": "Item At Index",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "WFURL": wf_token_string(
                    "￼/api/v1/shortcuts/med-intake/take/￼",
                    {
                        "{0, 1}": action_output(uid_server),
                        "{1, 2}": {
                            "Type": "ActionOutput",
                            "OutputName": "Item from List",
                        },
                    },
                ),
                "WFHTTPMethod": "POST",
                "WFHTTPHeaders": {
                    "Value": {
                        "WFDictionaryFieldValueItems": [
                            {
                                "WFItemType": 0,
                                "WFKey": wf_text("Authorization"),
                                "WFValue": auth_header,
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

    # Wire repeat-around split → get token → post take.
    repeat_uuid = str(uuid.uuid4()).upper()
    split_uuid = str(uuid.uuid4()).upper()
    token_uuid = str(uuid.uuid4()).upper()
    post_uuid = str(uuid.uuid4()).upper()

    actions[9]["WFWorkflowActionParameters"]["UUID"] = split_uuid
    actions[10]["WFWorkflowActionParameters"]["UUID"] = token_uuid
    actions[11]["WFWorkflowActionParameters"]["UUID"] = post_uuid

    repeat_block = [
        actions[9],
        actions[10],
        actions[11],
    ]
    for child in repeat_block:
        child["WFWorkflowActionParameters"]["GroupingIdentifier"] = repeat_uuid

    actions = actions[:9] + [
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.each",
            "WFWorkflowActionParameters": {
                "UUID": repeat_uuid,
                "GroupingIdentifier": repeat_uuid,
            },
        },
        *repeat_block,
    ]

    return {
        "WFWorkflowActions": actions,
        "WFWorkflowClientVersion": "2302.0.4",
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
