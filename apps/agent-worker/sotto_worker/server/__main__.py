"""`python -m sotto_worker.server`: the Sotto server (D-020).

Local (default): binds 127.0.0.1, no access code, data in `<repo>/.sotto-data/`.
Hosted: `--host 0.0.0.0` needs SOTTO_ACCESS_CODE, SOTTO_SECRET_KEY and SOTTO_PUBLIC_ORIGIN
(see deploy/README.md); refuses to start without them.
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
from collections.abc import Mapping
from pathlib import Path

from starlette.types import ASGIApp

from sotto_worker.clock import RealClock
from sotto_worker.playbook import PlaybookEntry
from sotto_worker.router import RoutingConfig
from sotto_worker.runtime import REPO_ROOT, SEED, Runtime, build_demo_runtime
from sotto_worker.server.app import ServerConfig, create_app
from sotto_worker.server.auth import AccessGate
from sotto_worker.server.catalog import Catalog, apply_overrides
from sotto_worker.server.store import Store
from sotto_worker.server.vault import MIN_SECRET_CHARS, Vault

LOOPBACK = {"127.0.0.1", "localhost", "::1"}
DEFAULT_DATA = REPO_ROOT / ".sotto-data"


def local_secret(data_dir: Path) -> str:
    """A per-machine secret for local mode, created once with owner-only permissions."""
    path = data_dir / "secret.key"
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
        path.chmod(0o600)
    return path.read_text().strip()


def hosted_problems(host: str, env: Mapping[str, str]) -> list[str]:
    if host in LOOPBACK:
        return []
    problems = []
    if len(env.get("SOTTO_ACCESS_CODE", "")) < 8:
        problems.append("SOTTO_ACCESS_CODE (at least 8 characters)")
    if len(env.get("SOTTO_SECRET_KEY", "")) < MIN_SECRET_CHARS:
        problems.append(f"SOTTO_SECRET_KEY (at least {MIN_SECRET_CHARS} characters)")
    origin = env.get("SOTTO_PUBLIC_ORIGIN", "")
    plain_http_ok = env.get("SOTTO_ALLOW_HTTP") == "1"  # rehearsals on a private network only
    if not (origin.startswith("https://") or (plain_http_ok and origin.startswith("http://"))):
        problems.append("SOTTO_PUBLIC_ORIGIN (https://…; cookies need HTTPS)")
    return problems


def build(args: argparse.Namespace, env: Mapping[str, str]) -> tuple[ServerConfig, ASGIApp]:
    hosted = args.host not in LOOPBACK
    data_dir = Path(env.get("SOTTO_DATA_DIR") or DEFAULT_DATA)
    data_dir.mkdir(parents=True, exist_ok=True)
    secret = env.get("SOTTO_SECRET_KEY") or local_secret(data_dir)
    store = Store(data_dir / "sotto.db", Vault(secret))
    catalog = Catalog.load(SEED / "models" / "providers.yaml")
    seed = RoutingConfig.load(SEED / "models" / "default.yaml")
    config = ServerConfig(
        static_dir=args.static,
        access_code=env.get("SOTTO_ACCESS_CODE") if hosted else None,
        public_origin=env.get("SOTTO_PUBLIC_ORIGIN") if hosted else None,
        port=args.port,
        speed=args.speed,
        log=lambda s: print(s, flush=True),
    )

    # Only provider keys reach a call's runtime, never SOTTO_SECRET_KEY or the access code.
    provider_env = {name: env[name] for name in catalog.key_envs if env.get(name)}

    def runtime() -> Runtime:
        keys = store.env_overlay(provider_env)
        routing = apply_overrides(seed, catalog, store.stage_overrides())
        added = [
            PlaybookEntry(
                id=f"inbox#{e['id']}",
                kind="faq",
                question=e["question"],
                short_answer=e["answer"],
                tags=("from-inbox",),
            )
            for e in store.playbook_added()
        ]
        return build_demo_runtime(
            RealClock(), keys, force_fake=args.fake, config=routing, extra_playbook=added
        )

    app = create_app(
        config,
        gate=AccessGate(config.access_code, secret),
        store=store,
        catalog=catalog,
        seed=seed,
        env=provider_env,
        runtime_factory=runtime,
    )
    first = runtime()
    print(f"\n  Sotto · {first.company.name} · {first.mode} models", flush=True)
    stt = first.stt_routes[0].provider if first.stt_routes else "off (no STT key)"
    print(f"  speech-to-text: {stt}", flush=True)
    for note in first.notes:
        print(f"  note: {note}", flush=True)
    where = config.public_origin or f"http://{args.host}:{args.port}"
    print(f"\n  Open {where}  (Ctrl+C to stop)\n", flush=True)
    return config, app


def parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(prog="sotto-server")
    p.add_argument("--host", default="127.0.0.1")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--static", type=Path, default=REPO_ROOT / "apps" / "app" / "dist")
    p.add_argument("--speed", type=float, default=1.0, help="scenario pacing; 0.5 = twice as fast")
    p.add_argument("--fake", action="store_true", help="fake models even if a key is set")
    return p


def main(argv: list[str] | None = None) -> int:
    args = parser().parse_args(argv)
    problems = hosted_problems(args.host, os.environ)
    if problems:
        print("Hosted mode needs: " + ", ".join(problems), file=sys.stderr)
        return 2
    import uvicorn

    _config, app = build(args, os.environ)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="warning",
        proxy_headers=True,
        forwarded_allow_ips=os.environ.get("SOTTO_TRUSTED_PROXY", "127.0.0.1"),
        ws_max_size=2**20,
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
