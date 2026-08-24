#!/usr/bin/env python3
"""Record the Automate Community publish link for the med-intake flow."""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BUILD = ROOT / "scripts" / "build-med-intake-automate.py"
FLOW_FILE = ROOT / "assets" / "automate" / "Petmon Take Meds.flo"
PUBLISH = ROOT / "assets" / "shortcuts" / "publish.json"
COMMUNITY_PREFIX = "https://llamalab.com/automate/community/flows/"


def load_publish_config() -> dict[str, str]:
    if not PUBLISH.exists():
        return {"icloud_url": "", "automate_community_url": ""}
    data = json.loads(PUBLISH.read_text(encoding="utf-8"))
    if not isinstance(data, dict):
        raise ValueError(f"{PUBLISH} must be a JSON object")
    return {
        "icloud_url": str(data.get("icloud_url", "")).strip(),
        "automate_community_url": str(data.get("automate_community_url", "")).strip(),
    }


def save_publish_config(cfg: dict[str, str]) -> None:
    PUBLISH.write_text(json.dumps(cfg, indent=2) + "\n", encoding="utf-8")


def validate_community_url(url: str) -> str:
    url = url.strip()
    if not url.startswith(COMMUNITY_PREFIX):
        raise ValueError(f"URL must start with {COMMUNITY_PREFIX}")
    return url


def print_instructions(current_url: str) -> None:
    print()
    print("Publish to Automate Community (manual — no upload API):")
    print("  1. Build the flow in AutoMate (docs/automate-med-intake.md).")
    print("  2. In AutoMate: Community → Upload → share the flow.")
    print("  3. Open the flow page in a browser and copy the community URL.")
    if current_url:
        print()
        print(f"Current publish.json automate_community_url: {current_url}")
    else:
        print()
        print("publish.json automate_community_url is empty — Android uses the self-hosted .flo until set.")


def prompt_community_url() -> str:
    while True:
        try:
            raw = input("\nPaste Automate Community flow URL: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nCancelled — publish.json unchanged.")
            raise SystemExit(1) from None
        if not raw:
            print(f"URL required. Paste the {COMMUNITY_PREFIX}… link.")
            continue
        try:
            return validate_community_url(raw)
        except ValueError as err:
            print(err)


def interactive_publish() -> int:
    import subprocess

    if not FLOW_FILE.exists():
        subprocess.run([sys.executable, str(BUILD), "--bootstrap"], check=False)

    cfg = load_publish_config()
    print_instructions(cfg.get("automate_community_url", ""))
    url = prompt_community_url()
    cfg["automate_community_url"] = url
    save_publish_config(cfg)
    print(f"\nUpdated {PUBLISH}")
    print(f"  automate_community_url: {url}")
    print("Commit publish.json and redeploy so /api/v1/info serves the new link.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--set-url",
        metavar="URL",
        help="Write automate_community_url to assets/shortcuts/publish.json",
    )
    parser.add_argument(
        "--await-url",
        action="store_true",
        help="Print upload steps, prompt for community URL, update publish.json",
    )
    args = parser.parse_args()

    if args.await_url:
        return interactive_publish()

    if args.set_url:
        url = validate_community_url(args.set_url)
        cfg = load_publish_config()
        cfg["automate_community_url"] = url
        save_publish_config(cfg)
        print(f"Updated {PUBLISH}")
        print(f"  automate_community_url: {url}")
        print("Redeploy (or restart) the server so /api/v1/info serves the new link.")
        return 0

    cfg = load_publish_config()
    print_instructions(cfg.get("automate_community_url", ""))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
