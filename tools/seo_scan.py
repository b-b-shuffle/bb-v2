#!/usr/bin/env python3
"""Gap scanner for on-page SEO of static HTML pages.

Vendored from the local seo-audit skill: `.github/skills/` is ignored by
`.github/.gitignore`, so the deploy workflow could not run it from there.
Keep this copy in sync with the skill when the checks change.

Usage:
    python tools/seo_scan.py [path] [--strict]

Reports per file: lang, title length, meta description length, canonical,
Open Graph set, twitter:card, robots directives, h1 count, images missing alt,
and JSON-LD presence. Also flags duplicate titles/descriptions across files.

Exit codes: 0 always, unless --strict and a P0 gap was found (1).
"""

from __future__ import annotations

import argparse
import html
import re
import sys
from pathlib import Path

SKIP_DIRS = {
    ".git", "node_modules", "temp", "archive", "_site", ".venv", "venv",
    "__pycache__", "dist", "build",
}

TAG_RES = {
    "lang": re.compile(r"<html\b[^>]*\blang\s*=\s*[\"']([^\"']+)[\"']", re.I),
    "title": re.compile(r"<title\b[^>]*>(.*?)</title>", re.I | re.S),
    "desc": re.compile(
        r"<meta\b[^>]*name\s*=\s*[\"']description[\"'][^>]*content\s*=\s*[\"'](.*?)[\"']",
        re.I | re.S,
    ),
    "canonical": re.compile(
        r"<link\b[^>]*rel\s*=\s*[\"']canonical[\"'][^>]*href\s*=\s*[\"']([^\"']*)[\"']",
        re.I,
    ),
    "robots": re.compile(
        r"<meta\b[^>]*name\s*=\s*[\"']robots[\"'][^>]*content\s*=\s*[\"'](.*?)[\"']", re.I
    ),
    "og_title": re.compile(r"property\s*=\s*[\"']og:title[\"']", re.I),
    "og_desc": re.compile(r"property\s*=\s*[\"']og:description[\"']", re.I),
    "og_image": re.compile(
        r"property\s*=\s*[\"']og:image[\"'][^>]*content\s*=\s*[\"']([^\"']*)[\"']", re.I
    ),
    "og_url": re.compile(r"property\s*=\s*[\"']og:url[\"']", re.I),
    "twitter": re.compile(r"name\s*=\s*[\"']twitter:card[\"']", re.I),
    "ldjson": re.compile(
        r"<script\b[^>]*type\s*=\s*[\"']application/ld\+json[\"']", re.I
    ),
    "h1": re.compile(r"<h1\b", re.I),
    "img": re.compile(r"<img\b[^>]*>", re.I),
}

P0, P1 = [], []


def strip_html(text: str) -> str:
    """Drop tags and decode entities so lengths match what a search engine sees."""
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def iter_html(root: Path):
    if root.is_file() and root.suffix.lower() in (".html", ".htm"):
        yield root
        return
    for path in sorted(root.rglob("*")):
        if path.suffix.lower() not in (".html", ".htm"):
            continue
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        yield path


def scan(path: Path) -> dict:
    src = path.read_text(encoding="utf-8", errors="replace")
    found = {}

    lang = TAG_RES["lang"].search(src)
    found["lang"] = lang.group(1) if lang else None

    title = TAG_RES["title"].search(src)
    found["title"] = strip_html(title.group(1)) if title else ""

    desc = TAG_RES["desc"].search(src)
    found["desc"] = strip_html(desc.group(1)) if desc else ""

    canon = TAG_RES["canonical"].search(src)
    found["canonical"] = canon.group(1) if canon else ""

    robots = TAG_RES["robots"].search(src)
    found["robots"] = robots.group(1).lower() if robots else ""

    found["og_title"] = bool(TAG_RES["og_title"].search(src))
    found["og_desc"] = bool(TAG_RES["og_desc"].search(src))
    og_image = TAG_RES["og_image"].search(src)
    found["og_image"] = og_image.group(1) if og_image else ""
    found["og_url"] = bool(TAG_RES["og_url"].search(src))
    found["twitter"] = bool(TAG_RES["twitter"].search(src))
    found["ldjson"] = bool(TAG_RES["ldjson"].search(src))
    found["h1"] = len(TAG_RES["h1"].findall(src))

    imgs = TAG_RES["img"].findall(src)
    found["img_total"] = len(imgs)
    found["img_no_alt"] = sum(1 for img in imgs if not re.search(r"\balt\s*=", img, re.I))

    return found


def report(path: Path, root: Path, found: dict) -> None:
    try:
        rel = path.relative_to(root)
    except ValueError:
        rel = path
    noindex = "noindex" in found["robots"]
    print(f"\n{rel}" + ("   [noindex]" if noindex else ""))

    def line(label, ok, detail=""):
        mark = "OK  " if ok else "MISS"
        print(f"  {mark} {label:<18}{detail}")

    title = found["title"]
    line("title", 15 <= len(title) <= 60, f"{len(title)} chars: {title[:70]!r}")
    desc = found["desc"]
    line("meta description", 50 <= len(desc) <= 160, f"{len(desc)} chars")
    line("lang", bool(found["lang"]), found["lang"] or "")
    canon = found["canonical"]
    absolute = canon.startswith(("http://", "https://"))
    line("canonical", absolute, canon or "missing")
    og_ok = found["og_title"] and found["og_desc"] and found["og_url"]
    line("og:title/desc/url", og_ok, "")
    og_img = found["og_image"]
    line("og:image", og_img.startswith(("http://", "https://")), og_img or "missing")
    line("twitter:card", found["twitter"], "")
    line("json-ld", found["ldjson"], "")
    line("h1 count", found["h1"] == 1, str(found["h1"]))
    missing_alt = found["img_no_alt"]
    line("img alt", missing_alt == 0, f"{missing_alt}/{found['img_total']} missing")

    # Priority classification (skip utility pages marked noindex)
    if not noindex:
        if not title:
            P0.append(f"{rel}: missing <title>")
        elif not 15 <= len(title) <= 60:
            P1.append(f"{rel}: title length {len(title)} (target 15-60)")
        if not desc:
            P0.append(f"{rel}: missing meta description")
        elif not 50 <= len(desc) <= 160:
            P1.append(f"{rel}: description length {len(desc)} (target 50-160)")
        if not absolute:
            P0.append(f"{rel}: canonical missing or not absolute")
        if not og_ok or not og_img.startswith(("http://", "https://")):
            P1.append(f"{rel}: incomplete Open Graph tags")
        if not found["twitter"]:
            P1.append(f"{rel}: missing twitter:card")
        if not found["ldjson"]:
            P1.append(f"{rel}: no JSON-LD structured data")
    if found["h1"] != 1:
        P1.append(f"{rel}: {found['h1']} h1 elements (want exactly 1)")
    if missing_alt:
        P1.append(f"{rel}: {missing_alt} image(s) without alt")


def main() -> int:
    parser = argparse.ArgumentParser(description="Static-site SEO gap scanner")
    parser.add_argument("path", nargs="?", default=".")
    parser.add_argument("--strict", action="store_true", help="exit 1 on P0 gaps")
    args = parser.parse_args()

    root = Path(args.path).resolve()
    if not root.exists():
        print(f"path not found: {root}")
        return 2

    files = list(iter_html(root))
    if not files:
        print(f"no HTML files found under {root}")
        return 2

    titles: dict[str, list[str]] = {}
    descs: dict[str, list[str]] = {}

    for path in files:
        found = scan(path)
        report(path, root, found)
        if found["title"] and "noindex" not in found["robots"]:
            titles.setdefault(found["title"], []).append(str(path.relative_to(root)))
        if found["desc"] and "noindex" not in found["robots"]:
            descs.setdefault(found["desc"], []).append(str(path.relative_to(root)))

    print("\n" + "=" * 70)
    for value, paths in titles.items():
        if len(paths) > 1:
            P0.append(f"duplicate title across {len(paths)} pages: {value[:60]!r} -> {', '.join(paths)}")
    for value, paths in descs.items():
        if len(paths) > 1:
            P1.append(f"duplicate description across {len(paths)} pages -> {', '.join(paths)}")

    print(f"{len(files)} HTML file(s) scanned")
    print(f"P0 (blocks indexing): {len(P0)}")
    for item in P0:
        print(f"  - {item}")
    print(f"P1 (rich results / polish): {len(P1)}")
    for item in P1:
        print(f"  - {item}")

    if args.strict and P0:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
