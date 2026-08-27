#!/usr/bin/env python3
"""Record the iCloud link the med-intake shortcut is published under.

iPhone import only works through an iCloud share link, which Apple has no API
for — so publishing is a manual Share → Share Link step.

Usage:
  python3 shortcuts/publish.py --set-url 'https://www.icloud.com/shortcuts/…'
  python3 shortcuts/publish.py --await-url   # build, open Shortcuts, prompt
  python3 shortcuts/publish.py               # build + print instructions only
"""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent
SOURCE = HERE / "med-intake.cherri"
BUILD = HERE / "build.py"
SIGNED = REPO / "assets" / "shortcuts" / "Petmon Take Meds.shortcut"
PUBLISH = REPO / "assets" / "shortcuts" / "publish.json"
ICLOUD_PREFIX = "https://www.icloud.com/shortcuts/"


def load_config() -> dict[str, str]:
    defaults = {"icloud_url": ""}
    if not PUBLISH.exists():
        return defaults
    data = json.loads(PUBLISH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{PUBLISH} must be a JSON object")
    return {**defaults, **{key: str(value).strip() for key, value in data.items()}}


def save_config(icloud_url: str) -> None:
    config = load_config()
    config["icloud_url"] = icloud_url
    # Drop stale digest keys left by the old publish script.
    config.pop("workflow_sha256", None)
    config.pop("cherri_version", None)
    PUBLISH.write_text(json.dumps(config, indent=2) + "\n", encoding="utf-8")


def validate_icloud_url(url: str) -> str:
    url = url.strip()
    if not url.startswith(ICLOUD_PREFIX):
        raise ValueError(f"URL must start with {ICLOUD_PREFIX}")
    return url


def build() -> None:
    subprocess.run([sys.executable, str(BUILD)], check=True)


def print_instructions(current_url: str) -> None:
    print()
    print("Publish to iCloud (manual — Apple has no upload API):")
    print("  1. Shortcuts should open with 'Petmon Take Meds'.")
    print("  2. Tap Share → Share Link (or Get Link). Allow untrusted shortcuts if prompted.")
    print("  3. Copy the iCloud URL (https://www.icloud.com/shortcuts/…).")
    print()
    if current_url:
        print(f"Current publish.json icloud_url: {current_url}")
    else:
        print("publish.json icloud_url is empty — iPhone import needs it set.")


def prompt_icloud_url() -> str:
    while True:
        try:
            raw = input("\nPaste iCloud shortcut URL: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled — publish.json unchanged.")
            raise SystemExit(1) from None
        if not raw:
            print("URL required. Paste the https://www.icloud.com/shortcuts/… link.")
            continue
        try:
            return validate_icloud_url(raw)
        except ValueError as err:
            print(err)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--set-url", metavar="URL", help="Record icloud_url in publish.json")
    parser.add_argument(
        "--await-url",
        action="store_true",
        help="Build, sign, open Shortcuts, then prompt for the iCloud URL",
    )
    parser.add_argument("--skip-build", action="store_true", help="Do not rebuild first")
    args = parser.parse_args()

    if args.set_url:
        url = validate_icloud_url(args.set_url)
        save_config(url)
        print(f"Updated {PUBLISH.relative_to(REPO)}")
        print(f"  icloud_url: {url}")
        print("Commit publish.json and redeploy so /api/v1/info serves the new link.")
        return 0

    if not args.skip_build:
        build()

    config = load_config()
    print_instructions(config["icloud_url"])

    if sys.platform != "darwin":
        print(f"\nSigning needs macOS; signed file lives at {SIGNED.relative_to(REPO)}")
        return 0

    if SIGNED.exists():
        subprocess.run(["open", str(SIGNED)], check=True)

    if args.await_url:
        url = prompt_icloud_url()
        save_config(url)
        print(f"\nUpdated {PUBLISH.relative_to(REPO)}")
        print(f"  icloud_url: {url}")
        print("Commit publish.json and redeploy so /api/v1/info serves the new link.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
