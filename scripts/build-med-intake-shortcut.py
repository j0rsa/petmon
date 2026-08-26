#!/usr/bin/env python3
"""Build, validate and sign the Petmon med-intake Apple Shortcut.

The workflow itself lives in `scripts/med_intake_workflow.py`; this file is the
command line around it.

    python3 scripts/build-med-intake-shortcut.py                # build + sign
    python3 scripts/build-med-intake-shortcut.py --validate-only # no macOS needed
    python3 scripts/build-med-intake-shortcut.py --check-publish # iCloud drift
    python3 scripts/build-med-intake-shortcut.py --harness \\
        --server http://localhost:8080 --pet <uuid> --key <api key>

Signing needs macOS (`shortcuts sign`); everything else runs anywhere.
"""

from __future__ import annotations

import argparse
import json
import plistlib
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from med_intake_workflow import (  # noqa: E402
    HARNESS_NAME,
    SHORTCUT_NAME,
    Harness,
    build_workflow,
    workflow_digest,
)
from shortcut_lint import validate_workflow  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "shortcuts"
HARNESS_DIR = OUT_DIR / "harness"
PUBLISH_FILE = OUT_DIR / "publish.json"
DIGEST_KEY = "workflow_sha256"


def sign(unsigned_plist: Path, binary: Path, signed_out: Path) -> None:
    subprocess.run(
        ["plutil", "-convert", "binary1", "-o", str(binary), str(unsigned_plist)],
        check=True,
    )
    subprocess.run(
        [
            "shortcuts",
            "sign",
            "--mode",
            "anyone",
            "--input",
            str(binary),
            "--output",
            str(signed_out),
        ],
        check=True,
    )


def read_publish() -> dict:
    if not PUBLISH_FILE.exists():
        return {}
    try:
        return json.loads(PUBLISH_FILE.read_text())
    except json.JSONDecodeError as exc:
        raise SystemExit(f"{PUBLISH_FILE} is not valid JSON: {exc}") from exc


def check_publish(digest: str) -> int:
    """Fail when the published iCloud link predates the current logic.

    iPhone import goes through iCloud, so a rebuilt shortcut nobody republished
    means users keep installing the old logic.
    """
    published = read_publish()
    recorded = published.get(DIGEST_KEY, "")
    icloud = (published.get("icloud_url") or "").strip()
    if not icloud:
        print("publish.json has no icloud_url yet — nothing to check.")
        return 0
    if not recorded:
        print(
            f"publish.json has no {DIGEST_KEY}. Current workflow is {digest[:12]}.\n"
            "Republish to iCloud and run:\n"
            f"  python3 scripts/publish-med-intake-shortcut.py --set-url '{icloud}'"
        )
        return 1
    if recorded != digest:
        print(
            "Shortcut logic changed since the last iCloud publish.\n"
            f"  published: {recorded[:12]}\n"
            f"  current:   {digest[:12]}\n"
            "iPhone users are still importing the old shortcut. Rebuild, share a new\n"
            "iCloud link, then record it with:\n"
            "  python3 scripts/publish-med-intake-shortcut.py --set-url '<new link>'"
        )
        return 1
    print(f"iCloud link matches the committed workflow ({digest[:12]}).")
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--validate-only",
        action="store_true",
        help="run the structural checks and exit (no plist written, no signing)",
    )
    parser.add_argument(
        "--check-publish",
        action="store_true",
        help="compare the workflow digest against assets/shortcuts/publish.json",
    )
    parser.add_argument(
        "--harness",
        action="store_true",
        help="build the non-interactive test variant into assets/shortcuts/harness/",
    )
    parser.add_argument("--server", default="http://localhost:8080", help="harness server URL")
    parser.add_argument("--pet", default="", help="harness pet id")
    parser.add_argument("--key", default="", help="harness API key")
    parser.add_argument("--ml", default="0.4", help="harness liquid dose in ml")
    return parser.parse_args()


def main() -> int:
    args = parse_args()

    harness = None
    if args.harness:
        if not args.pet or not args.key:
            print("--harness needs --pet and --key", file=sys.stderr)
            return 2
        harness = Harness(server=args.server, pet_id=args.pet, api_key=args.key, liquid_ml=args.ml)

    workflow = build_workflow(harness)
    errors = validate_workflow(workflow)
    if errors:
        print("Workflow is invalid:", file=sys.stderr)
        for error in errors:
            print(f"  - {error}", file=sys.stderr)
        return 1

    digest = workflow_digest(build_workflow())
    print(f"Workflow OK ({len(workflow['WFWorkflowActions'])} actions), digest {digest[:12]}")

    if args.check_publish:
        return check_publish(digest)
    if args.validate_only:
        return 0

    name = HARNESS_NAME if harness else SHORTCUT_NAME
    out_dir = HARNESS_DIR if harness else OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    unsigned = out_dir / f"{name}.unsigned.plist"
    binary = out_dir / f"{name}.unsigned.shortcut"
    signed = out_dir / f"{name}.shortcut"

    with unsigned.open("wb") as fh:
        plistlib.dump(workflow, fh, fmt=plistlib.FMT_XML)
    print(f"Wrote {unsigned}")

    if sys.platform != "darwin":
        print("Skipping sign step (macOS only). Commit a signed file from a Mac.")
        return 0

    sign(unsigned, binary, signed)
    print(f"Signed {signed}")
    if not harness:
        published = read_publish()
        if published.get(DIGEST_KEY) != digest:
            print(
                "\nWorkflow logic changed. iPhone import uses the iCloud link, so "
                "republish:\n"
                "  make publish-med-intake-shortcut\n"
                "  python3 scripts/publish-med-intake-shortcut.py --set-url '<new link>'"
            )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
