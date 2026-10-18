"""Boundary rules for Sotto. Standard library only, so it runs anywhere python3 does.

Each finding prints as `path:line: [rule] message`. Exit 1 if there is any finding.
"""

from __future__ import annotations

import re
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

SKIP_DIRS = {
    ".git",
    "node_modules",
    ".venv",
    "dist",
    "build",
    ".expo",
    "__pycache__",
    ".temp",
    ".mypy_cache",
    ".ruff_cache",
    ".pytest_cache",
    ".claude",
}
CODE = {".py", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"}
CONFIG = {".json", ".yaml", ".yml", ".toml", ".sql"}
LOCKFILES = {"pnpm-lock.yaml", "uv.lock", "package-lock.json"}

PY_SDKS = (
    r"anthropic|openai|deepgram|speechmatics|soniox|assemblyai|resend|postmarker|stripe|twilio"
    r"|telnyx|zcrmsdk|google\.genai|google\.generativeai|livekit\.plugins"
)
TS_SDKS = (
    r"openai|@anthropic-ai/sdk|@google/genai|resend|postmark|stripe|twilio|telnyx|@deepgram/sdk"
    r"|@speechmatics/[^'\"]+|assemblyai"
)
MODEL_NAME = re.compile(
    r"\b(claude-(?:opus|sonnet|haiku|fable|instant|\d)[\w.-]*|gpt-\d[\w.-]*|gpt-[4][o][\w.-]*"
    r"|gemini-\d[\w.-]*|llama-?\d[\w.-]*|whisper-[\w.-]+|mistral-(?:large|medium|small)[\w.-]*"
    r"|qwen\d[\w.-]*|deepseek-[\w.-]+)",
    re.IGNORECASE,
)


@dataclass(frozen=True)
class Rule:
    id: str
    message: str
    applies: Callable[[str], bool]  # relative posix path → should this file be checked?
    pattern: re.Pattern[str]
    unless: re.Pattern[str] | None = None  # a matching line is allowed if this also matches


# A suppression is allowed only when the same line names its tracker entry (CLAUDE.md hard rules).
TRACKER_ID = re.compile(r"\bT-\d{3,}\b")


def _parts(rel: str) -> list[str]:
    return rel.split("/")


def _suffix(rel: str) -> str:
    return Path(rel).suffix


def is_test(rel: str) -> bool:
    name = Path(rel).name
    parts = _parts(rel)
    return (
        "tests" in parts
        or "__tests__" in parts
        or name.startswith("test_")
        or re.search(r"\.test\.[jt]sx?$", name) is not None
    )


def in_adapters(rel: str) -> bool:
    return "adapters" in _parts(rel)


def in_app(rel: str) -> bool:
    return rel.startswith("apps/app/")


RULES = [
    Rule(
        "provider-sdk",
        "provider SDKs may only be imported inside an adapters/ directory",
        lambda rel: _suffix(rel) == ".py" and not in_adapters(rel),
        re.compile(rf"^\s*(?:import|from)\s+(?:{PY_SDKS})\b"),
    ),
    Rule(
        "provider-sdk",
        "provider SDKs may only be imported inside an adapters/ directory",
        lambda rel: _suffix(rel) in CODE - {".py"} and not in_adapters(rel),
        re.compile(
            rf"""(?:from\s+|require\(\s*|import\(\s*|^\s*import\s+)['"](?:{TS_SDKS})(?:/[^'"]*)?['"]"""
        ),
    ),
    Rule(
        "model-name",
        "model names belong in seed/models/ or an adapter's capability table, not in code",
        lambda rel: (
            (_suffix(rel) in CODE | CONFIG)
            and Path(rel).name not in LOCKFILES
            and not rel.startswith("seed/models/")
            and not in_adapters(rel)
            and not is_test(rel)
        ),
        MODEL_NAME,
    ),
    Rule(
        "prompt-text",
        "prompt text belongs in seed/prompts/ (the prompt registry), not in code",
        lambda rel: _suffix(rel) in CODE and not is_test(rel),
        re.compile(r"\bYou are\b"),
    ),
    Rule(
        "app-imports-worker",
        "apps/app must never import from apps/agent-worker",
        lambda rel: in_app(rel) and _suffix(rel) in CODE,
        re.compile(
            r"""(?:from\s+|require\(\s*|import\(\s*)['"][^'"]*(?:agent-worker|sotto_worker)"""
        ),
    ),
    Rule(
        "app-provider-key",
        "the app must never hold a provider key or the service role",
        lambda rel: in_app(rel) and _suffix(rel) in CODE | CONFIG,
        re.compile(
            r"(?:ANTHROPIC|OPENAI|DEEPGRAM|SPEECHMATICS|SONIOX|ASSEMBLYAI|RESEND|POSTMARK|GOOGLE)"
            r"_API_KEY|LIVEKIT_API_(?:KEY|SECRET)|STRIPE_SECRET|ZOHO_CLIENT_SECRET|SERVICE_ROLE",
            re.IGNORECASE,
        ),
    ),
    Rule(
        "app-raw-colour",
        "colours come from packages/ui tokens, not literals in the app",
        lambda rel: (
            in_app(rel) and _suffix(rel) in {".ts", ".tsx", ".js", ".jsx"} and not is_test(rel)
        ),
        re.compile(r"""['"`]#[0-9a-fA-F]{3,8}['"`]"""),
    ),
]


RULES.append(
    Rule(
        "suppression",
        "no type-check suppressions or skipped/focused tests without a tracker ID (T-NNN)",
        # This file spells the patterns out, so it is the one exemption.
        lambda rel: _suffix(rel) in CODE and rel != "scripts/check_boundaries.py",
        re.compile(
            r"@ts-ignore|@ts-nocheck|@ts-expect-error|#\s*type:\s*ignore|#\s*pyright:\s*ignore"
            r"|\b(?:it|test|describe)\.(?:skip|only|todo)\b|\bx(?:it|describe)\(|\bf(?:it|describe)\("
            r"|pytest\.mark\.(?:skip|xfail)\b|pytest\.skip\(|unittest\.skip\b"
        ),
        unless=TRACKER_ID,
    )
)


def files(root: Path) -> Iterator[tuple[Path, str]]:
    stack = [root]
    while stack:
        current = stack.pop()
        for entry in sorted(current.iterdir()):
            rel = entry.relative_to(root).as_posix()
            if entry.is_dir():
                # Fixture trees hold deliberate violations; scripts/tests/run.sh checks them.
                if entry.name in SKIP_DIRS or rel == "scripts/tests/fixtures":
                    continue
                stack.append(entry)
            elif entry.is_file():
                yield entry, rel


def check(root: Path) -> list[str]:
    findings: list[str] = []
    for path, rel in files(root):
        rules = [r for r in RULES if r.applies(rel)]
        if not rules:
            continue
        try:
            lines = path.read_text(encoding="utf-8").splitlines()
        except UnicodeDecodeError:
            continue
        for number, line in enumerate(lines, start=1):
            for rule in rules:
                if rule.pattern.search(line) and not (rule.unless and rule.unless.search(line)):
                    findings.append(f"{rel}:{number}: [{rule.id}] {rule.message}")
    return findings


def main(argv: list[str]) -> int:
    root = Path(argv[1] if len(argv) > 1 else ".").resolve()
    findings = check(root)
    for finding in findings:
        print(finding)
    if findings:
        print(f"check-boundaries: {len(findings)} violation(s)")
        return 1
    print("check-boundaries: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
