"""Serialization helpers for building Apple Shortcuts workflow plists.

Shortcuts stores a workflow as a `WFWorkflowActions` array of
`{WFWorkflowActionIdentifier, WFWorkflowActionParameters}` dicts. Values that
reference earlier actions are "token" structures, and control flow is encoded
positionally with `WFControlFlowMode` markers (0 = start, 1 = else, 2 = end)
sharing a `GroupingIdentifier`.

Only the subset of actions the Petmon shortcut needs lives here. Keep this
module free of Petmon specifics so `shortcut_lint` and `shortcut_sim` can be
used for any generated workflow.
"""

from __future__ import annotations

import uuid

# Object Replacement Character: marks an attachment slot inside a token string.
PLACEHOLDER = "￼"

# Control flow modes.
FLOW_START = 0
FLOW_ELSE = 1
FLOW_END = 2

# WFCondition 4 == "is" (equals). The only condition Petmon needs, and the only
# one the shipped shortcut has ever used.
CONDITION_EQUALS = 4

# Magic variables produced by a repeat action rather than by `setvariable`.
LOOP_MAGIC_NAMES = ("Repeat Item", "Repeat Index")

_NAMESPACE = uuid.uuid5(uuid.NAMESPACE_URL, "https://petmon.j0rsa.com/shortcuts")


def stable_uuid(scope: str, key: str) -> str:
    """Deterministic action UUID.

    Random UUIDs would make every rebuild produce a different plist, which
    churns the committed binary and hides real logic changes. `scope` is a
    version marker: bump it only when you *want* every id to change.
    """
    return str(uuid.uuid5(_NAMESPACE, f"{scope}/{key}")).upper()


# ── value serialization ────────────────────────────────────────────────────


def wf_text(value: str) -> dict:
    """A literal string field."""
    return {
        "Value": {"string": value, "attachmentsByRange": {}},
        "WFSerializationType": "WFTextTokenString",
    }


def wf_output_ref(output_uuid: str, output_name: str) -> dict:
    """A whole-field reference to an earlier action's output."""
    return {
        "Value": {
            "OutputUUID": output_uuid,
            "OutputName": output_name,
            "Type": "ActionOutput",
        },
        "WFSerializationType": "WFTextTokenAttachment",
    }


def wf_variable_ref(name: str) -> dict:
    """A whole-field reference to a named variable set earlier in the run."""
    return {
        "Value": {"Type": "Variable", "VariableName": name},
        "WFSerializationType": "WFTextTokenAttachment",
    }


def attachment(ref: tuple[str | None, str]) -> dict:
    """Inline attachment payload for a token string slot.

    `(uuid, name)` references an action output; `(None, name)` references a
    named variable.
    """
    ref_uuid, ref_name = ref
    if ref_uuid is None:
        return {"Type": "Variable", "VariableName": ref_name}
    return {"Type": "ActionOutput", "OutputUUID": ref_uuid, "OutputName": ref_name}


def wf_token_string(template: str, refs: list[tuple[str | None, str]]) -> dict:
    """A string with `PLACEHOLDER` slots filled by action outputs/variables.

    `refs` must be in the same order as the placeholders in `template`.
    """
    attachments: dict[str, dict] = {}
    search_from = 0
    for ref in refs:
        idx = template.find(PLACEHOLDER, search_from)
        if idx == -1:
            raise ValueError(f"missing placeholder in template: {template!r}")
        attachments[f"{{{idx}, 1}}"] = attachment(ref)
        search_from = idx + 1
    extra = template.find(PLACEHOLDER, search_from)
    if extra != -1:
        raise ValueError(f"unfilled placeholder at {extra} in {template!r}")
    return {
        "Value": {"string": template, "attachmentsByRange": attachments},
        "WFSerializationType": "WFTextTokenString",
    }


def single_token(ref: tuple[str | None, str]) -> dict:
    """A token string holding exactly one attachment and nothing else."""
    return wf_token_string(PLACEHOLDER, [ref])


# ── actions ────────────────────────────────────────────────────────────────


def action(identifier: str, params: dict) -> dict:
    return {
        "WFWorkflowActionIdentifier": f"is.workflow.actions.{identifier}",
        "WFWorkflowActionParameters": params,
    }


def get_text(*, uuid_: str, name: str, text: str = "") -> dict:
    """Text action. Import questions overwrite `WFTextActionText` on install."""
    return action(
        "gettext",
        {"UUID": uuid_, "CustomOutputName": name, "WFTextActionText": text},
    )


def current_date(*, uuid_: str) -> dict:
    return action("date", {"UUID": uuid_, "WFDateActionMode": "Current Date"})


def format_date(*, uuid_: str, name: str, fmt: str, date_ref: dict) -> dict:
    """Format Date.

    Both the explicit `WFDate` input and implicit chaining are used: emit this
    directly after its `current_date` action so the action still works if a
    future Shortcuts release renames the input key.
    """
    return action(
        "format.date",
        {
            "UUID": uuid_,
            "CustomOutputName": name,
            "WFDateFormatStyle": "Custom",
            "WFDateFormat": fmt,
            "WFISO8601IncludeTime": False,
            "WFDate": date_ref,
        },
    )


def http_request(
    *,
    uuid_: str,
    name: str | None,
    url: dict,
    method: str,
    bearer_ref: tuple[str | None, str],
    group: str | None = None,
) -> dict:
    """Get Contents of URL with an `Authorization: Bearer …` header.

    Shortcuts raises a run-time error on non-2xx responses, so failures are
    loud without any explicit status handling.
    """
    params: dict = {
        "UUID": uuid_,
        "WFURL": url,
        "WFHTTPMethod": method,
        "WFHTTPHeaders": {
            "Value": {
                "WFDictionaryFieldValueItems": [
                    {
                        "WFItemType": 0,
                        "WFKey": wf_text("Authorization"),
                        "WFValue": wf_token_string(f"Bearer {PLACEHOLDER}", [bearer_ref]),
                    }
                ]
            },
            "WFSerializationType": "WFDictionaryFieldValue",
        },
    }
    if name:
        params["CustomOutputName"] = name
    if group:
        params["GroupingIdentifier"] = group
    return action("downloadurl", params)


def dictionary_value(
    *, uuid_: str, name: str, key: str, source: dict, group: str | None = None
) -> dict:
    params = {
        "UUID": uuid_,
        "CustomOutputName": name,
        "WFDictionaryKey": key,
        "WFInput": source,
    }
    if group:
        params["GroupingIdentifier"] = group
    return action("getvalueforkey", params)


def split_text(
    *, uuid_: str, name: str, separator: str, source: dict, group: str | None = None
) -> dict:
    params = {
        "UUID": uuid_,
        "CustomOutputName": name,
        "WFTextSeparator": "Custom",
        "WFTextCustomSeparator": separator,
        "WFInput": source,
    }
    if group:
        params["GroupingIdentifier"] = group
    return action("text.split", params)


def item_at_index(
    *, uuid_: str, name: str, index: int, source: dict, group: str | None = None
) -> dict:
    """Get Item from List — 1-based index."""
    params = {
        "UUID": uuid_,
        "CustomOutputName": name,
        "WFItemIndex": index,
        "WFItemSpecifier": "Item At Index",
        "WFInput": source,
    }
    if group:
        params["GroupingIdentifier"] = group
    return action("getitemfromlist", params)


def choose_from_list(
    *,
    uuid_: str,
    name: str,
    prompt: str,
    source: dict,
    multiple: bool = False,
    group: str | None = None,
) -> dict:
    params: dict = {
        "UUID": uuid_,
        "CustomOutputName": name,
        "WFInput": source,
        "WFChooseFromListActionPrompt": prompt,
    }
    if multiple:
        params["WFChooseFromListActionSelectMultiple"] = True
        # Older clients read the longer key; set both so the picker stays
        # multi-select regardless of client version.
        params["WFChooseFromListActionShowMultipleSelection"] = True
    if group:
        params["GroupingIdentifier"] = group
    return action("choosefromlist", params)


def ask_for_input(
    *, uuid_: str, name: str, prompt: str, input_type: str = "Number", group: str | None = None
) -> dict:
    params = {
        "UUID": uuid_,
        "CustomOutputName": name,
        "WFAskActionPrompt": prompt,
        "WFInputType": input_type,
    }
    if group:
        params["GroupingIdentifier"] = group
    return action("ask", params)


def append_to_variable(*, name: str, value: dict, group: str | None = None) -> dict:
    """Add to Variable — creates the variable as a list on first append."""
    params = {"WFVariableName": name, "WFInput": value}
    if group:
        params["GroupingIdentifier"] = group
    return action("appendvariable", params)


def show_result(*, text: dict, group: str | None = None) -> dict:
    params: dict = {"Text": text}
    if group:
        params["GroupingIdentifier"] = group
    return action("showresult", params)


def if_equals(
    *,
    group: str,
    subject: dict,
    expected: str | dict,
) -> dict:
    """`If <subject> is <expected>` — start of a conditional group.

    `subject` is a whole-field reference (`wf_output_ref` / `wf_variable_ref`).
    `expected` is a literal string or a token string for a dynamic comparison.
    """
    params: dict = {
        "UUID": group,
        "GroupingIdentifier": group,
        "WFControlFlowMode": FLOW_START,
        "WFCondition": CONDITION_EQUALS,
        "WFConditionalActionString": expected,
        "WFInput": {"Type": "Variable", "Variable": subject},
    }
    return action("conditional", params)


def otherwise(*, group: str) -> dict:
    return action(
        "conditional",
        {"UUID": group, "GroupingIdentifier": group, "WFControlFlowMode": FLOW_ELSE},
    )


def end_if(*, group: str) -> dict:
    return action(
        "conditional",
        {"UUID": group, "GroupingIdentifier": group, "WFControlFlowMode": FLOW_END},
    )


def repeat_each(*, group: str, source: dict) -> dict:
    return action(
        "repeat.each",
        {
            "UUID": group,
            "GroupingIdentifier": group,
            "WFControlFlowMode": FLOW_START,
            "WFInput": source,
        },
    )


def end_repeat(*, group: str, uuid_: str) -> dict:
    return action(
        "repeat.each",
        {"UUID": uuid_, "GroupingIdentifier": group, "WFControlFlowMode": FLOW_END},
    )


def repeat_item(group: str) -> dict:
    """Whole-field reference to a *specific* loop's current item.

    Never reference `Repeat Item` by name: with nested loops the bare name
    resolves to the innermost loop, which silently reads the wrong value.
    """
    return wf_output_ref(group, "Repeat Item")
