#!/usr/bin/env bash
# Fixture tests for scripts/check-boundaries.sh (P1.5) and scripts/check_bundle_size.py (P1.8).
# Each fixtures/boundaries/fail-<rule>[--<variant>]/ tree must fail with [<rule>]; each pass-*/
# tree must pass. Finally the real repository must pass.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
check="$here/../check-boundaries.sh"
failures=0

for dir in "$here"/fixtures/boundaries/*/; do
  name="$(basename "$dir")"
  out="$(bash "$check" "$dir" 2>&1)"; code=$?
  case "$name" in
    fail-*)
      rule="${name#fail-}"; rule="${rule%%--*}"
      if [[ $code -ne 1 || "$out" != *"[$rule]"* ]]; then
        echo "FAIL $name: expected exit 1 with [$rule], got exit $code:"; echo "$out"; failures=$((failures + 1))
      else
        echo "ok   $name"
      fi ;;
    pass-*)
      if [[ $code -ne 0 ]]; then
        echo "FAIL $name: expected exit 0, got $code:"; echo "$out"; failures=$((failures + 1))
      else
        echo "ok   $name"
      fi ;;
  esac
done

out="$(bash "$check" 2>&1)"; code=$?
if [[ $code -ne 0 ]]; then echo "FAIL repository: $out"; failures=$((failures + 1)); else echo "ok   repository"; fi

# Bundle budget script: a tiny bundle passes, an incompressible one over budget fails.
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
mkdir -p "$tmp/small/_expo/static/js/web" "$tmp/big/_expo/static/js/web"
echo 'console.log("hi")' > "$tmp/small/_expo/static/js/web/entry.js"
head -c 200000 /dev/urandom > "$tmp/big/_expo/static/js/web/entry.js"
if python3 "$here/../check_bundle_size.py" "$tmp/small" 100 >/dev/null; then echo "ok   bundle-size under budget"; else echo "FAIL bundle-size under budget"; failures=$((failures + 1)); fi
if python3 "$here/../check_bundle_size.py" "$tmp/big" 100 >/dev/null; then echo "FAIL bundle-size over budget passed"; failures=$((failures + 1)); else echo "ok   bundle-size over budget"; fi

[[ $failures -eq 0 ]] || { echo "$failures boundary fixture test(s) failed"; exit 1; }
echo "all boundary fixture tests passed"
