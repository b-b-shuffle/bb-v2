#!/bin/sh
# ---------------------------------------------------------------------------
# Build-time feature pruner for the B&B Shuffle static (GitHub Pages) branch.
#
# This branch has NO build step - the repo root *is* the site - so "gating a
# feature" means deleting its files AND its references from the CI checkout
# before the Pages artifact is uploaded. The workflow does exactly that:
#
#   .github/workflows/pages.yml -> runs this on the checkout, then deletes
#                                  tools/ so the script is not published.
#
# (The main repo uses the identical script from docker/prune-features.sh, where
# it runs inside the Docker build stage instead.)
#
# Usage:  sh prune-features.sh <root-dir> <feature> [feature ...]
#         sh prune-features.sh . mermaid
#
# Features live in the dispatch table below; adding one is a single case arm.
# Reference sites are marked in the source between sentinels naming the
# feature, e.g.  <!-- feature:mermaid:start --> ... <!-- feature:mermaid:end -->
# and are deleted as a range, so the page keeps working with no dead links.
#
# Never point this at a live working tree - it edits and deletes files in
# place. Always run it against a copy (the CI checkout, or a throwaway
# `cp -r` for local testing).
#
# Safe to re-run: a missing file or an absent marker pair is skipped, never an
# error. Invoke via `sh <path>` so no execute bit is required (Windows
# checkouts do not preserve one).
# ---------------------------------------------------------------------------
set -eu

ROOT=${1:-}
if [ -z "$ROOT" ] || [ "$#" -lt 2 ]; then
    echo "usage: $0 <root-dir> <feature> [feature ...]" >&2
    exit 2
fi
if [ ! -d "$ROOT" ]; then
    echo "prune-features: not a directory: $ROOT" >&2
    exit 2
fi
shift

rel() {
    # Strip the (possibly repeated) root prefix so messages stay readable.
    printf '%s' "${1#"$ROOT"/}"
}

remove_path() {
    if [ -e "$1" ]; then
        rm -rf "$1"
        echo "  removed:  $(rel "$1")"
    else
        echo "  absent:   $(rel "$1")"
    fi
}

strip_markers() {
    # strip_markers <file> <feature> - delete the sentinel-delimited block.
    file=$1
    feature=$2
    if [ ! -f "$file" ]; then
        echo "  absent:   $(rel "$file")"
        return 0
    fi
    if ! grep -q "feature:$feature:start" "$file" || \
       ! grep -q "feature:$feature:end" "$file"; then
        echo "  no marks: $(rel "$file")"
        return 0
    fi
    # Both markers are present (guarded above), so the range cannot run to EOF.
    sed -i "/feature:$feature:start/,/feature:$feature:end/d" "$file"
    echo "  stripped: $(rel "$file")"
}

prune_mermaid() {
    echo "prune-features: mermaid"
    remove_path "$ROOT/Engine-V2/modules/mermaid"
    strip_markers "$ROOT/index.html" mermaid
    strip_markers "$ROOT/shared/js/fab.js" mermaid
}

for feature in "$@"; do
    case "$feature" in
        mermaid) prune_mermaid ;;
        *)
            echo "prune-features: unknown feature '$feature'" >&2
            exit 2
            ;;
    esac
done

echo "prune-features: done"
