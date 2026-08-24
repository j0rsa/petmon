#!/usr/bin/env python3
"""Build, sign, and record the iCloud publish link for the med-intake shortcut."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "scripts" / "build-med-intake-shortcut.py"
SIGNED = ROOT / "assets" / "shortcuts" / "petmon-med-intake.shortcut"
PUBLISH = ROOT / "assets" / "shortcuts" / "publish.json"
ICLOUD_PREFIX = "https://www.icloud.com/shortcuts/"


def load_publish_config() -> dict[str, str]:
    if not PUBLISH.exists():
        return {"icloud_url": ""}
    data = json.loads(PUBLISH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{PUBLISH} must be a JSON object")
    return {"icloud_url": str(data.get("icloud_url", "")).strip()}


def save_publish_config(icloud_url: str) -> None:
    PUBLISH.write_text(
        json.dumps({"icloud_url": icloud_url}, indent=2) + "\n",
        encoding="utf-8",
    )


def validate_icloud_url(url: str) -> str:
    url = url.strip()
    if not url.startswith(ICLOUD_PREFIX):
        raise ValueError(f"URL must start with {ICLOUD_PREFIX}")
    return url


def build_shortcut() -> None:
    subprocess.run([sys.executable, str(BUILD)], check=True)


def open_for_sharing() -> None:
    if sys.platform != "darwin":
        return
    subprocess.run(["open", str(SIGNED)], check=True)


def print_instructions(current_url: str) -> None:
    print()
    print("Publish to iCloud (manual — Apple has no upload API):")
    print("  1. Shortcuts should open with “Petmon Take Meds”.")
    print("  2. Tap Share → Share Link (or Get Link). Allow untrusted shortcuts if prompted.")
    print("  3. Copy the iCloud URL (https://www.icloud.com/shortcuts/…).")
    print("  4. Save it:")
    print(f"       python3 {Path(__file__).name} --set-url '<paste url>'")
    print("     or set deployment env MED_INTAKE_SHORTCUT_ICLOUD_URL (overrides publish.json).")
    if current_url:
        print()
        print(f"Current publish.json icloud_url: {current_url}")
    else:
        print()
        print("publish.json icloud_url is empty — iPhone import uses the self-hosted .shortcut until you set this.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--set-url",
        metavar="URL",
        help="Write icloud_url to assets/shortcuts/publish.json",
    )
    parser.add_argument(
        "--skip-build",
        action="store_true",
        help="Only update publish.json or print instructions",
    )
    args = parser.parse_args()

    if args.set_url:
        url = validate_icloud_url(args.set_url)
        save_publish_config(url)
        print(f"Updated {PUBLISH}")
        print(f"  icloud_url: {url}")
        print("Redeploy (or restart) the server so /api/v1/info serves the new link.")
        return 0

    if not args.skip_build:
        build_shortcut()

    cfg = load_publish_config()
    print_instructions(cfg.get("icloud_url", ""))

    if sys.platform == "darwin" and SIGNED.exists():
        open_for_sharing()
    elif sys.platform != "darwin":
        print()
        print(f"Signed file (when built on macOS): {SIGNED}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
