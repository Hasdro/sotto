"""`python -m sotto_worker.cloud`: the management server (D-022).

serve         run the server (SOTTO_SECRET_KEY, SOTTO_DATA_DIR, SOTTO_PUBLIC_ORIGIN)
create-owner  create the platform owner account; the one-time password goes to a 0600 file
backup        copy the database to SOTTO_DATA_DIR/backups/, keeping the newest 14
email-setup   the mailbox that sends manager emails; asks for the password without showing it
email-test    send one test email through that mailbox
"""

from __future__ import annotations

import argparse
import os
import secrets
import sys
import time
from collections.abc import Callable, Mapping
from pathlib import Path

from sotto_worker.cloud.app import CloudConfig, create_cloud_app
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.mail import EMAIL, load_mailer, save_mail_config
from sotto_worker.cloud.passwords import new_temporary_password
from sotto_worker.cloud.recordings import Recordings
from sotto_worker.cloud.store import CloudStore
from sotto_worker.outbox import EmailMessage
from sotto_worker.runtime import REPO_ROOT
from sotto_worker.server.vault import MIN_SECRET_CHARS, Vault

DEFAULT_DATA = REPO_ROOT / ".sotto-data" / "cloud"
KEEP_BACKUPS = 14


def data_dir(env: Mapping[str, str]) -> Path:
    path = Path(env.get("SOTTO_DATA_DIR") or DEFAULT_DATA)
    path.mkdir(parents=True, exist_ok=True)
    return path


def vault(env: Mapping[str, str]) -> Vault:
    return Vault(secret(env, data_dir(env)))


def email_setup(
    env: Mapping[str, str], ask: Callable[[str], str], ask_secret: Callable[[str], str]
) -> Path:
    """Asks for the mailbox (host, port, login, From) and its password; stores them encrypted."""
    host = ask("Mail server [smtp.hostinger.com]: ").strip() or "smtp.hostinger.com"
    port = int(ask("Port, 465 (SSL) or 587 (STARTTLS) [465]: ").strip() or "465")
    user = ask("Mailbox login, e.g. sotto@agncompu.com: ").strip()
    sender = ask(f"From [Sotto <{user}>]: ").strip() or f"Sotto <{user}>"
    password = ask_secret("Mailbox password (not shown): ")
    if not EMAIL.match(user) or not password or port not in (465, 587):
        raise SystemExit(
            "a mailbox login (an email address), a password and port 465 or 587 please"
        )
    path = data_dir(env) / "email.json"
    save_mail_config(
        path,
        vault(env),
        {"host": host, "port": port, "user": user, "password": password, "from": sender},
    )
    return path


def secret(env: Mapping[str, str], data: Path) -> str:
    value = env.get("SOTTO_SECRET_KEY")
    if value:
        return value
    path = data / "secret.key"  # local runs only; production sets SOTTO_SECRET_KEY
    if not path.exists():
        path.write_text(secrets.token_urlsafe(48))
        path.chmod(0o600)
    return path.read_text().strip()


def open_store(env: Mapping[str, str]) -> CloudStore:
    data = data_dir(env)
    key = secret(env, data)
    if len(key) < MIN_SECRET_CHARS:
        raise SystemExit(f"SOTTO_SECRET_KEY must be at least {MIN_SECRET_CHARS} characters")
    return CloudStore(data / "cloud.db", Vault(key))


def backup(env: Mapping[str, str]) -> Path:
    store = open_store(env)
    folder = data_dir(env) / "backups"
    folder.mkdir(exist_ok=True)
    target = folder / time.strftime("cloud-%Y%m%d-%H%M%S.db")
    store.backup(target)
    target.chmod(0o600)
    for old in sorted(folder.glob("cloud-*.db"))[:-KEEP_BACKUPS]:
        old.unlink()
    return target


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="sotto-cloud")
    sub = p.add_subparsers(dest="cmd", required=True)
    serve = sub.add_parser("serve")
    serve.add_argument("--host", default="127.0.0.1")
    serve.add_argument("--port", type=int, default=8788)
    serve.add_argument("--static", type=Path, default=REPO_ROOT / "apps" / "app" / "dist")
    owner = sub.add_parser("create-owner")
    owner.add_argument("--email", required=True)
    owner.add_argument("--name", default="Owner")
    owner.add_argument("--password-file", type=Path, required=True)
    sub.add_parser("backup")
    sub.add_parser("email-setup")
    test = sub.add_parser("email-test")
    test.add_argument("--to", required=True)
    examples = sub.add_parser("add-examples")
    examples.add_argument("--company", required=True, help="the company's name, e.g. Zylker")
    args = p.parse_args(argv)
    env = os.environ

    if args.cmd == "email-setup":
        import getpass

        path = email_setup(env, input, getpass.getpass)
        print(f"saved, encrypted, in {path}; restart the server: systemctl restart sotto-cloud")
        return 0
    if args.cmd == "email-test":
        mailer = load_mailer(data_dir(env) / "email.json", vault(env))
        if mailer is None:
            print("run email-setup first", file=sys.stderr)
            return 1
        import asyncio

        asyncio.run(
            mailer.send(
                EmailMessage(to=args.to, subject="Sotto test email", text="Manager emails work."),
                idempotency_key=f"test-{secrets.token_hex(6)}",
            )
        )
        print(f"sent to {args.to}")
        return 0
    if args.cmd == "backup":
        print(f"backup written: {backup(env)}")
        return 0
    if args.cmd == "add-examples":
        store = open_store(env)
        company_id = store.company_by_name(args.company)
        if company_id is None:
            print(f"no single company named {args.company!r}", file=sys.stderr)
            return 1
        n = store.add_examples(company_id, Seed.load().examples)
        print(f"{n} example answers added to {args.company}")
        return 0
    if args.cmd == "create-owner":
        store = open_store(env)
        if store.owner_exists():
            print("an owner account already exists", file=sys.stderr)
            return 1
        password = new_temporary_password()
        store.create_owner(args.email, args.name, password)
        args.password_file.write_text(f"email: {args.email}\npassword: {password}\n")
        args.password_file.chmod(0o600)
        print(f"owner created; one-time password written to {args.password_file}")
        return 0

    origin = env.get("SOTTO_PUBLIC_ORIGIN")
    if args.host not in ("127.0.0.1", "localhost") and not (origin or "").startswith("https://"):
        print("SOTTO_PUBLIC_ORIGIN (https://…) is required off localhost", file=sys.stderr)
        return 2
    store = open_store(env)
    static = args.static if args.static.exists() else None
    config = CloudConfig(
        public_origin=origin,
        owner_origin=env.get("SOTTO_OWNER_ORIGIN") or None,
        static_dir=static,
        secure_cookies=bool(origin and origin.startswith("https://")),
        log=lambda s: print(s, flush=True),
        recordings=Recordings(data_dir(env) / "recordings"),
        mailer=load_mailer(data_dir(env) / "email.json", Vault(secret(env, data_dir(env)))),
    )
    app = create_cloud_app(config, store, Seed.load())
    import uvicorn

    print(f"Sotto cloud on http://{args.host}:{args.port}  (owner: /owner)", flush=True)
    uvicorn.run(
        app,
        host=args.host,
        port=args.port,
        log_level="warning",
        proxy_headers=True,
        forwarded_allow_ips=env.get("SOTTO_TRUSTED_PROXY", "127.0.0.1"),
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
