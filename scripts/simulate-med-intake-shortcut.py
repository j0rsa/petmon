#!/usr/bin/env python3
"""Run the med-intake shortcut logic against a real Petmon server.

Tier 2 of the local test setup (see docs/apple-shortcut-med-intake.md): the
*same generated plist* the iPhone imports is executed by `shortcut_sim`, but the
HTTP calls are real. That covers everything the unit tests mock out — auth,
token validity, menu shape, dose parsing, the take response — without importing
anything on a device.

    # against a locally running server
    python3 scripts/simulate-med-intake-shortcut.py \\
        --server http://localhost:8080 --pet <uuid> --key <api key>

    # only look, do not log anything
    python3 scripts/simulate-med-intake-shortcut.py ... --dry-run

    # pick specific meds instead of everything due
    python3 scripts/simulate-med-intake-shortcut.py ... --select 'Vetmedin · 1 tab'

Exit status: 0 when at least one dose was logged (or the menu was empty in
--dry-run), 1 when the run logged nothing, 2 on a usage error.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from med_intake_workflow import (  # noqa: E402
    LOGGED_VARIABLE,
    build_workflow,
)
from shortcut_sim import (  # noqa: E402
    HttpError,
    LiveHttp,
    Request,
    ScriptedUser,
    WorkflowRunner,
)


class DryRunHttp(LiveHttp):
    """Real GETs, swallowed POSTs — inspect the menu without logging doses."""

    def send(self, method: str, url: str, headers: dict[str, str]) -> str:
        if method == "POST":
            self.requests.append(Request(method, url, headers))
            return '{"dry_run": true}'
        return super().send(method, url, headers)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", default="http://localhost:8080")
    parser.add_argument("--pet", required=True, help="pet id (uuid)")
    parser.add_argument("--key", required=True, help="API token with api_write scope")
    parser.add_argument(
        "--select",
        action="append",
        default=[],
        metavar="LABEL",
        help="menu label to take; repeatable. Default: every label offered.",
    )
    parser.add_argument(
        "--dose",
        default=None,
        help="dose for optional pills, e.g. 1/2 (default: the first option offered)",
    )
    parser.add_argument("--ml", default="0.4", help="dose for optional liquids, in ml")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="issue the menu request but skip the takes",
    )
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    chosen = [label for label in args.select if label.strip()]

    def select(prompt: str, items: list):
        if prompt == "Dose":
            if args.dose is None:
                return items[0]
            if args.dose not in items:
                raise SystemExit(f"dose {args.dose!r} not offered, server sent: {items}")
            return args.dose
        if not chosen:
            return items
        missing = [label for label in chosen if label not in items]
        if missing:
            raise SystemExit(f"not on today's menu: {missing}\noffered: {items}")
        return [item for item in items if item in chosen]

    http = DryRunHttp() if args.dry_run else LiveHttp()
    runner = WorkflowRunner(
        build_workflow(),
        http=http,
        user=ScriptedUser(select=select, answers={"Liquid dose (ml)": args.ml}),
        # The workflow reads the device clock; use this machine's.
        now=datetime.now(),
        import_answers=[args.server, args.pet, args.key],
    )

    try:
        runner.run()
    except HttpError as exc:
        print(f"Aborted like Shortcuts would: {exc}", file=sys.stderr)
        return 1

    for line in runner.trace:
        print(f"  {line}")
    for message in runner.messages:
        print(f"Alert: {message}")

    logged = runner.variables.get(LOGGED_VARIABLE, [])
    posts = [request for request in http.requests if request.method == "POST"]
    print(f"\n{len(posts)} take request(s), {len(logged)} logged: {logged}")
    if args.dry_run:
        print("(dry run — no dose was recorded)")
        return 0
    return 0 if logged else 1


if __name__ == "__main__":
    raise SystemExit(main())
