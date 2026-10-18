#!/usr/bin/env python3
"""Generate sw-manifest.json: every static file the PWA keeps offline.

The service worker precaches this list on install. Generating it means new
cards, decks, fonts and pages are picked up without editing sw.js by hand.

Usage:
    python tools/build_sw_manifest.py [--src .] [--out sw-manifest.json] [--check]

Only files that ship with the site are listed. Development trees (temp/, data/,
tools/, .github/, _site/), prose, and README screenshots are excluded.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

SKIP_DIRS = {
    ".git", ".github", ".vscode", "node_modules", "__pycache__",
    "temp", "_site", "data", "docker", "tools", "scripts", "3d-print",
    "Original_v1_B-B-Shuffle", "logs",
}
SKIP_PATHS = {"docs/detection"}
SKIP_FILES = {
    ".dockerignore", ".gitignore", ".nojekyll", "AGENTS.md", "CNAME",
    "LICENSE", "NOTICE", "README copy.md", "README.md",
    "THIRD-PARTY-NOTICES.md", "package.json", "robots.txt",
    "sw-manifest.json", "sw.js",
    "docs/Competitive_Rules_SDv1.pdf", "docs/rules-comp_2026.pdf",
}
INCLUDE_SUFFIXES = {
    ".css", ".gif", ".html", ".ico", ".jpeg", ".jpg", ".js", ".json",
    ".pdf", ".png", ".svg", ".ttf", ".webmanifest", ".webp", ".woff", ".woff2",
}
# README-only screenshots; not linked from the app.
SKIP_GLOBS = ("shared/example-*.png",)


def wanted(rel: Path) -> bool:
    if rel.as_posix() in SKIP_FILES:
        return False
    if any(part in SKIP_DIRS for part in rel.parts):
        return False
    if any(rel.as_posix().startswith(prefix) for prefix in SKIP_PATHS):
        return False
    if any(rel.match(pattern) for pattern in SKIP_GLOBS):
        return False
    return rel.suffix.lower() in INCLUDE_SUFFIXES


def collect(root: Path) -> list[str]:
    files: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if wanted(rel):
            files.append(rel.as_posix())
    return sorted(files)


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate the offline precache manifest")
    parser.add_argument("--src", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("--out", default=None)
    parser.add_argument("--check", action="store_true", help="fail if the manifest is stale")
    args = parser.parse_args()

    root = Path(args.src).resolve()
    out = Path(args.out).resolve() if args.out else root / "sw-manifest.json"

    files = collect(root)
    payload = json.dumps(files, indent=0, ensure_ascii=False) + "\n"

    if args.check:
        current = out.read_text(encoding="utf-8") if out.is_file() else ""
        if current != payload:
            print("sw-manifest.json is stale – run: python tools/build_sw_manifest.py", file=sys.stderr)
            return 1
        print(f"sw-manifest.json is current ({len(files)} files)")
        return 0

    out.write_text(payload, encoding="utf-8", newline="\n")
    print(f"Wrote {out} ({len(files)} files, {out.stat().st_size / 1024:.0f} KiB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
