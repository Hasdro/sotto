#!/usr/bin/env bash
# Sotto environment check: prints what this machine/session can do.
# Never prints secret values — only whether a variable is set.
set -u

ok()   { printf '  \033[32m✓\033[0m %-22s %s\n' "$1" "$2"; }
miss() { printf '  \033[33m✗\033[0m %-22s %s\n' "$1" "$2"; }

ver() { "$@" 2>/dev/null | head -1; }
tool() { # name, version command...
  local name=$1; shift
  if command -v "$name" >/dev/null 2>&1; then ok "$name" "$(ver "$@")"; else miss "$name" "not installed"; fi
}

if [ "${CLAUDE_CODE_REMOTE:-}" = "true" ]; then env_kind="cloud (Claude Code on the web)"; else env_kind="local"; fi
echo "Sotto doctor — environment: $env_kind — $(uname -s) $(uname -m)"

echo "Core"
tool git git --version
tool node node --version
tool pnpm pnpm --version
tool python3 python3 --version
tool uv uv --version
tool gh gh --version

echo "Backend / calls"
tool supabase supabase --version
tool lk lk --version
if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then ok docker "running"; else miss docker "not running → local DB / RLS tests unavailable (local-only)"; fi
tool ollama ollama --version

echo "Mobile"
tool eas eas --version
tool watchman watchman --version
if xcrun simctl help >/dev/null 2>&1; then ok "ios simulator" "available"; else miss "ios simulator" "Xcode not installed (local-only)"; fi
if [ -d "${ANDROID_HOME:-$HOME/Library/Android/sdk}/platform-tools" ]; then ok "android sdk" "${ANDROID_HOME:-$HOME/Library/Android/sdk}"; else miss "android sdk" "open Android Studio once to install the SDK"; fi
if command -v java >/dev/null 2>&1 && java -version >/dev/null 2>&1; then ok java "$(java -version 2>&1 | head -1)"; elif [ -x /opt/homebrew/opt/openjdk@17/bin/java ]; then ok java "openjdk@17 (keg-only; set JAVA_HOME for Android builds)"; else miss java "needed for Android builds"; fi

echo "Keys (set / missing — values never shown)"
for v in ANTHROPIC_API_KEY OPENAI_API_KEY STT_PRIMARY_API_KEY STT_BACKUP_API_KEY LIVEKIT_URL LIVEKIT_API_KEY LIVEKIT_API_SECRET SUPABASE_URL SUPABASE_ANON_KEY; do
  if [ -n "${!v:-}" ]; then ok "$v" "set"; elif [ -f .env ] && grep -q "^$v=." .env 2>/dev/null; then ok "$v" "in .env"; else miss "$v" "missing"; fi
done

echo "Repo"
[ -f package.json ] && ok "package.json" "skeleton exists" || miss "package.json" "no app code yet (Phase 1 creates it)"
ls test-calls/*.json >/dev/null 2>&1 && ok "golden calls" "$(ls test-calls/*.json | wc -l | tr -d ' ') labelled" || miss "golden calls" "none labelled yet (P0.5)"
echo "Done. Mark tasks needing a missing capability as 'blocked: local-only' or 'owner' in docs/TRACKER.md."
