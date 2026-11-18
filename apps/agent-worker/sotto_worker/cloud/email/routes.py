"""HTTP routes for org email (D-032, D-036, D-039). Mounted by cloud/app.py.

/api/owner/smtp, /api/owner/smtp/test          platform mailbox (fallback; owner console)
/api/owner/companies/{id}/smtp                the org's own mailbox (vendor; org wins)
/api/owner/companies/{id}/users/{uid}/smtp    one user's mailbox (vendor; user wins)
/api/v1/company/smtp                          the org mailbox, read-only status (admin)
/api/v1/company/email/formats                   formats with static blocks (admin)
/api/v1/email/senders|formats|preview|send      the agent's post-call email

Round 2 (D-078): the client no longer configures mail — the vendor sets the org mailbox and
each user's mailbox from the company profile. A send uses the sender's own mailbox, else the
org's, else the platform's.

No response carries an SMTP username or password. A send needs `confirm: true` and an
idempotency key; a retried key never sends twice."""

from __future__ import annotations

import dataclasses
import re
from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.adapters.email.smtp import Outgoing, SmtpAccount, SmtpSendError, send_mail
from sotto_worker.cloud.email import attachments, data
from sotto_worker.cloud.email.render import Rendered, render
from sotto_worker.cloud.scheduler.plans import check_step_key
from sotto_worker.cloud.store import CloudError, CloudStore, Principal

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
Sender = Callable[[SmtpAccount, Outgoing], Awaitable[None]]
NO_STORE = {"Cache-Control": "no-store"}
IDEM = re.compile(r"^[A-Za-z0-9_.:-]{8,100}$")
MAX_RECIPIENTS = 10
MAX_BODY = 20_000


def make_routes(
    *,
    store: CloudStore,
    app_route: Wrap,
    owner_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    sender: Sender = send_mail,
    send_limit: Callable[[str], bool] = lambda _key: True,
    log: Callable[[str], None] = lambda _l: None,
) -> list[Route]:
    data.ensure(store)
    attachments.ensure(store)

    async def test_send(account: SmtpAccount | None, to: str) -> Response:
        if account is None:
            raise CloudError("invalid", "save the mailbox first")
        mail = Outgoing(
            to=(to,),
            cc=(),
            subject="AGN Sales Shield test email",
            text="This test email shows that your mailbox settings in AGN Sales Shield work.",
            message_id_seed="smtp-test",
        )
        try:
            await sender(account, mail)
        except SmtpSendError as e:
            return JSONResponse({"ok": False, "to": to, "error": str(e)}, headers=NO_STORE)
        return JSONResponse({"ok": True, "to": to}, headers=NO_STORE)

    # --- owner: platform mailbox -----------------------------------------------------------------
    async def o_get(_r: Request, _who: Principal) -> Response:
        return JSONResponse(data.status(store, None)["platform"], headers=NO_STORE)

    async def o_put(r: Request, who: Principal) -> Response:
        data.save_account(store, who, await body(r), platform=True, ip=ip_of(r))
        return JSONResponse(data.status(store, None)["platform"], headers=NO_STORE)

    async def o_delete(r: Request, who: Principal) -> Response:
        data.delete_account(store, who, platform=True, ip=ip_of(r))
        return JSONResponse(data.status(store, None)["platform"], headers=NO_STORE)

    async def o_test(_r: Request, who: Principal) -> Response:
        return await test_send(data.account(store, data.PLATFORM), who.email)

    # --- owner: the org's mailbox and one mailbox per user (round 2, D-078) ----------------------
    # The client no longer configures mail: the vendor sets the org mailbox and each user's
    # mailbox from the company profile. The org mailbox stays the fallback under a user's own.
    async def o_org_get(r: Request, _who: Principal) -> Response:
        return JSONResponse(data.status(store, r.path_params["id"]), headers=NO_STORE)

    async def o_org_put(r: Request, who: Principal) -> Response:
        cid = r.path_params["id"]
        data.save_account(store, who, await body(r), platform=False, company_id=cid, ip=ip_of(r))
        return JSONResponse(data.status(store, cid), headers=NO_STORE)

    async def o_org_delete(r: Request, who: Principal) -> Response:
        cid = r.path_params["id"]
        data.delete_account(store, who, platform=False, company_id=cid, ip=ip_of(r))
        return JSONResponse(data.status(store, cid), headers=NO_STORE)

    async def o_org_test(r: Request, who: Principal) -> Response:
        return await test_send(data.account(store, r.path_params["id"]), who.email)

    async def o_user_get(r: Request, _who: Principal) -> Response:
        cid, uid = r.path_params["id"], r.path_params["uid"]
        return JSONResponse(data.status(store, cid, uid)["user"], headers=NO_STORE)

    async def o_user_put(r: Request, who: Principal) -> Response:
        cid, uid = r.path_params["id"], r.path_params["uid"]
        data.save_user_account(store, who, cid, uid, await body(r), ip=ip_of(r))
        return JSONResponse(data.status(store, cid, uid)["user"], headers=NO_STORE)

    async def o_user_delete(r: Request, who: Principal) -> Response:
        cid, uid = r.path_params["id"], r.path_params["uid"]
        data.delete_user_account(store, who, cid, uid, ip=ip_of(r))
        return JSONResponse(data.status(store, cid, uid)["user"], headers=NO_STORE)

    async def o_user_test(r: Request, who: Principal) -> Response:
        cid, uid = r.path_params["id"], r.path_params["uid"]
        return await test_send(data.user_account(store, cid, uid), who.email)

    # --- admin: the org's mailbox and formats ----------------------------------------------------
    @app_route
    async def org_get(_r: Request, who: Principal) -> Response:
        who.require("admin")
        return JSONResponse(data.status(store, who.company), headers=NO_STORE)

    @app_route
    async def formats_put(r: Request, who: Principal) -> Response:
        who.require("admin")
        saved = data.save_formats(store, who, (await body(r)).get("formats"), ip=ip_of(r))
        return JSONResponse({"formats": saved})

    # --- the agent's email -----------------------------------------------------------------------
    @app_route
    async def senders_get(_r: Request, who: Principal) -> Response:
        store.require_feature(who, "email_send")
        return JSONResponse(
            {"senders": data.senders(store, who.company, who.user_id)}, headers=NO_STORE
        )

    @app_route
    async def formats_get(_r: Request, who: Principal) -> Response:
        if who.role != "admin":
            store.require_feature(who, "email_send")
        return JSONResponse({"formats": data.formats(store, who.company)})

    def compose(
        who: Principal, d: dict[str, Any]
    ) -> tuple[dict[str, Any], Rendered, Outgoing, list[dict[str, Any]]]:
        """Validates a draft and renders it; shared by preview and send so they cannot differ."""
        store.require_feature(who, "email_send")
        choices = {s["id"]: s for s in data.senders(store, who.company, who.user_id)}
        chosen = choices.get(str(d.get("sender", "")))
        if chosen is None:
            raise CloudError("invalid", "pick one of the approved senders")
        fmt = next(
            (f for f in data.formats(store, who.company) if f["id"] == d.get("format")), None
        )
        if fmt is None:
            raise CloudError("invalid", "pick an email format")

        def addresses(value: Any, what: str) -> tuple[str, ...]:
            items = value if isinstance(value, list) else []
            return tuple(dict.fromkeys(data.clean_address(a, what) for a in items))

        to = addresses(d.get("to"), "To")
        cc = tuple(a for a in addresses(d.get("cc"), "CC") if a not in to)
        if not to:
            raise CloudError("invalid", "add at least one To address")
        if len(to) + len(cc) > MAX_RECIPIENTS:
            raise CloudError("invalid", f"at most {MAX_RECIPIENTS} recipients")
        text = str(d.get("body") or "").replace("\r\n", "\n")
        if not text.strip():
            raise CloudError("invalid", "the email body is empty")
        if len(text) > MAX_BODY:
            raise CloudError("invalid", "the email body is too long")
        subject = data._one_line(d.get("subject"), "subject", 200)
        values = {
            "agent.name": who.name,
            "agent.email": who.email,
            "company.name": data.company_name(store, who.company),
            "customer.name": data._one_line(
                d.get("customer_name"), "customer name", 100, required=False
            ),
        }
        out = render(fmt, subject=subject, body=text, values=values)
        files = d.get("attachments") or []
        if files:  # INT-14b: only the admin's list for this company
            store.require_feature(who, "email_attachments")
        mail = Outgoing(
            to=to,
            cc=cc,
            subject=out.subject,
            text=out.text,
            html=out.html,
            message_id_seed="",
        )
        # Names and sizes only here (preview); the bytes are read at send (security review).
        listed = attachments.describe(store, who.company, files)
        return chosen, out, mail, listed

    def preview_out(
        chosen: dict[str, Any], out: Rendered, mail: Outgoing, listed: list[dict[str, Any]]
    ) -> dict[str, Any]:
        return {
            "from": {"name": chosen["from_name"], "address": chosen["from_address"]},
            "to": list(mail.to),
            "cc": list(mail.cc),
            "subject": out.subject,
            "text": out.text,
            "html": out.html,
            "attachments": [{"name": a["name"], "size": a["size"]} for a in listed],
        }

    @app_route
    async def preview(r: Request, who: Principal) -> Response:
        chosen, out, mail, listed = compose(who, await body(r))
        return JSONResponse(preview_out(chosen, out, mail, listed), headers=NO_STORE)

    @app_route
    async def send(r: Request, who: Principal) -> Response:
        d = await body(r)
        chosen, out, mail, listed = compose(who, d)
        if d.get("confirm") is not True:
            raise CloudError("confirm", "confirm the preview before sending")
        idem = str(d.get("idempotency_key", ""))
        if not IDEM.match(idem):
            raise CloudError("invalid", "missing idempotency key")
        check_step_key(store, who, idem)
        state = data.claim_send(store, who, idem)
        if state == "sent":
            return JSONResponse({"status": "sent", "duplicate": True}, headers=NO_STORE)
        if state == "sending":
            raise CloudError("in_progress", "this email is being sent")
        if not send_limit(f"send:{who.company}:{who.user_id}"):
            data.finish_send(store, who, idem, ok=False, detail="rate limited", ip=ip_of(r))
            raise CloudError("rate_limited", "too many emails; wait a minute")
        scope = data.active_scope(store, who.company, who.user_id)
        account = data.account(store, scope) if scope else None
        if account is None:
            data.finish_send(store, who, idem, ok=False, detail="no mailbox", ip=ip_of(r))
            raise CloudError("invalid", "no approved sender is set up")
        mail = dataclasses.replace(
            mail,
            message_id_seed=idem,
            attachments=tuple(attachments.pick(store, who.company, [a["id"] for a in listed])),
        )
        recipients = f"to {', '.join(mail.to)}" + (f" cc {', '.join(mail.cc)}" if mail.cc else "")
        if mail.attachments:
            recipients += f" · {len(mail.attachments)} attached"
        try:
            await sender(account, mail)
        except SmtpSendError as e:
            data.finish_send(store, who, idem, ok=False, detail=f"{recipients}: {e}", ip=ip_of(r))
            log(f"email: send failed for company {who.company}: {e}")
            raise CloudError("email_failed", str(e)) from None
        data.finish_send(
            store,
            who,
            idem,
            ok=True,
            detail=f"{recipients} · {out.subject} · from {chosen['from_address']}",
            ip=ip_of(r),
        )
        return JSONResponse(
            {"status": "sent", "duplicate": False, **preview_out(chosen, out, mail, listed)},
            headers=NO_STORE,
        )

    api = "/api/v1"
    return [
        *attachments.make_routes(store=store, app_route=app_route, ip_of=ip_of),
        Route("/api/owner/smtp", owner_route(o_get)),
        Route("/api/owner/smtp", owner_route(o_put, mutating=True), methods=["PUT"]),
        Route("/api/owner/smtp", owner_route(o_delete, mutating=True), methods=["DELETE"]),
        Route("/api/owner/smtp/test", owner_route(o_test, mutating=True), methods=["POST"]),
        Route("/api/owner/companies/{id}/smtp", owner_route(o_org_get)),
        Route(
            "/api/owner/companies/{id}/smtp",
            owner_route(o_org_put, mutating=True),
            methods=["PUT"],
        ),
        Route(
            "/api/owner/companies/{id}/smtp",
            owner_route(o_org_delete, mutating=True),
            methods=["DELETE"],
        ),
        Route(
            "/api/owner/companies/{id}/smtp/test",
            owner_route(o_org_test, mutating=True),
            methods=["POST"],
        ),
        Route("/api/owner/companies/{id}/users/{uid}/smtp", owner_route(o_user_get)),
        Route(
            "/api/owner/companies/{id}/users/{uid}/smtp",
            owner_route(o_user_put, mutating=True),
            methods=["PUT"],
        ),
        Route(
            "/api/owner/companies/{id}/users/{uid}/smtp",
            owner_route(o_user_delete, mutating=True),
            methods=["DELETE"],
        ),
        Route(
            "/api/owner/companies/{id}/users/{uid}/smtp/test",
            owner_route(o_user_test, mutating=True),
            methods=["POST"],
        ),
        Route(f"{api}/company/smtp", org_get),
        Route(f"{api}/company/email/formats", formats_put, methods=["PUT"]),
        Route(f"{api}/email/senders", senders_get),
        Route(f"{api}/email/formats", formats_get),
        Route(f"{api}/email/preview", preview, methods=["POST"]),
        Route(f"{api}/email/send", send, methods=["POST"]),
    ]
