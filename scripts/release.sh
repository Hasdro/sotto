#!/usr/bin/env bash
# Creates a GitHub Release (versioned archive, D-030; Apple-chip Mac + Windows per D-097) with the installers.
#   scripts/release.sh v0.3.0            # DRY RUN: prints the gh command and the notes
#   scripts/release.sh v0.3.0 --publish  # really creates the release (master/owner only)
# Notes come from the lines of docs/TRACKER.md that mention the version. Unsigned builds: no auto-update.
set -euo pipefail
TAG=${1:?usage: scripts/release.sh vX.Y.Z [--publish]}
MODE=${2:-}
[[ $TAG =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "tag must look like v0.3.0"; exit 1; }
VER=${TAG#v}
ROOT=$(git rev-parse --show-toplevel)
cd "$ROOT"
REL=${RELEASE_DIR:-apps/desktop/release}
FILES=()
for f in "$REL"/*-"$VER"-arm64.dmg "$REL"/*" Setup $VER.exe"; do
  [ -f "$f" ] && FILES+=("$f")
done
[ "${#FILES[@]}" -eq 2 ] || { echo "expected 2 installers for $VER in $REL (arm64 dmg, exe), found ${#FILES[@]}"; exit 1; }
NOTES=$(mktemp)
{
  echo "AGN Sales Shield $TAG"
  echo
  echo "Unsigned builds. macOS: right-click the app, choose Open. Windows: SmartScreen > More info > Run anyway. No auto-update."
  echo
  echo "From the tracker:"
  grep -F "$VER" docs/TRACKER.md | grep -v '^###' | head -20 | cut -c1-300 | sed 's/^/ /' || true
  echo
  echo "SHA-256:"
  for f in "${FILES[@]}"; do shasum -a 256 "$f" | awk -v n="$(basename "$f")" '{print "- " $1 "  " n}'; done
} > "$NOTES"
CMD=(gh release create "$TAG" "${FILES[@]}" --title "AGN Sales Shield $TAG" --notes-file "$NOTES" --target "$(git rev-parse HEAD)")
if [ "$MODE" = "--publish" ]; then
  git diff --quiet || { echo "working tree is dirty"; exit 1; }
  "${CMD[@]}"
else
  echo "[dry-run] ${CMD[*]}"; echo "--- notes ---"; cat "$NOTES"; echo "--- dry run only; add --publish ---"
fi
rm -f "$NOTES"
