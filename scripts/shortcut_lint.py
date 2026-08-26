"""Static checks for a generated Apple Shortcuts workflow.

A malformed workflow still imports and runs — it just does the wrong thing
silently. These checks catch the mistakes that cost us a shipped release:

* referencing `Repeat Item` by bare name inside nested loops, so the condition
  compares against the innermost loop's item instead of the intended one
* referencing an action output that is produced later (or never)
* unbalanced / interleaved control-flow markers

Run via `python3 scripts/build-med-intake-shortcut.py --validate-only`.
"""

from __future__ import annotations

from typing import Any

from shortcut_plist import (
    FLOW_ELSE,
    FLOW_END,
    FLOW_START,
    LOOP_MAGIC_NAMES,
    PLACEHOLDER,
)

CONTROL_FLOW_IDENTIFIERS = (
    "is.workflow.actions.conditional",
    "is.workflow.actions.repeat.each",
    "is.workflow.actions.repeat.count",
    "is.workflow.actions.choosefrommenu",
)

VARIABLE_WRITERS = (
    "is.workflow.actions.setvariable",
    "is.workflow.actions.appendvariable",
)


def _walk(value: Any):
    """Yield every dict nested anywhere inside `value`."""
    if isinstance(value, dict):
        yield value
        for item in value.values():
            yield from _walk(item)
    elif isinstance(value, list):
        for item in value:
            yield from _walk(item)


def _output_refs(params: dict) -> list[tuple[str, str]]:
    refs = []
    for node in _walk(params):
        if node.get("Type") == "ActionOutput" and "OutputUUID" in node:
            refs.append((node["OutputUUID"], node.get("OutputName", "")))
    return refs


def _variable_refs(params: dict) -> list[str]:
    names = []
    for node in _walk(params):
        if node.get("Type") == "Variable" and "VariableName" in node:
            names.append(node["VariableName"])
    return names


def _token_string_errors(params: dict, where: str) -> list[str]:
    errors = []
    for node in _walk(params):
        if node.get("WFSerializationType") != "WFTextTokenString":
            continue
        value = node.get("Value", {})
        template = value.get("string", "")
        attachments = value.get("attachmentsByRange", {})
        slots = template.count(PLACEHOLDER)
        if slots != len(attachments):
            errors.append(
                f"{where}: token string has {slots} placeholder(s) but "
                f"{len(attachments)} attachment(s): {template!r}"
            )
        for key in attachments:
            try:
                offset = int(key.strip("{}").split(",")[0])
            except (ValueError, IndexError):
                errors.append(f"{where}: malformed attachment range {key!r}")
                continue
            if offset >= len(template) or template[offset] != PLACEHOLDER:
                errors.append(
                    f"{where}: attachment range {key} does not point at a "
                    f"placeholder in {template!r}"
                )
    return errors


def validate_workflow(workflow: dict) -> list[str]:
    """Return a list of human-readable problems; empty means the plist is sane."""
    errors: list[str] = []
    actions = workflow.get("WFWorkflowActions", [])
    if not actions:
        return ["workflow has no actions"]

    # uuid -> (action index, set of output names)
    produced: dict[str, tuple[int, set[str]]] = {}
    # group id -> kind, for currently open control-flow groups
    stack: list[tuple[str, str]] = []
    known_variables: set[str] = set()
    seen_output_uuids: set[str] = set()

    for index, entry in enumerate(actions):
        identifier = entry.get("WFWorkflowActionIdentifier", "?")
        params = entry.get("WFWorkflowActionParameters", {})
        where = f"action {index} ({identifier.rsplit('.', 1)[-1]})"
        mode = params.get("WFControlFlowMode")
        group = params.get("GroupingIdentifier")
        is_control_flow = identifier in CONTROL_FLOW_IDENTIFIERS

        errors.extend(_token_string_errors(params, where))

        # References are resolved in the scope *before* this action runs.
        for ref_uuid, ref_name in _output_refs(params):
            if ref_uuid not in produced:
                errors.append(
                    f"{where}: references output {ref_name!r} of unknown or "
                    f"later action {ref_uuid}"
                )
                continue
            producer_index, names = produced[ref_uuid]
            if producer_index > index:
                errors.append(f"{where}: references output of later {producer_index}")
            if ref_name and names and ref_name not in names:
                errors.append(
                    f"{where}: action {producer_index} has no output named {ref_name!r} "
                    f"(has {sorted(names)})"
                )
            if ref_name in LOOP_MAGIC_NAMES and ref_uuid not in [g for g, _ in stack]:
                errors.append(
                    f"{where}: references {ref_name!r} of loop {ref_uuid} from "
                    "outside that loop"
                )

        for name in _variable_refs(params):
            if name in LOOP_MAGIC_NAMES:
                errors.append(
                    f"{where}: references {name!r} by bare name — with nested loops "
                    "this silently resolves to the innermost loop; use "
                    "shortcut_plist.repeat_item(<loop group>) instead"
                )
            elif name not in known_variables:
                errors.append(f"{where}: reads variable {name!r} before anything sets it")

        if identifier in VARIABLE_WRITERS:
            variable_name = params.get("WFVariableName")
            if not variable_name:
                errors.append(f"{where}: variable writer without WFVariableName")
            else:
                known_variables.add(variable_name)

        if identifier == "is.workflow.actions.getitemfromlist":
            item_index = params.get("WFItemIndex")
            if isinstance(item_index, int) and item_index < 1:
                errors.append(f"{where}: WFItemIndex is 1-based, got {item_index}")

        if identifier == "is.workflow.actions.downloadurl":
            headers = params.get("WFHTTPHeaders", {})
            header_keys = [
                item.get("WFKey", {}).get("Value", {}).get("string")
                for item in headers.get("Value", {}).get("WFDictionaryFieldValueItems", [])
            ]
            if "Authorization" not in header_keys:
                errors.append(f"{where}: HTTP request without an Authorization header")
            if not params.get("WFURL"):
                errors.append(f"{where}: HTTP request without a URL")

        if is_control_flow:
            if group is None:
                errors.append(f"{where}: control flow action without GroupingIdentifier")
            elif mode == FLOW_START:
                stack.append((group, identifier))
            elif mode == FLOW_ELSE:
                if not stack or stack[-1][0] != group:
                    errors.append(
                        f"{where}: 'otherwise' for group {group} is not inside the "
                        "matching conditional"
                    )
            elif mode == FLOW_END:
                if not stack or stack[-1][0] != group:
                    open_group = stack[-1][0] if stack else None
                    errors.append(
                        f"{where}: closes group {group} but innermost open group is "
                        f"{open_group}"
                    )
                else:
                    stack.pop()
            else:
                errors.append(f"{where}: unexpected WFControlFlowMode {mode!r}")

        # Record produced outputs after reference checks so an action cannot
        # reference itself.
        action_uuid = params.get("UUID")
        if not action_uuid:
            continue
        if identifier == "is.workflow.actions.repeat.each" and mode == FLOW_START:
            produced[action_uuid] = (index, set(LOOP_MAGIC_NAMES))
            continue
        if is_control_flow:
            continue
        if action_uuid in seen_output_uuids:
            errors.append(f"{where}: duplicate action UUID {action_uuid}")
        seen_output_uuids.add(action_uuid)
        names = set()
        if params.get("CustomOutputName"):
            names.add(params["CustomOutputName"])
        produced[action_uuid] = (index, names)

    for group, identifier in stack:
        errors.append(f"control flow group {group} ({identifier}) is never closed")

    for question in workflow.get("WFWorkflowImportQuestions", []):
        action_index = question.get("ActionIndex")
        if not isinstance(action_index, int) or not 0 <= action_index < len(actions):
            errors.append(f"import question points at missing action {action_index!r}")
            continue
        target = actions[action_index]
        key = question.get("ParameterKey")
        if key not in target.get("WFWorkflowActionParameters", {}):
            errors.append(
                f"import question for action {action_index} sets {key!r}, which that "
                f"action ({target.get('WFWorkflowActionIdentifier')}) does not have"
            )

    return errors


def assert_valid(workflow: dict) -> None:
    errors = validate_workflow(workflow)
    if errors:
        raise ValueError(
            "generated workflow is invalid:\n  - " + "\n  - ".join(errors)
        )
