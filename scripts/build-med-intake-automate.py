#!/usr/bin/env python3
"""Validate or bootstrap the Petmon med-intake AutoMate flow (.flo).

AutoMate uses a proprietary binary format; flows are built in the app (see
docs/automate-med-intake.md) and exported to assets/automate/Petmon Take Meds.flo.

This script can patch the flow title in a template or verify an exported file.
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "assets" / "automate"
FLOW_NAME = "Petmon Take Meds"
FLOW_FILE = OUT_DIR / f"{FLOW_NAME}.flo"

# Minimal bootstrap: Marvin "Add tasks to Amazing Marvin" community flow (713 bytes),
# retitled for Petmon. Replace by exporting the real flow from AutoMate (see docs).
MARVIN_TEMPLATE_URL = (
    "https://llamalab.com/automate/community/api/v1/flows/38611/data/"
    "Add+tasks+to+Amazing+Marvin.flo"
)
OLD_TITLE = b"Marvin Add Task"
NEW_TITLE = b"Petmon Take Meds"


def validate_flo(data: bytes) -> list[str]:
    errors: list[str] = []
    if not data.startswith(b"LAFl"):
        errors.append("missing LAFl header")
    if len(data) < 200:
        errors.append(f"file too small ({len(data)} bytes)")
    if NEW_TITLE not in data and OLD_TITLE in data:
        errors.append("still using Marvin template title — export the real flow from AutoMate")
    return errors


def bootstrap_from_marvin_template() -> bytes:
    import urllib.request

    with urllib.request.urlopen(MARVIN_TEMPLATE_URL, timeout=30) as resp:
        data = resp.read()
    if not data.startswith(b"LAFl"):
        raise RuntimeError("template download did not return a .flo file")
    if OLD_TITLE not in data:
        raise RuntimeError("template title string not found — community flow may have changed")
    # Length-prefixed string: 0x0f + "Marvin Add Task" → 0x10 + "Petmon Take Meds"
    old_prefixed = bytes([len(OLD_TITLE)]) + OLD_TITLE
    new_prefixed = bytes([len(NEW_TITLE)]) + NEW_TITLE
    if old_prefixed not in data:
        raise RuntimeError("prefixed title not found in template")
    return data.replace(old_prefixed, new_prefixed, 1)


def write_flow(data: bytes) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    FLOW_FILE.write_bytes(data)
    print(f"Wrote {FLOW_FILE} ({len(data)} bytes)")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--bootstrap",
        action="store_true",
        help="Download community template, retitle, and write assets/automate/Petmon Take Meds.flo",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Validate assets/automate/Petmon Take Meds.flo (exit 1 on failure)",
    )
    args = parser.parse_args()

    if args.bootstrap:
        write_flow(bootstrap_from_marvin_template())
        print()
        print("Bootstrap flo is a placeholder (Marvin task flow, retitled).")
        print("Build the real med-intake flow in AutoMate and export over this file.")
        print("See docs/automate-med-intake.md")
        return 0

    if not FLOW_FILE.exists():
        if args.check:
            print(f"Missing {FLOW_FILE}. Run: python3 scripts/build-med-intake-automate.py --bootstrap", file=sys.stderr)
            return 1
        write_flow(bootstrap_from_marvin_template())
        print("Created bootstrap flo — replace with export from AutoMate (docs/automate-med-intake.md).")
        return 0

    data = FLOW_FILE.read_bytes()
    errors = validate_flo(data)
    if errors:
        for err in errors:
            print(f"error: {err}", file=sys.stderr)
        return 1

    if args.check:
        print(f"OK: {FLOW_FILE} ({len(data)} bytes)")
        return 0

    print(f"{FLOW_FILE} looks valid ({len(data)} bytes)")
    if OLD_TITLE in data:
        print("Warning: still using Marvin bootstrap — export the real flow from AutoMate.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
