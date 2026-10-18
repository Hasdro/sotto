"""Boundary rules for Sotto. Standard library only, so it runs anywhere python3 does.

Each finding prints as `path:line: [rule] message`. Exit 1 if there is any finding.
Fixture tests: scripts/tests/run.sh (one failing tree per rule and per import form).
"""

from __future__ import annotations

import ast
import re
import subprocess
import sys
from collections.abc import Callable, Iterator
from dataclasses import dataclass
from pathlib import Path

# Only walked when the root is not a git checkout (fixture trees); a checkout uses git ls-files,
# which already leaves out ignored output. Keep this list to things that are never source.
SKIP_DIRS = {".git", "node_modules", ".venv", "__pycache__", ".mypy_cache", ".ruff_cache"}
FIXTURES = "scripts/tests/fixtures/"
PY = {".py", ".pyi"}
TS = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts", ".cts"}
CODE = PY | TS
CONFIG = {".json", ".yaml", ".yml", ".toml", ".sql"}
LOCKFILES = {"pnpm-lock.yaml", "uv.lock", "package-lock.json"}

# The only directories where provider SDKs and model names may appear (ENGINEERING §1, §3).
ADAPTER_ROOTS = ("apps/agent-worker/sotto_worker/adapters/", "supabase/functions/_shared/adapters/")
# Prompt text matters where prompts could be sent to a model; UI copy may say "You are …".
PROMPT_ROOTS = ("apps/agent-worker/", "supabase/", "packages/shared/")

PY_SDK_MODULES = {
    "anthropic", "openai", "deepgram", "speechmatics", "soniox", "assemblyai", "resend",
    "postmarker", "stripe", "twilio", "telnyx", "zcrmsdk", "google.genai", "google.generativeai",
    "livekit.plugins", "mistralai", "cohere", "groq", "elevenlabs", "litellm",
}  # fmt: skip
TS_SDKS = (
    r"openai|@anthropic-ai/[\w.-]+|@google/genai|@google/generative-ai|@ai-sdk/[\w.-]+|ai"
    r"|resend|postmark|stripe|twilio|telnyx|@deepgram/sdk|@speechmatics/[\w.-]+|assemblyai"
    r"|@livekit/agents-plugin-[\w.-]+|groq-sdk|@mistralai/[\w.-]+|cohere-ai|elevenlabs"
)
# Optional Deno/URL prefix (npm:, jsr:, https://esm.sh/…), optional @version and subpath.
TS_SPEC = rf"(?:npm:|jsr:|https?://[^'\"`]*?/)?(?:{TS_SDKS})(?:@[\w.^~-]+)?(?:/[^'\"`]*)?"
TS_IMPORT = re.compile(
    rf"""(?:\bfrom\s+|\brequire\(\s*|\bimport\(\s*|^\s*import\s+|^\s*export\s+\*\s+from\s+)"""
    rf"""['"`]{TS_SPEC}['"`]"""
)
MODEL_NAME = re.compile(
    r"\b(claude-(?:opus|sonnet|haiku|fable|instant|\d)[\w.-]*|gpt-\d[\w.-]*|gpt-[4][o][\w.-]*"
    r"|gemini-\d[\w.-]*|llama-?\d[\w.-]*|whisper-(?:large|medium|small|base|tiny|\d)[\w.-]*"
    r"|mistral-(?:large|medium|small)[\w.-]*|mixtral-[\w.-]+|qwen\d[\w.-]*|deepseek-[\w.-]+"
    r"|nova-\d[\w.-]*)",
    re.IGNORECASE,
)
# A suppression is allowed only when its line names a tracker entry that exists (CLAUDE.md).
TRACKER_ID = re.compile(r"\bT-\d{3,}\b")
SUPPRESSION = re.compile(
    r"@ts-ignore|@ts-nocheck|@ts-expect-error|#\s*type:\s*ignore|#\s*pyright:\s*ignore"
    r"|pragma:\s*no\s*cover|biome-ignore|eslint-disable"
    r"|\b(?:it|test|describe|suite|bench)(?:\.\w+)*\.(?:skip\w*|only|todo|fails|runIf)\b"
    r"|\bx(?:it|describe|test)\(|\bf(?:it|describe)\("
    r"|pytest\.mark\.(?:skip\w*|xfail)\b|pytest\.(?:skip|importorskip|xfail)\("
    r"|unittest\.(?:skip\w*|expectedFailure)\b|@expectedFailure\b"
)


@dataclass(frozen=True)
class Finding:
    rel: str
    line: int
    rule: str
    message: str

    def __str__(self) -> str:
        return f"{self.rel}:{self.line}: [{self.rule}] {self.message}"


@dataclass(frozen=True)
class Rule:
    id: str
    message: str
    applies: Callable[[str], bool]  # relative posix path → should this file be checked?
    pattern: re.Pattern[str]


def _suffix(rel: str) -> str:
    return Path(rel).suffix


def is_test(rel: str) -> bool:
    name = Path(rel).name
    parts = rel.split("/")
    return (
        "tests" in parts
        or "__tests__" in parts
        or name.startswith("test_")
        or re.search(r"\.test\.[cm]?[jt]sx?$", name) is not None
    )


def in_adapters(rel: str) -> bool:
    return rel.startswith(ADAPTER_ROOTS)


def in_app(rel: str) -> bool:
    return rel.startswith("apps/app/")


SDK_MESSAGE = "provider SDKs may only be imported inside an adapters/ root"

LINE_RULES = [
    Rule(
        "provider-sdk",
        SDK_MESSAGE,
        lambda rel: _suffix(rel) in TS and not in_adapters(rel),
        TS_IMPORT,
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
        lambda rel: _suffix(rel) in CODE and rel.startswith(PROMPT_ROOTS) and not is_test(rel),
        re.compile(r"\bYou are\b"),
    ),
    Rule(
        "app-imports-worker",
        "apps/app must never import from apps/agent-worker",
        lambda rel: in_app(rel) and _suffix(rel) in CODE,
        re.compile(
            r"""(?:from\s+|require\(\s*|import\(\s*)['"`][^'"`]*(?:agent-worker|sotto_worker)"""
        ),
    ),
    Rule(
        "app-provider-key",
        "the app must never hold a provider key or the service role",
        lambda rel: in_app(rel) and _suffix(rel) in CODE | CONFIG,
        re.compile(
            r"(?:ANTHROPIC|OPENAI|DEEPGRAM|SPEECHMATICS|SONIOX|ASSEMBLYAI|RESEND|POSTMARK|GOOGLE"
            r"|GROQ|OPENROUTER|ELEVENLABS)_(?:API_)?(?:KEY|SECRET|TOKEN)"
            r"|LIVEKIT_API_(?:KEY|SECRET)|STRIPE_SECRET|ZOHO_CLIENT_SECRET|SERVICE_ROLE"
            r"|\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{16,}",
            re.IGNORECASE,
        ),
    ),
    Rule(
        "app-raw-colour",
        "colours come from packages/ui tokens, not literals in the app",
        lambda rel: in_app(rel) and _suffix(rel) in TS and not is_test(rel),
        re.compile(r"""['"`]#[0-9a-fA-F]{3,8}['"`]"""),
    ),
]


def _is_sdk(module: str) -> bool:
    return any(module == m or module.startswith(m + ".") for m in PY_SDK_MODULES)


def python_sdk_imports(source: str) -> Iterator[int]:
    """Line numbers of provider-SDK imports, in any form the parser sees (nested, comma, from)."""
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            if any(_is_sdk(alias.name) for alias in node.names):
                yield node.lineno
        elif isinstance(node, ast.ImportFrom) and node.module and node.level == 0:
            full = [f"{node.module}.{alias.name}" for alias in node.names]
            if _is_sdk(node.module) or any(_is_sdk(name) for name in full):
                yield node.lineno
        elif (
            isinstance(node, ast.Call)
            and node.args
            and isinstance(node.args[0], ast.Constant)
            and isinstance(node.args[0].value, str)
            and _is_sdk(node.args[0].value)
            and (
                (isinstance(node.func, ast.Attribute) and node.func.attr == "import_module")
                or (
                    isinstance(node.func, ast.Name)
                    and node.func.id in {"__import__", "import_module"}
                )
            )
        ):
            yield node.lineno


def tracker_ids(root: Path) -> set[str]:
    tracker = root / "docs" / "TRACKER.md"
    return (
        set(TRACKER_ID.findall(tracker.read_text(encoding="utf-8"))) if tracker.exists() else set()
    )


def files(root: Path) -> Iterator[str]:
    """Relative posix paths: tracked + untracked-not-ignored files in a git checkout, else walk."""
    git = subprocess.run(
        ["git", "-C", str(root), "rev-parse", "--show-toplevel"],
        capture_output=True,
        text=True,
        check=False,
    )
    if git.returncode == 0 and Path(git.stdout.strip()).resolve() == root:
        listed = subprocess.run(
            [
                "git",
                "-C",
                str(root),
                "ls-files",
                "-z",
                "--cached",
                "--others",
                "--exclude-standard",
            ],
            capture_output=True,
            check=True,
        ).stdout.decode()
        for rel in sorted(set(listed.split("\0")) - {""}):
            if not rel.startswith((FIXTURES, ".claude/")) and (root / rel).is_file():
                yield rel
        return
    stack = [root]
    while stack:
        current = stack.pop()
        for entry in sorted(current.iterdir()):
            if entry.is_dir():
                if entry.name not in SKIP_DIRS:
                    stack.append(entry)
            elif entry.is_file():
                yield entry.relative_to(root).as_posix()


def check(root: Path) -> list[Finding]:
    known_ids = tracker_ids(root)
    findings: list[Finding] = []
    for rel in files(root):
        suffix = _suffix(rel)
        rules = [r for r in LINE_RULES if r.applies(rel)]
        if suffix not in CODE | CONFIG:
            continue
        try:
            text = (root / rel).read_text(encoding="utf-8")
        except UnicodeDecodeError:
            findings.append(
                Finding(rel, 1, "undecodable", "file is not UTF-8, so it cannot be checked")
            )
            continue
        if suffix in PY and not in_adapters(rel):
            try:
                findings += [
                    Finding(rel, n, "provider-sdk", SDK_MESSAGE) for n in python_sdk_imports(text)
                ]
            except SyntaxError as err:
                findings.append(
                    Finding(rel, err.lineno or 1, "unparsable", f"Python syntax error: {err.msg}")
                )
        check_suppressions = suffix in CODE and rel != "scripts/check_boundaries.py"
        for number, line in enumerate(text.splitlines(), start=1):
            for rule in rules:
                if rule.pattern.search(line):
                    findings.append(Finding(rel, number, rule.id, rule.message))
            if check_suppressions and SUPPRESSION.search(line):
                ids = set(TRACKER_ID.findall(line))
                if not ids:
                    message = (
                        "suppression or skipped/focused test needs a tracker ID (T-NNN) on the line"
                    )
                    findings.append(Finding(rel, number, "suppression", message))
                elif not ids <= known_ids:
                    missing = ", ".join(sorted(ids - known_ids))
                    message = f"suppression cites {missing}, which is not in docs/TRACKER.md"
                    findings.append(Finding(rel, number, "suppression", message))
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
