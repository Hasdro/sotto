#!/usr/bin/env bash
# Fixture tests for scripts/check-boundaries.sh (P1.5).
# Each fixtures/boundaries/fail-<rule>/ tree must fail with [<rule>] (a trailing -ts/-py variant
# suffix is ignored); each pass-*/ tree must pass. Finally the real repository must pass.
set -uo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
check="$here/../check-boundaries.sh"
failures=0

for dir in "$here"/fixtures/boundaries/*/; do
  name="$(basename "$dir")"
  out="$(bash "$check" "$dir" 2>&1)"; code=$?
  case "$name" in
    fail-*)
      rule="${name#fail-}"; rule="${rule%-ts}"; rule="${rule%-py}"
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

[[ $failures -eq 0 ]] || { echo "$failures boundary fixture test(s) failed"; exit 1; }
echo "all boundary fixture tests passed"
