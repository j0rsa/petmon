#!/usr/bin/env python3
"""Build, sign, and record the iCloud publish link for the med-intake shortcut."""

from __future__ import annotations

import argparse
import json
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))

from med_intake_workflow import build_workflow, workflow_digest  # noqa: E402

BUILD = ROOT / "scripts" / "build-med-intake-shortcut.py"
SHORTCUT_NAME = "Petmon Take Meds"
SIGNED = ROOT / "assets" / "shortcuts" / f"{SHORTCUT_NAME}.shortcut"
PUBLISH = ROOT / "assets" / "shortcuts" / "publish.json"
ICLOUD_PREFIX = "https://www.icloud.com/shortcuts/"
DIGEST_KEY = "workflow_sha256"


def save_publish_config(icloud_url: str) -> str:
    """Record the link plus the logic it was published from.

    The digest lets `build-med-intake-shortcut.py --check-publish` notice that
    the workflow changed but the iCloud link — the only import path that works
    on iPhone — still points at the old logic.
    """
    cfg = load_publish_config()
    cfg["icloud_url"] = icloud_url
    digest = workflow_digest(build_workflow())
    cfg[DIGEST_KEY] = digest
    PUBLISH.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")
    return digest


def load_publish_config() -> dict[str, str]:
    """Read publish.json, keeping any keys this script does not know about."""
    defaults = {"icloud_url": "", "automate_community_url": "", DIGEST_KEY: ""}
    if not PUBLISH.exists():
        return defaults
    data = json.loads(PUBLISH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{PUBLISH} must be a JSON object")
    cfg = {**defaults, **{key: str(value).strip() for key, value in data.items()}}
    return cfg


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
    if current_url:
        print()
        print(f"Current publish.json icloud_url: {current_url}")
    else:
        print()
        print("publish.json icloud_url is empty — iPhone import uses the self-hosted .shortcut until you set this.")


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


def interactive_publish() -> int:
    if sys.platform != "darwin":
        print("Interactive shortcut publish requires macOS (sign + Shortcuts app).", file=sys.stderr)
        return 1

    build_shortcut()
    cfg = load_publish_config()
    print_instructions(cfg.get("icloud_url", ""))
    open_for_sharing()
    url = prompt_icloud_url()
    digest = save_publish_config(url)
    print(f"\nUpdated {PUBLISH}")
    print(f"  icloud_url: {url}")
    print(f"  {DIGEST_KEY}: {digest[:12]}…")
    print("Commit publish.json and redeploy so /api/v1/info serves the new link.")
    return 0


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
    parser.add_argument(
        "--await-url",
        action="store_true",
        help="Build, sign, open Shortcuts, prompt for iCloud URL, update publish.json",
    )
    args = parser.parse_args()

    if args.await_url:
        return interactive_publish()

    if args.set_url:
        url = validate_icloud_url(args.set_url)
        digest = save_publish_config(url)
        print(f"Updated {PUBLISH}")
        print(f"  icloud_url: {url}")
        print(f"  {DIGEST_KEY}: {digest[:12]}…")
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
