"""A small interpreter for the Apple Shortcuts actions Petmon generates.

Importing a shortcut on a Mac or iPhone needs a GUI confirmation, so the real
engine cannot run in CI. This interpreter executes the *same generated plist*
against either a fake or a real HTTP client, which is enough to prove the
control flow: which requests fire, in what order, with which query parameters.

It deliberately raises on any action it does not implement — a silently skipped
action would defeat the purpose.

Two front ends use it:

* `scripts/tests/test_med_intake_shortcut.py` — fake HTTP, no server
* `scripts/simulate-med-intake-shortcut.py`  — real HTTP against localhost
"""

from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Callable

from shortcut_plist import FLOW_ELSE, FLOW_END, FLOW_START, PLACEHOLDER

# ── HTTP ───────────────────────────────────────────────────────────────────


class HttpError(RuntimeError):
    """Non-2xx response. Shortcuts aborts the run in this case, and so do we."""

    def __init__(self, status: int, url: str, body: str):
        super().__init__(f"HTTP {status} for {url}: {body[:400]}")
        self.status = status
        self.url = url
        self.body = body


@dataclass
class Request:
    method: str
    url: str
    headers: dict[str, str]

    @property
    def path(self) -> str:
        return self.url.split("?", 1)[0]

    @property
    def query(self) -> dict[str, str]:
        if "?" not in self.url:
            return {}
        raw = self.url.split("?", 1)[1]
        out: dict[str, str] = {}
        for part in raw.split("&"):
            if not part:
                continue
            key, _, value = part.partition("=")
            out[key] = value
        return out


@dataclass
class FakeHttp:
    """Serves canned bodies keyed by a substring of the request path."""

    routes: dict[str, Any] = field(default_factory=dict)
    requests: list[Request] = field(default_factory=list)

    def send(self, method: str, url: str, headers: dict[str, str]) -> str:
        self.requests.append(Request(method, url, headers))
        for needle, body in self.routes.items():
            if needle in url:
                if isinstance(body, HttpError):
                    raise body
                return body if isinstance(body, str) else json.dumps(body)
        raise HttpError(404, url, "no fake route matched")


@dataclass
class LiveHttp:
    """Real requests, mirroring how Shortcuts treats failures."""

    timeout: float = 15.0
    requests: list[Request] = field(default_factory=list)

    def send(self, method: str, url: str, headers: dict[str, str]) -> str:
        self.requests.append(Request(method, url, headers))
        request = urllib.request.Request(url, method=method, headers=headers)
        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:  # non-2xx: Shortcuts stops the run
            raise HttpError(exc.code, url, exc.read().decode("utf-8", "replace")) from exc
        except urllib.error.URLError as exc:
            raise HttpError(0, url, str(exc.reason)) from exc


# ── user interaction ───────────────────────────────────────────────────────


def select_everything(prompt: str, items: list[Any]) -> list[Any]:
    """Default picker: behave like a person selecting every offered entry."""
    del prompt
    return items


@dataclass
class ScriptedUser:
    """Stands in for the person tapping through the shortcut.

    `select` picks list entries: a callable receiving `(prompt, items)`.
    `answers` maps an Ask prompt to the typed value.
    """

    select: Callable[[str, list[Any]], Any] = select_everything
    answers: dict[str, Any] = field(default_factory=dict)
    prompts: list[str] = field(default_factory=list)

    def choose(self, prompt: str, items: list[Any], multiple: bool) -> Any:
        self.prompts.append(prompt)
        picked = self.select(prompt, items)
        if multiple:
            return picked if isinstance(picked, list) else [picked]
        if isinstance(picked, list):
            return picked[0] if picked else None
        return picked

    def ask(self, prompt: str) -> Any:
        self.prompts.append(prompt)
        if prompt not in self.answers:
            raise RuntimeError(f"no scripted answer for prompt {prompt!r}")
        return self.answers[prompt]


# ── date formats ───────────────────────────────────────────────────────────

_DATE_TOKENS = [
    ("yyyy", "%Y"),
    ("MM", "%m"),
    ("dd", "%d"),
    ("HH", "%H"),
    ("mm", "%M"),
    ("ss", "%S"),
]


def unicode_date_format(pattern: str) -> str:
    """Translate the ICU pattern subset Shortcuts uses into strftime."""
    out = []
    for chunk in re.split(r"('[^']*')", pattern):
        if chunk.startswith("'") and chunk.endswith("'") and len(chunk) >= 2:
            out.append(chunk[1:-1])  # quoted literal, e.g. 'T'
            continue
        for token, replacement in _DATE_TOKENS:
            chunk = chunk.replace(token, replacement)
        out.append(chunk)
    return "".join(out)


# ── interpreter ────────────────────────────────────────────────────────────


@dataclass
class LoopFrame:
    group: str
    items: list[Any]
    index: int
    start: int


class WorkflowRunner:
    """Executes a workflow plist. See module docstring for the supported subset."""

    def __init__(
        self,
        workflow: dict,
        *,
        http: Any,
        user: ScriptedUser | None = None,
        now: datetime | None = None,
        import_answers: list[str] | None = None,
    ):
        self.workflow = workflow
        self.actions: list[dict] = workflow["WFWorkflowActions"]
        self.http = http
        self.user = user or ScriptedUser()
        self.now = now or datetime(2026, 3, 15, 8, 30, 0)
        self.outputs: dict[str, Any] = {}
        self.variables: dict[str, Any] = {}
        self.messages: list[str] = []
        self.output: Any = None
        self.trace: list[str] = []
        if import_answers is not None:
            self._apply_import_answers(import_answers)
        self._markers = self._index_markers()

    # -- setup ------------------------------------------------------------

    def _apply_import_answers(self, answers: list[str]) -> None:
        """Mimic Shortcuts filling in import questions at install time."""
        questions = self.workflow.get("WFWorkflowImportQuestions", [])
        if len(answers) != len(questions):
            raise ValueError(
                f"expected {len(questions)} import answer(s), got {len(answers)}"
            )
        for answer, question in zip(answers, questions):
            action = self.actions[question["ActionIndex"]]
            action["WFWorkflowActionParameters"][question["ParameterKey"]] = answer

    def _index_markers(self) -> dict[str, dict[int, int]]:
        """group -> {mode: action index} for every control-flow marker."""
        markers: dict[str, dict[int, int]] = {}
        for index, action in enumerate(self.actions):
            params = action.get("WFWorkflowActionParameters", {})
            mode = params.get("WFControlFlowMode")
            group = params.get("GroupingIdentifier")
            if mode is None or group is None:
                continue
            markers.setdefault(group, {})[mode] = index
        return markers

    # -- value resolution -------------------------------------------------

    def _attachment_value(self, node: dict) -> Any:
        if node.get("Type") == "ActionOutput":
            uuid_ = node["OutputUUID"]
            if uuid_ not in self.outputs:
                raise RuntimeError(
                    f"action output {node.get('OutputName')!r} ({uuid_}) read before "
                    "it was produced"
                )
            return self.outputs[uuid_]
        if node.get("Type") == "Variable":
            name = node["VariableName"]
            if name not in self.variables:
                # Shortcuts treats an unset variable as empty rather than failing.
                return ""
            return self.variables[name]
        raise RuntimeError(f"unsupported attachment: {node}")

    def _as_text(self, value: Any) -> str:
        if value is None:
            return ""
        if isinstance(value, bool):
            return "true" if value else "false"
        if isinstance(value, float) and value.is_integer():
            return str(int(value))
        if isinstance(value, list):
            return ", ".join(self._as_text(item) for item in value)
        if isinstance(value, dict):
            return json.dumps(value)
        return str(value)

    def resolve(self, field_value: Any) -> Any:
        """Resolve a parameter value to a Python value."""
        if not isinstance(field_value, dict):
            return field_value
        kind = field_value.get("WFSerializationType")
        if kind == "WFTextTokenAttachment":
            return self._attachment_value(field_value["Value"])
        if kind == "WFTextTokenString":
            value = field_value["Value"]
            template = value.get("string", "")
            attachments = value.get("attachmentsByRange", {})
            if template == PLACEHOLDER and len(attachments) == 1:
                # Whole-field token: keep the native type (list, dict, number).
                return self._attachment_value(next(iter(attachments.values())))
            slots = []
            for key, node in attachments.items():
                offset = int(key.strip("{}").split(",")[0])
                slots.append((offset, node))
            out = []
            cursor = 0
            for offset, node in sorted(slots):
                out.append(template[cursor:offset])
                out.append(self._as_text(self._attachment_value(node)))
                cursor = offset + 1
            out.append(template[cursor:])
            return "".join(out)
        if field_value.get("Type") == "Variable" and "Variable" in field_value:
            return self.resolve(field_value["Variable"])
        if field_value.get("Type") in ("ActionOutput", "Variable"):
            return self._attachment_value(field_value)
        return field_value

    def _headers(self, params: dict) -> dict[str, str]:
        headers: dict[str, str] = {}
        items = (
            params.get("WFHTTPHeaders", {})
            .get("Value", {})
            .get("WFDictionaryFieldValueItems", [])
        )
        for item in items:
            key = self._as_text(self.resolve(item.get("WFKey")))
            headers[key] = self._as_text(self.resolve(item.get("WFValue")))
        return headers

    # -- execution --------------------------------------------------------

    def run(self) -> "WorkflowRunner":
        pc = 0
        loops: list[LoopFrame] = []
        steps = 0
        limit = 100_000
        while pc < len(self.actions):
            steps += 1
            if steps > limit:
                raise RuntimeError("workflow did not terminate")
            action = self.actions[pc]
            identifier = action["WFWorkflowActionIdentifier"].rsplit(".", 1)
            name = action["WFWorkflowActionIdentifier"][len("is.workflow.actions.") :]
            params = action.get("WFWorkflowActionParameters", {})
            mode = params.get("WFControlFlowMode")
            group = params.get("GroupingIdentifier")

            if name == "conditional":
                pc = self._run_conditional(pc, mode, group, params)
                continue
            if name == "repeat.each":
                pc = self._run_repeat(pc, mode, group, params, loops)
                continue

            self._run_simple(name, params, identifier)
            pc += 1
        return self

    def _run_conditional(self, pc: int, mode: Any, group: str, params: dict) -> int:
        markers = self._markers[group]
        if mode == FLOW_START:
            subject = self._as_text(self.resolve(params.get("WFInput")))
            expected = self._as_text(self.resolve(params.get("WFConditionalActionString")))
            taken = subject == expected
            self.trace.append(f"if {subject!r} == {expected!r} -> {taken}")
            if taken:
                return pc + 1
            return (markers.get(FLOW_ELSE, markers[FLOW_END])) + 1
        if mode == FLOW_ELSE:
            # Reached by falling out of the true branch: skip the else body.
            return markers[FLOW_END] + 1
        return pc + 1

    def _run_repeat(
        self, pc: int, mode: Any, group: str, params: dict, loops: list[LoopFrame]
    ) -> int:
        markers = self._markers[group]
        if mode == FLOW_START:
            items = self.resolve(params.get("WFInput"))
            if items is None or items == "":
                items = []
            if not isinstance(items, list):
                items = [items]
            self.trace.append(f"repeat {len(items)} item(s)")
            if not items:
                return markers[FLOW_END] + 1
            loops.append(LoopFrame(group, items, 0, pc))
            self.outputs[group] = items[0]
            return pc + 1
        frame = loops[-1]
        frame.index += 1
        if frame.index < len(frame.items):
            self.outputs[group] = frame.items[frame.index]
            return frame.start + 1
        loops.pop()
        return pc + 1

    def _run_simple(self, name: str, params: dict, identifier: list[str]) -> None:
        uuid_ = params.get("UUID")

        def emit(value: Any) -> None:
            if uuid_:
                self.outputs[uuid_] = value

        if name == "gettext":
            emit(params.get("WFTextActionText", ""))
        elif name == "date":
            emit(self.now)
        elif name == "format.date":
            source = self.resolve(params.get("WFDate"))
            when = source if isinstance(source, datetime) else self.now
            emit(when.strftime(unicode_date_format(params.get("WFDateFormat", "yyyy-MM-dd"))))
        elif name == "downloadurl":
            url = self._as_text(self.resolve(params.get("WFURL")))
            method = params.get("WFHTTPMethod", "GET")
            body = self.http.send(method, url, self._headers(params))
            self.trace.append(f"{method} {url}")
            try:
                emit(json.loads(body))
            except (json.JSONDecodeError, TypeError):
                emit(body)
        elif name == "getvalueforkey":
            source = self.resolve(params.get("WFInput"))
            key = params.get("WFDictionaryKey")
            if not isinstance(source, dict):
                raise RuntimeError(f"getvalueforkey on non-dictionary: {type(source)}")
            emit(source.get(key))
        elif name == "text.split":
            text = self._as_text(self.resolve(params.get("WFInput")))
            emit(text.split(params.get("WFTextCustomSeparator", "\n")))
        elif name == "getitemfromlist":
            source = self.resolve(params.get("WFInput"))
            if not isinstance(source, list):
                source = [source]
            index = params.get("WFItemIndex", 1)
            emit(source[index - 1] if 0 < index <= len(source) else "")
        elif name == "choosefromlist":
            source = self.resolve(params.get("WFInput"))
            items = source if isinstance(source, list) else [source]
            multiple = bool(
                params.get("WFChooseFromListActionSelectMultiple")
                or params.get("WFChooseFromListActionShowMultipleSelection")
            )
            emit(
                self.user.choose(
                    params.get("WFChooseFromListActionPrompt", ""), items, multiple
                )
            )
        elif name == "ask":
            emit(self.user.ask(params.get("WFAskActionPrompt", "")))
        elif name == "setvariable":
            self.variables[params["WFVariableName"]] = self.resolve(params.get("WFInput"))
        elif name == "appendvariable":
            value = self.resolve(params.get("WFInput"))
            self.variables.setdefault(params["WFVariableName"], []).append(value)
        elif name == "showresult":
            self.messages.append(self._as_text(self.resolve(params.get("Text"))))
        elif name == "output":
            self.output = self.resolve(params.get("WFOutput"))
        else:
            raise RuntimeError(
                f"shortcut_sim does not implement {'.'.join(identifier)} — add it "
                "rather than letting the simulation skip logic"
            )
