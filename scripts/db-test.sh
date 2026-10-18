#!/usr/bin/env bash
# Database tests: migrations + pgTAP (RLS isolation, R3). `pnpm test:db`.
#   1. Supabase CLI + Docker available (the Mac)  → `supabase test db` (the real thing).
#   2. Otherwise a local PostgreSQL with pgTAP     → a throwaway cluster + scripts/db/supabase_shim.sql.
# Exit 1 on any failed test, SQL error, or when neither is available.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

if command -v supabase >/dev/null 2>&1 && docker info >/dev/null 2>&1 && [[ "${SOTTO_DB_TEST_LOCAL:-}" != 1 ]]; then
  cd "$root" && exec supabase test db
fi

pgbin="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
if [[ -z "$pgbin" || ! -x "$pgbin/initdb" ]]; then
  pgbin="$(dirname "$(command -v initdb 2>/dev/null || echo /nonexistent/initdb)")"
fi
if [[ ! -x "$pgbin/initdb" ]]; then
  echo "db-test: need either Docker + supabase CLI, or a local PostgreSQL with pgTAP." >&2
  exit 1
fi

tmp="$(mktemp -d)"
run() { if [[ $(id -u) -eq 0 ]]; then runuser -u postgres -- "$@"; else "$@"; fi; }
[[ $(id -u) -eq 0 ]] && chown postgres "$tmp"
port=$((55000 + RANDOM % 5000))
cleanup() { run "$pgbin/pg_ctl" -D "$tmp/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$tmp"; }
trap cleanup EXIT

run "$pgbin/initdb" -D "$tmp/data" -U postgres -A trust >/dev/null
run "$pgbin/pg_ctl" -D "$tmp/data" -o "-p $port -k $tmp -c listen_addresses=''" -l "$tmp/log" -w start >/dev/null
psql_() { psql -X -q -v ON_ERROR_STOP=1 -h "$tmp" -p "$port" -U postgres -d postgres "$@"; }

psql_ -f "$root/scripts/db/supabase_shim.sql"
for migration in "$root"/supabase/migrations/*.sql; do
  psql_ -f "$migration"
done

failed=0
total=0
shopt -s nullglob
for test in "$root"/supabase/tests/*.sql; do
  out="$(psql_ -t -A -f "$test" 2>&1)" || { echo "$out"; echo "FAIL $(basename "$test"): SQL error"; failed=1; continue; }
  bad="$(grep -E '^not ok' <<<"$out" || true)"
  count="$(grep -cE '^ok' <<<"$out" || true)"
  total=$((total + count))
  planned="$(grep -oE '^1\.\.[0-9]+' <<<"$out" | head -1 | cut -d. -f3)"
  ran="$(grep -cE '^(not )?ok' <<<"$out" || true)"
  if [[ -n "$bad" || -z "$planned" || "$planned" != "$ran" ]]; then
    echo "$out" | grep -vE '^ok' ; echo "FAIL $(basename "$test") (planned ${planned:-?}, ran $ran)"; failed=1
  else
    echo "ok   $(basename "$test") ($count assertions)"
  fi
done
[[ $failed -eq 0 ]] || exit 1
echo "db-test: all pgTAP tests passed ($total assertions, local PostgreSQL $("$pgbin/postgres" --version | awk '{print $3}'))"
