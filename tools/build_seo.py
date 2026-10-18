#!/usr/bin/env python3
"""Build sitemap.xml for the published site and validate its SEO invariants.

Usage:
    python tools/build_seo.py [--src .] [--out _site] [--base https://bbshuffle.com]

`tools/seo_pages.json` lists every page that should be indexed. For each entry
this script checks that the source file exists, is not marked noindex, has a
<title> and a meta description, and that its canonical link equals
``<base><url>``. It then writes ``<out>/sitemap.xml`` containing only those
canonical URLs, and confirms ``robots.txt`` points at the sitemap.

Run it against the minified build directory in CI. Any mismatch exits 1, so a
page cannot silently lose its canonical or drift out of the sitemap.

The build is deterministic: entries follow the manifest order and ``lastmod``
uses the file's last git commit date, not the checkout's mtime.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

CANONICAL_RE = re.compile(
    r"<link\b[^>]*\brel\s*=\s*[\"']canonical[\"'][^>]*\bhref\s*=\s*[\"']([^\"']+)[\"']",
    re.I,
)
CANONICAL_RE_REVERSED = re.compile(
    r"<link\b[^>]*\bhref\s*=\s*[\"']([^\"']+)[\"'][^>]*\brel\s*=\s*[\"']canonical[\"']",
    re.I,
)
ROBOTS_RE = re.compile(
    r"<meta\b[^>]*\bname\s*=\s*[\"']robots[\"'][^>]*\bcontent\s*=\s*[\"']([^\"']*)[\"']",
    re.I,
)
TITLE_RE = re.compile(r"<title\b[^>]*>(.*?)</title>", re.I | re.S)
DESC_RE = re.compile(
    r"<meta\b[^>]*\bname\s*=\s*[\"']description[\"'][^>]*\bcontent\s*=\s*[\"']([^\"']*)[\"']",
    re.I,
)


def canonical_of(src: str) -> str:
    match = CANONICAL_RE.search(src) or CANONICAL_RE_REVERSED.search(src)
    return match.group(1).strip() if match else ""


def last_commit_date(src_root: Path, rel: str) -> str:
    try:
        result = subprocess.run(
            ["git", "-C", str(src_root), "log", "-1", "--format=%cs", "--", rel],
            capture_output=True,
            text=True,
            timeout=10,
        )
    except (OSError, subprocess.SubprocessError):
        return ""
    return result.stdout.strip() if result.returncode == 0 else ""


def xml_escape(value: str) -> str:
    return (
        value.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )


def main() -> int:
    script_dir = Path(__file__).resolve().parent
    default_root = script_dir.parent

    parser = argparse.ArgumentParser(description="Build and validate sitemap.xml")
    parser.add_argument("--src", default=str(default_root), help="source root (default: repo root)")
    parser.add_argument("--out", default=str(default_root / "_site"), help="build output root")
    parser.add_argument("--base", default=None, help="override the canonical origin")
    parser.add_argument("--manifest", default=str(script_dir / "seo_pages.json"))
    args = parser.parse_args()

    src_root = Path(args.src).resolve()
    out_root = Path(args.out).resolve()
    manifest = json.loads(Path(args.manifest).read_text(encoding="utf-8"))
    base = (args.base or manifest["baseUrl"]).rstrip("/")

    errors: list[str] = []
    entries: list[tuple[str, str]] = []  # (loc, lastmod)

    for page in manifest["pages"]:
        rel = page["file"]
        url = page["url"]
        expected = base + url
        path = src_root / rel

        if not path.is_file():
            errors.append(f"{rel}: file not found")
            continue

        source = path.read_text(encoding="utf-8", errors="replace")

        robots = ROBOTS_RE.search(source)
        if robots and "noindex" in robots.group(1).lower():
            errors.append(f"{rel}: marked noindex but listed in the sitemap")
            continue

        if not TITLE_RE.search(source):
            errors.append(f"{rel}: missing <title>")

        if not DESC_RE.search(source):
            errors.append(f"{rel}: missing meta description")

        actual = canonical_of(source)
        if not actual:
            errors.append(f"{rel}: missing canonical link")
        elif actual.rstrip("/") != expected.rstrip("/"):
            errors.append(f"{rel}: canonical is {actual!r}, expected {expected!r}")

        entries.append((expected, last_commit_date(src_root, rel)))

    robots_path = src_root / "robots.txt"
    if not robots_path.is_file():
        errors.append("robots.txt: missing")
    else:
        robots_txt = robots_path.read_text(encoding="utf-8", errors="replace")
        if f"Sitemap: {base}/sitemap.xml" not in robots_txt:
            errors.append("robots.txt: missing Sitemap: line for the canonical origin")

    if errors:
        print("SEO validation failed:")
        for item in errors:
            print(f"  - {item}")
        return 1

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for loc, lastmod in entries:
        lines.append("  <url>")
        lines.append(f"    <loc>{xml_escape(loc)}</loc>")
        if lastmod:
            lines.append(f"    <lastmod>{xml_escape(lastmod)}</lastmod>")
        lines.append("  </url>")
    lines.append("</urlset>")
    lines.append("")

    out_root.mkdir(parents=True, exist_ok=True)
    target = out_root / "sitemap.xml"
    target.write_text("\n".join(lines), encoding="utf-8", newline="\n")

    print(f"Wrote {target} with {len(entries)} canonical URL(s).")
    for loc, _ in entries:
        print(f"  {loc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
