#!/usr/bin/env python3
"""Compile `med-intake.cherri` into a signed shortcut.

Three steps, because the compiler has one bug we have to correct:

1. `cherri --skip-sign` produces the plist.
2. Import questions are re-pointed at the Text action each one is meant to fill.
   Cherri v1.3.2 writes `ActionIndex: 0` for *every* question, so as emitted the
   second and third questions overwrite the first Text action and the pet id and
   API key stay empty — the same silent-empty failure as the old `&date=` bug.
3. `shortcuts sign` writes the signed file the server embeds.

Run `--check` to verify the questions without signing (used by `make check-shortcut`).
"""

from __future__ import annotations

import argparse
import plistlib
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SOURCE = HERE / "med-intake.cherri"
SIGNED = REPO / "assets" / "shortcuts" / "Petmon Take Meds.shortcut"

#: First line of each question prompt -> the Cherri variable it must feed.
QUESTION_TARGETS = {
    "Petmon server URL": "server",
    "Pet ID": "pet",
    "API key": "key",
}

GET_TEXT = "is.workflow.actions.gettext"
SET_VARIABLE = "is.workflow.actions.setvariable"


def compile_source(cherri: str) -> Path:
    """Run the compiler and return the unsigned plist it wrote."""
    result = subprocess.run(
        [cherri, SOURCE.name, "--skip-sign", "--no-ansi"],
        cwd=HERE,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0 or result.stdout.strip():
        sys.exit(f"cherri failed:\n{result.stdout}{result.stderr}")
    # Cherri names the output after #define name, quotes included.
    unsigned = HERE / '"Petmon Take Meds"_unsigned.shortcut'
    if not unsigned.exists():
        sys.exit(f"expected {unsigned} to exist after compiling")
    return unsigned


def text_action_for_variable(actions: list[dict]) -> dict[str, int]:
    """Map each Cherri constant name to the index of the Text action producing it.

    A `const x = text(…)` compiles to one `gettext` whose `CustomOutputName` is
    the constant's name, which is what ties a question to its own action.
    """
    targets: dict[str, int] = {}
    for index, action in enumerate(actions):
        if action["WFWorkflowActionIdentifier"] != GET_TEXT:
            continue
        name = action["WFWorkflowActionParameters"].get("CustomOutputName")
        if name:
            targets[name] = index
    return targets


def repoint_questions(workflow: dict) -> list[str]:
    """Point every import question at its own Text action. Returns a change log."""
    actions = workflow["WFWorkflowActions"]
    by_variable = text_action_for_variable(actions)
    changes = []
    used: dict[int, str] = {}

    for question in workflow.get("WFWorkflowImportQuestions", []):
        first_line = question["Text"].split("\n", 1)[0].strip()
        variable = QUESTION_TARGETS.get(first_line)
        if variable is None:
            sys.exit(
                f"question {first_line!r} has no entry in QUESTION_TARGETS; add one "
                "so it cannot silently point at the wrong action"
            )
        if variable not in by_variable:
            sys.exit(f"no Text action feeds variable {variable!r}")
        target = by_variable[variable]
        if target in used:
            sys.exit(f"questions {used[target]!r} and {first_line!r} share action {target}")
        used[target] = first_line
        current = question.get("ActionIndex")
        if current != target:
            label = f"{current} -> {target}" if current is not None else f"(missing) -> {target}"
            changes.append(f"{first_line!r}: ActionIndex {label}")
            question["ActionIndex"] = target

        parameters = actions[target]["WFWorkflowActionParameters"]
        if question["ParameterKey"] not in parameters:
            # The question would have nothing to overwrite.
            parameters[question["ParameterKey"]] = ""
    return changes


#: Loop variables Shortcuts provides itself, e.g. `Repeat Item`, `Repeat Index 2`.
MAGIC_VARIABLES = ("Repeat Item", "Repeat Index")


def undefined_variable_references(workflow: dict) -> list[str]:
    """Variable attachments naming something no earlier action defines.

    A reference that resolves to nothing does not fail the run — the parameter is
    simply empty, which is how `Format Date` produced no date and the menu request
    asked for `&date=`. Nothing downstream notices, so it is checked here.

    Values consumed by an action should be `const` in the source (Cherri compiles
    that to an `ActionOutput` reference carrying the producing action's UUID, the
    form Apple's own shortcuts use for whole-field parameters). `@name` compiles
    to a by-name `Type: Variable` reference, which is only sound for something a
    `Set Variable` or a loop actually defines.
    """
    actions = workflow["WFWorkflowActions"]
    problems: list[str] = []
    defined: set[str] = set()

    for index, action in enumerate(actions):
        identifier = action["WFWorkflowActionIdentifier"]
        short = identifier.rsplit(".", 1)[-1]
        parameters = action.get("WFWorkflowActionParameters", {})

        def check(node: object, path: str) -> None:
            if isinstance(node, dict):
                # Only a node carrying `VariableName` is a by-name reference. A
                # condition wraps its real attachment as
                # `{Type: Variable, Variable: {…ActionOutput…}}`, which is fine.
                if node.get("Type") == "Variable" and "VariableName" in node:
                    name = str(node.get("VariableName", ""))
                    magic = any(name.startswith(prefix) for prefix in MAGIC_VARIABLES)
                    if not magic and name not in defined:
                        problems.append(
                            f"action {index} ({short}): {path} references "
                            f"{name!r}, which no earlier action defines"
                        )
                for key, value in node.items():
                    check(value, f"{path}.{key}" if path else key)
            elif isinstance(node, list):
                for position, value in enumerate(node):
                    check(value, f"{path}[{position}]")

        for key, value in parameters.items():
            check(value, key)

        if identifier == SET_VARIABLE:
            name = parameters.get("WFVariableName")
            if name:
                defined.add(str(name))

    return problems


def sign(plist_path: Path, output: Path) -> None:
    """Sign the XML plist as-is.

    No `plutil -convert binary1` step: `shortcuts sign` takes the XML form Cherri
    emits. It does insist the input file be named `*.shortcut`, and reports
    anything else as "isn't in the correct format" regardless of its contents.
    """
    output.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [
            "shortcuts", "sign",
            "--mode", "anyone",
            "--input", str(plist_path),
            "--output", str(output),
        ],
        check=True,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--check", action="store_true", help="compile and verify only, do not sign"
    )
    parser.add_argument(
        "--cherri",
        default=shutil.which("cherri")
        or next(
            (
                str(p)
                for p in [
                    Path.home() / ".local" / "bin" / "cherri",
                    Path.home() / "bin" / "cherri",
                    Path("/usr/local/bin/cherri"),
                ]
                if p.exists()
            ),
            "cherri",
        ),
    )
    args = parser.parse_args()

    unsigned = compile_source(args.cherri)
    workflow = plistlib.loads(unsigned.read_bytes())
    actions = workflow["WFWorkflowActions"]
    changes = repoint_questions(workflow)

    print(f"Compiled {SOURCE.name}: {len(actions)} actions")
    for change in changes:
        print(f"  repointed question {change}")
    questions = workflow.get("WFWorkflowImportQuestions", [])
    print(f"  {len(questions)} import question(s) -> actions "
          f"{sorted(q['ActionIndex'] for q in questions)}")

    dangling = undefined_variable_references(workflow)
    if dangling:
        print("\nVariable references that resolve to nothing:", file=sys.stderr)
        for problem in dangling:
            print(f"  {problem}", file=sys.stderr)
        return 1
    print("  every variable reference resolves")

    # The extension matters: `shortcuts sign` rejects any input not named
    # `*.shortcut` with a misleading "isn't in the correct format".
    patched = unsigned.with_name("med-intake.patched.shortcut")
    patched.write_bytes(plistlib.dumps(workflow, fmt=plistlib.FMT_XML))

    if args.check:
        print("Check only; not signed.")
        return 0

    sign(patched, SIGNED)
    print(f"Signed {SIGNED.relative_to(REPO)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
