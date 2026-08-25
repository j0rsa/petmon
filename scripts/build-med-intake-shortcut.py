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


def wf_input_ref(output_uuid: str, output_name: str) -> dict:
    return wf_output_ref(output_uuid, output_name)


def wf_named_variable(name: str) -> dict:
    return {
        "Value": {"Type": "Variable", "VariableName": name},
        "WFSerializationType": "WFTextTokenAttachment",
    }


def wf_conditional_input(
    *,
    output_uuid: str | None = None,
    output_name: str | None = None,
    variable_name: str | None = None,
) -> dict:
    if variable_name is not None:
        inner = wf_named_variable(variable_name)
    elif output_uuid is not None and output_name is not None:
        inner = wf_output_ref(output_uuid, output_name)
    else:
        raise ValueError("conditional input requires output or variable")
    return {"Type": "Variable", "Variable": inner}


def wf_conditional(
    group: str,
    mode: int,
    *,
    compare_to: str | None = None,
    compare_variable: str | None = None,
    input_ref: dict | None = None,
    input_variable: str | None = None,
    output_uuid: str | None = None,
    output_name: str | None = None,
) -> dict:
    params: dict = {
        "UUID": group,
        "GroupingIdentifier": group,
        "WFControlFlowMode": mode,
    }
    if mode == 0:
        params["WFCondition"] = 4
        if compare_variable is not None:
            params["WFConditionalActionString"] = wf_named_variable(compare_variable)
        else:
            params["WFConditionalActionString"] = compare_to or ""
        if input_variable is not None:
            params["WFInput"] = wf_conditional_input(variable_name=input_variable)
        elif input_ref is not None:
            params["WFInput"] = {"Type": "Variable", "Variable": input_ref}
        elif output_uuid is not None and output_name is not None:
            params["WFInput"] = wf_conditional_input(
                output_uuid=output_uuid,
                output_name=output_name,
            )
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
        "WFWorkflowActionParameters": params,
    }


def repeat_each_start(group: str, wf_input: dict) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.each",
        "WFWorkflowActionParameters": {
            "UUID": group,
            "GroupingIdentifier": group,
            "WFControlFlowMode": 0,
            "WFInput": wf_input,
        },
    }


def repeat_each_end(group: str, end_uuid: str) -> dict:
    return {
        "WFWorkflowActionIdentifier": "is.workflow.actions.repeat.each",
        "WFWorkflowActionParameters": {
            "UUID": end_uuid,
            "GroupingIdentifier": group,
            "WFControlFlowMode": 2,
        },
    }


def post_take_action(
    *,
    group: str,
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
            "GroupingIdentifier": group,
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

    menu_url_template = f"{PLACEHOLDER}{MENU_PATH}?pet_id={PLACEHOLDER}&date={PLACEHOLDER}"
    take_url_template = f"{PLACEHOLDER}{TAKE_PATH}{PLACEHOLDER}"
    take_pill_url_template = f"{PLACEHOLDER}{TAKE_PATH}{PLACEHOLDER}?dose_fraction={PLACEHOLDER}"
    take_liquid_url_template = f"{PLACEHOLDER}{TAKE_PATH}{PLACEHOLDER}?liquid_dose_ml={PLACEHOLDER}"
    auth_template = f"Bearer {PLACEHOLDER}"

    uid_menu = str(uuid.uuid4()).upper()
    uid_labels = str(uuid.uuid4()).upper()
    uid_lines = str(uuid.uuid4()).upper()
    uid_choose = str(uuid.uuid4()).upper()

    repeat_sel_uuid = str(uuid.uuid4()).upper()
    repeat_sel_end_uuid = str(uuid.uuid4()).upper()
    repeat_lines_uuid = str(uuid.uuid4()).upper()
    repeat_lines_end_uuid = str(uuid.uuid4()).upper()

    if_line_uuid = str(uuid.uuid4()).upper()
    split_uuid = str(uuid.uuid4()).upper()
    line_label_uuid = str(uuid.uuid4()).upper()
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
                "CustomOutputName": "Formatted Date",
                "WFDateFormatStyle": "Custom",
                "WFDateFormat": "yyyy-MM-dd",
                "WFISO8601IncludeTime": False,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": uid_menu,
                "CustomOutputName": "Menu",
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
                "UUID": uid_labels,
                "CustomOutputName": "Labels",
                "WFDictionaryKey": "labels",
                "WFInput": wf_input_ref(uid_menu, "Menu"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "UUID": uid_lines,
                "CustomOutputName": "Menu lines",
                "WFDictionaryKey": "lines",
                "WFInput": wf_input_ref(uid_menu, "Menu"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefromlist",
            "WFWorkflowActionParameters": {
                "UUID": uid_choose,
                "CustomOutputName": "Selected meds",
                "WFInput": wf_input_ref(uid_labels, "Labels"),
                "WFChooseFromListActionShowMultipleSelection": True,
                "WFChooseFromListActionPrompt": "Select meds to log",
            },
        },
        repeat_each_start(repeat_sel_uuid, wf_input_ref(uid_choose, "Selected meds")),
        repeat_each_start(
            repeat_lines_uuid,
            wf_input_ref(uid_lines, "Menu lines"),
        ),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.text.split",
            "WFWorkflowActionParameters": {
                "UUID": split_uuid,
                "GroupingIdentifier": repeat_lines_uuid,
                "CustomOutputName": "Split line",
                "WFTextSeparator": "Custom",
                "WFTextCustomSeparator": "|",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": line_label_uuid,
                "GroupingIdentifier": repeat_lines_uuid,
                "CustomOutputName": "Line label",
                "WFItemIndex": 1,
                "WFItemSpecifier": "Item At Index",
                "WFInput": wf_input_ref(split_uuid, "Split line"),
            },
        },
        wf_conditional(
            if_line_uuid,
            0,
            compare_variable="Repeat Item",
            output_uuid=line_label_uuid,
            output_name="Line label",
        ),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": token_uuid,
                "GroupingIdentifier": if_line_uuid,
                "CustomOutputName": "Token",
                "WFItemIndex": 2,
                "WFItemSpecifier": "Item At Index",
                "WFInput": wf_input_ref(split_uuid, "Split line"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": kind_uuid,
                "GroupingIdentifier": if_line_uuid,
                "CustomOutputName": "Kind",
                "WFItemIndex": 3,
                "WFItemSpecifier": "Item At Index",
                "WFInput": wf_input_ref(split_uuid, "Split line"),
            },
        },
        wf_conditional(
            if_kind_uuid,
            0,
            compare_to="optional_pill",
            output_uuid=kind_uuid,
            output_name="Kind",
        ),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": fractions_csv_uuid,
                "GroupingIdentifier": if_kind_uuid,
                "CustomOutputName": "Fractions CSV",
                "WFItemIndex": 4,
                "WFItemSpecifier": "Item At Index",
                "WFInput": wf_input_ref(split_uuid, "Split line"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.text.split",
            "WFWorkflowActionParameters": {
                "UUID": split_fractions_uuid,
                "GroupingIdentifier": if_kind_uuid,
                "CustomOutputName": "Fraction options",
                "WFTextSeparator": "Custom",
                "WFTextCustomSeparator": ",",
                "WFInput": wf_input_ref(fractions_csv_uuid, "Fractions CSV"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefromlist",
            "WFWorkflowActionParameters": {
                "UUID": picked_fraction_uuid,
                "GroupingIdentifier": if_kind_uuid,
                "CustomOutputName": "Dose fraction",
                "WFInput": wf_input_ref(split_fractions_uuid, "Fraction options"),
                "WFChooseFromListActionPrompt": "Dose fraction",
            },
        },
        post_take_action(
            group=if_kind_uuid,
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
        wf_conditional(if_kind_uuid, 1),
        wf_conditional(
            if_liquid_uuid,
            0,
            compare_to="optional_liquid",
            output_uuid=kind_uuid,
            output_name="Kind",
        ),
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
            "WFWorkflowActionParameters": {
                "UUID": ml_amount_uuid,
                "GroupingIdentifier": if_liquid_uuid,
                "CustomOutputName": "Liquid ml",
                "WFAskActionPrompt": "Liquid dose (ml)",
                "WFInputType": "Number",
            },
        },
        post_take_action(
            group=if_liquid_uuid,
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
        wf_conditional(if_liquid_uuid, 1),
        post_take_action(
            group=if_liquid_uuid,
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
        wf_conditional(if_liquid_uuid, 2),
        wf_conditional(if_kind_uuid, 2),
        wf_conditional(if_line_uuid, 2),
        repeat_each_end(repeat_lines_uuid, repeat_lines_end_uuid),
        repeat_each_end(repeat_sel_uuid, repeat_sel_end_uuid),
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
