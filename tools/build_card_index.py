#!/usr/bin/env python3
"""Regenerate the crawlable card list.

The catalogue and the player render their cards with JavaScript, so a crawler
that does not run scripts sees very little. ``shared/card-index.html`` is a
static text index of every card name, deck by deck. It is intentionally not
linked from the app UI; it exists for search engines and is listed in
``tools/seo_pages.json`` / the sitemap. It is generated from
``docs/card-details.json`` and the ``DECKS`` array the catalogue declares, so it
cannot drift from what the app displays.

Usage:
    python tools/build_card_index.py [--src .] [--check]

``--check`` compares the generated output with what is on disk and exits 1 on a
difference, without writing. CI runs the plain form so a stale committed copy is
regenerated before the minifier runs.
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
from pathlib import Path

BASE = "https://bbshuffle.com"
TYPES = ["initial", "pivot", "c2", "persist", "procedure", "inject", "consultant", "exfil"]
TYPE_LABEL = {
    "initial": "Initial Compromise",
    "pivot": "Pivot & Escalate",
    "c2": "C2 / Exfiltration",
    "persist": "Persistence",
    "procedure": "Procedure",
    "inject": "Inject",
    "consultant": "Consultant",
    "exfil": "Exfiltration",
}

DESCRIPTION = (
    "The full Backdoors & Breaches card list, deck by deck: initial compromise, "
    "pivot, C2, persistence, procedure, inject and consultant cards."
)

DECKS_RE = re.compile(r"const DECKS = \[(.*?)\n\s*\];", re.S)
ENTRY_RE = re.compile(
    r"\{\s*key:\s*'([^']+)'\s*,\s*name:\s*'([^']*)'\s*,\s*note:\s*'([^']*)'"
)


def js_string(value: str) -> str:
    """Decode the \\uXXXX escapes used inside the catalogue's JS literals."""
    try:
        return json.loads('"' + value + '"')
    except json.JSONDecodeError:
        return value


def parse_decks(source: str) -> list[dict[str, str]]:
    block = DECKS_RE.search(source)
    if not block:
        raise SystemExit("could not find the DECKS array in shared/catalogue.html")
    decks = [
        {"key": key, "name": js_string(name), "note": js_string(note)}
        for key, name, note in ENTRY_RE.findall(block.group(1))
    ]
    if not decks:
        raise SystemExit("DECKS array found but no entries parsed")
    return decks


def load_details(path: Path) -> dict[str, dict]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {deck["deck"]: deck for deck in data["decks"]}


def deck_name(detail: dict | None, fallback: str) -> str:
    return detail.get("name", fallback) if detail else fallback


def render_type_sections(detail: dict) -> str:
    parts: list[str] = []
    for card_type in TYPES:
        cards = detail["cards"].get(card_type, []) if detail else []
        if not cards:
            continue
        names = "\n".join(
            f'                        <li>{html.escape(card.get("name") or "Untitled card")}</li>'
            for card in cards
        )
        parts.append(
            "\n".join(
                [
                    f'                    <h3 class="idx-type">{html.escape(TYPE_LABEL[card_type])} '
                    f"<span>({len(cards)})</span></h3>",
                    '                    <ul class="idx-cards">',
                    names,
                    "                    </ul>",
                ]
            )
        )
    return "\n".join(parts)


def render_card_index(
    decks: list[dict[str, str]],
    details: dict[str, dict],
    home: str = "/",
) -> str:
    total = sum(
        sum(len(v) for v in details.get(deck["key"], {}).get("cards", {}).values())
        for deck in decks
    )
    title = f"Backdoors & Breaches Card List – All {total:,} Cards"
    toc = "\n".join(
        f'                <li><a href="#deck-{deck["key"]}">{html.escape(deck["name"])}</a></li>'
        for deck in decks
    )

    sections: list[str] = []
    for deck in decks:
        detail = details.get(deck["key"])
        count = sum(len(v) for v in detail["cards"].values()) if detail else 0
        note = html.escape(deck["note"])
        sections.append(
            "\n".join(
                [
                    f'            <section class="idx-deck" id="deck-{deck["key"]}">',
                    f'                <h2>{html.escape(deck["name"])} '
                    f'<span class="idx-count">{count} cards</span></h2>',
                    f'                <p class="idx-note">{note}</p>',
                    render_type_sections(detail),
                    "            </section>",
                ]
            )
        )

    item_list = {
        "@context": "https://schema.org",
        "@type": "CollectionPage",
        "name": "Backdoors & Breaches Card List",
        "url": f"{BASE}/shared/card-index.html",
        "description": DESCRIPTION,
        "isPartOf": {"@type": "WebSite", "name": "B&B Shuffle", "url": f"{BASE}/"},
        "mainEntity": {
            "@type": "ItemList",
            "numberOfItems": len(decks),
            "itemListElement": [
                {
                    "@type": "ListItem",
                    "position": index + 1,
                    "name": deck["name"],
                    "url": f"{BASE}/shared/card-index.html#deck-{deck['key']}",
                }
                for index, deck in enumerate(decks)
            ],
        },
    }
    breadcrumb = {
        "@context": "https://schema.org",
        "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "B&B Shuffle", "item": f"{BASE}/"},
            {
                "@type": "ListItem",
                "position": 2,
                "name": "Card Catalogue",
                "item": f"{BASE}/shared/catalogue.html",
            },
            {
                "@type": "ListItem",
                "position": 3,
                "name": "Card List",
                "item": f"{BASE}/shared/card-index.html",
            },
        ],
    }

    return "\n".join(
        [
            "<!DOCTYPE html>",
            '<html lang="en" data-theme="dark">',
            "<head>",
            '    <meta charset="UTF-8">',
            '    <meta name="viewport" content="width=device-width, initial-scale=1.0">',
            '    <meta name="color-scheme" content="dark">',
            '    <meta name="theme-color" content="#0f1117">',
            f"    <title>{html.escape(title)}</title>",
            f'    <meta name="description" content="{html.escape(DESCRIPTION, quote=True)}">',
            '    <meta name="robots" content="index, follow, max-image-preview:large">',
            f'    <link rel="canonical" href="{BASE}/shared/card-index.html">',
            '    <meta property="og:type" content="website">',
            '    <meta property="og:site_name" content="B&amp;B Shuffle">',
            f'    <meta property="og:title" content="{html.escape(title, quote=True)}">',
            f'    <meta property="og:description" content="{html.escape(DESCRIPTION, quote=True)}">',
            f'    <meta property="og:url" content="{BASE}/shared/card-index.html">',
            f'    <meta property="og:image" content="{BASE}/shared/img/og-bbshuffle.png">',
            '    <meta property="og:image:width" content="1200">',
            '    <meta property="og:image:height" content="630">',
            '    <meta property="og:locale" content="en_US">',
            '    <meta name="twitter:card" content="summary_large_image">',
            f'    <meta name="twitter:title" content="{html.escape(title, quote=True)}">',
            f'    <meta name="twitter:description" content="{html.escape(DESCRIPTION, quote=True)}">',
            f'    <meta name="twitter:image" content="{BASE}/shared/img/og-bbshuffle.png">',
            '    <link rel="icon" href="img/favicon.ico" sizes="any">',
            '    <link rel="icon" type="image/png" href="img/favicon.png">',
            '    <link rel="apple-touch-icon" href="img/apple-touch-icon.png">',
            '    <link rel="manifest" href="../manifest.webmanifest">',
            '    <link rel="stylesheet" href="css/base.css">',
            '    <style>',
            "        body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; background: var(--color-bg); color: var(--color-text); }",
            "        .idx { flex: 1 0 auto; width: 100%; max-width: 980px; margin: 0 auto; padding: 24px 20px 40px; }",
            "        .idx-top { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 20px; }",
            "        .idx-brand { display: flex; align-items: center; gap: 12px; text-decoration: none; color: inherit; }",
            "        .idx-brand img { height: 52px; width: auto; }",
            "        .idx-brand h1 { margin: 0; font-size: 22px; }",
            "        .idx-sub { display: block; color: var(--color-text-secondary); font-size: 12px; }",
            "        .idx-home { color: var(--color-primary); font-size: 13px; text-decoration: none; }",
            "        .idx-intro { color: var(--color-text-secondary); font-size: 15px; line-height: 1.6; margin: 0 0 22px; }",
            "        .idx-toc { border: 1px solid var(--color-border); border-radius: var(--radius-lg); background: var(--color-bg-secondary); padding: 16px 20px; margin-bottom: 26px; }",
            "        .idx-toc h2 { margin: 0 0 8px; font-size: 15px; }",
            "        .idx-toc ul { margin: 0; padding-left: 20px; columns: 2; column-gap: 28px; font-size: 14px; line-height: 1.7; }",
            "        .idx-deck { border-top: 1px solid var(--color-border); padding-top: 22px; margin-top: 26px; }",
            "        .idx-deck h2 { margin: 0 0 4px; font-size: 21px; }",
            "        .idx-count { color: var(--color-text-muted); font-size: 12px; font-weight: 400; margin-left: 6px; }",
            "        .idx-note { color: var(--color-text-secondary); font-size: 14px; line-height: 1.55; margin: 0 0 10px; }",
            "        .idx-type { margin: 18px 0 6px; font-size: 13px; letter-spacing: .04em; text-transform: uppercase; color: var(--color-text-muted); }",
            "        .idx-type span { font-weight: 400; }",
            "        .idx-cards { margin: 0; padding-left: 20px; columns: 2; column-gap: 28px; font-size: 14px; line-height: 1.55; }",
            "        .idx-cards li { break-inside: avoid; }",
            "        @media (max-width: 720px) { .idx-toc ul, .idx-cards { columns: 1; } }",
            "    </style>",
            '    <script type="application/ld+json">',
            json.dumps(item_list, ensure_ascii=False, indent=2),
            "    </script>",
            '    <script type="application/ld+json">',
            json.dumps(breadcrumb, ensure_ascii=False, indent=2),
            "    </script>",
            "</head>",
            '<body class="surface-felt">',
            '    <div class="idx">',
            '        <header class="idx-top">',
            '            <a class="idx-brand" href="../index.html">',
            '                <img src="img/bb-logo-transparent-w.png" alt="Backdoors &amp; Breaches logo" width="2518" height="999">',
            "                <span>",
            "                    <h1>Backdoors &amp; Breaches card list</h1>",
            '                    <span class="idx-sub">B&amp;B Shuffle · every card, deck by deck</span>',
            "                </span>",
            "            </a>",
            '            <a class="idx-home" href="catalogue.html">← Card Catalogue</a>',
            "        </header>",
            "        <main>",
            '            <p class="idx-intro">This is the complete card list for the decks loaded by '
            "B&amp;B Shuffle, the free, unofficial online companion for <strong>Backdoors &amp; Breaches</strong>. "
            "Cards are grouped by deck and then by type – initial compromise, pivot and escalate, C2 and exfiltration, "
            "persistence, procedure, inject and consultant. The interactive catalogue shows the card faces, card text, "
            "TOOLS and DETECTION sections; this page is the text index search engines and screen readers can follow. "
            "Backdoors &amp; Breaches is published by Black Hills Information Security and Antisyphon Training; this "
            "project is not affiliated with either.</p>",
            '            <nav class="idx-toc" aria-label="Decks">',
            "                <h2>Jump to a deck</h2>",
            "                <ul>",
            toc,
            "                </ul>",
            "            </nav>",
            *sections,
            "        </main>",
            '        <footer class="app-legal">',
            '            <div class="app-legal-content">',
            '                <a class="app-legal-classic" href="https://www.blackhillsinfosec.com/tools/backdoorsandbreaches/classic" target="_blank" rel="noopener noreferrer" title="Backdoors &amp; Breaches – Classic (official site)">',
            '                    <img class="app-legal-logo" src="img/bb-logo-transparent-w.png" alt="Backdoors &amp; Breaches logo" width="2518" height="999">',
            "                    <span>B&amp;B Classic – Official Site</span>",
            "                </a>",
            '                <p class="app-legal-disclaimer">Unofficial community project. Backdoors &amp; Breaches is a game by Black Hills Information Security &amp; Antisyphon Training.</p>',
            '                <a class="app-legal-gh" href="https://github.com/Jonesckevin" target="_blank" rel="noopener noreferrer" title="Jonesckevin on GitHub" aria-label="Jonesckevin on GitHub">',
            "                    <span>Jonesckevin</span>",
            "                </a>",
            "            </div>",
            "        </footer>",
            "    </div>",
            '    <script src="js/fab.js"></script>',
            "</body>",
            "</html>",
            "",
        ]
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="Regenerate the static card index")
    parser.add_argument("--src", default=str(Path(__file__).resolve().parent.parent))
    parser.add_argument("--check", action="store_true", help="fail if the committed output is stale")
    parser.add_argument("--home", default="/", help="legacy: the footer no longer links Home, kept for CLI compatibility")
    args = parser.parse_args()

    root = Path(args.src).resolve()
    catalogue_path = root / "shared" / "catalogue.html"
    index_path = root / "shared" / "card-index.html"

    catalogue = catalogue_path.read_text(encoding="utf-8")
    decks = parse_decks(catalogue)
    details = load_details(root / "docs" / "card-details.json")

    new_index = render_card_index(decks, details, home=args.home)

    stale = not index_path.exists() or new_index != index_path.read_text(encoding="utf-8")

    if args.check:
        if stale:
            print("card index is stale – run: python tools/build_card_index.py", file=sys.stderr)
            return 1
        print(f"card index is current ({len(decks)} decks)")
        return 0

    index_path.write_text(new_index, encoding="utf-8", newline="\n")
    total = sum(sum(len(v) for v in details.get(d["key"], {}).get("cards", {}).values()) for d in decks)
    print(f"Wrote {index_path.relative_to(root)} ({len(decks)} decks, {total} card entries)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
