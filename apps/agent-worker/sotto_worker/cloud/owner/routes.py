"""Routes for the owner platform (T-079): providers and keys, model routing, health board,
prompt studio, BYO, Zoho clients, the sign-up queue and its Zoho Forms webhook; plus the app's
failure report (ZC-06) and the company prompt routes (BYO only)."""

from __future__ import annotations

import json
from collections.abc import Awaitable, Callable
from http import HTTPStatus
from typing import Any
from urllib.parse import parse_qs

import httpx
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.cloud.bootstrap import routes as bootstrap_routes
from sotto_worker.cloud.bootstrap.store import BootstrapStore
from sotto_worker.cloud.bundle import Seed
from sotto_worker.cloud.metering.store import Metering
from sotto_worker.cloud.owner import platform
from sotto_worker.cloud.owner.prompt_check import check_prompt
from sotto_worker.cloud.routing import job as routing_job
from sotto_worker.cloud.routing import store as routing_store
from sotto_worker.cloud.store import CloudError, CloudStore, Principal

Handler = Callable[[Request], Awaitable[Response]]
Inner = Callable[[Request, Principal], Awaitable[Response]]
NO_STORE = {"Cache-Control": "no-store"}
STT_TOKEN_VENDORS = ("assemblyai", "speechmatics")
SIGNUP_HEADER = "x-agn-signup-secret"
MAX_HOOK_BODY = 8 * 1024


def make_routes(
    *,
    store: CloudStore,
    seed: Seed,
    owner_route: Callable[..., Handler],
    app_route: Callable[[Inner], Handler],
    handle: Callable[[Handler], Handler],
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    ip_key: Callable[[Request], str],
    tester: Callable[[str, str, str], Awaitable[list[str]]],
    minter: Callable[[str, str], Awaitable[dict[str, Any]]],
    report_limit: Callable[[str], bool],
    signup_limit: Callable[[str], bool],
    bad_secret_limit: Callable[[str], bool],
    bad_secret_record: Callable[[str], None],
    send_invite: Callable[[str, str, str], Awaitable[None]],
    log: Callable[[str], None],
    zoho_call: bootstrap_routes.ZohoCall | None = None,
) -> list[Route]:
    catalog = seed.catalog
    metering = Metering(store, seed)
    bootstrap = BootstrapStore(store)
    vendor_ids = tuple(p.id for p in catalog.providers.values() if p.kind == "llm")

    # --- providers and keys ----------------------------------------------------------------------
    def providers_out() -> dict[str, Any]:
        keys = platform.platform_key_status(store)
        routes = platform.platform_routes(store)
        providers = [
            {
                "id": p.id,
                "name": p.name,
                "kind": p.kind,
                "key_env": p.key_env,
                "key_page": p.key_page,
                "steps": p.steps,
                "free": p.free,
                "models": list(p.models),
                "client": p.client,
                "key_set": p.key_env in keys,
                "updated_at": keys.get(p.key_env, {}).get("updated_at"),
                "test": keys.get(p.key_env, {}).get("test"),
                "retiring": keys.get(p.key_env, {}).get("retiring"),
            }
            for p in catalog.providers.values()
            if not p.custom
        ]
        stages = []
        for slot in catalog.stages.values():
            default = seed.routing.stages.get(slot.id)
            chosen = routes.get(slot.id)
            provider_id = (
                chosen[0] if chosen else (platform.vendor_of(catalog, default) if default else None)
            )
            model = chosen[1] if chosen else (default.model if default else None)
            stages.append(
                {
                    "id": slot.id,
                    "label": slot.label,
                    "kind": slot.kind,
                    "provider_id": provider_id,
                    "model": model,
                    "source": "platform" if chosen else "default",
                    "live": slot.id in platform.LIVE_STAGES,
                    "deadline_ms": default.first_token_ms if default else None,
                    "benchmark": platform.benchmark(store, provider_id, model, slot.id)
                    if provider_id and model
                    else None,
                    "history": platform.route_history(store, slot.id, limit=5),
                }
            )
        return {"providers": providers, "stages": stages}

    def provider_by_env(env: str) -> Any:
        found = next((p for p in catalog.providers.values() if p.key_env == env), None)
        if found is None:
            raise CloudError("not_found", "unknown key")
        return found

    async def o_providers(_r: Request, _who: Principal) -> Response:
        return JSONResponse(providers_out(), headers=NO_STORE)

    async def o_key_put(r: Request, who: Principal) -> Response:
        env = r.path_params["env"]
        provider_by_env(env)
        platform.set_key(store, who, env, str((await body(r)).get("value", "")), ip=ip_of(r))
        return JSONResponse(providers_out(), headers=NO_STORE)

    async def o_key_rotate(r: Request, who: Principal) -> Response:
        """ZC-12: the next key; apps switch on their next config refresh. Status only back."""
        env = r.path_params["env"]
        provider_by_env(env)
        out = platform.rotate_key(
            store, who, env, str((await body(r)).get("value", "")), ip=ip_of(r)
        )
        return JSONResponse({"rotation": out, **providers_out()}, headers=NO_STORE)

    # --- routing job (ZC-05) and spend (ZC-12) ----------------------------------------------------
    async def o_routing_job(_r: Request, _who: Principal) -> Response:
        return JSONResponse(routing_job.state(store), headers=NO_STORE)

    async def o_routing_job_put(r: Request, who: Principal) -> Response:
        routing_store.set_settings(store, who, await body(r), ip=ip_of(r))
        return JSONResponse(routing_job.state(store), headers=NO_STORE)

    async def o_spend(_r: Request, _who: Principal) -> Response:
        return JSONResponse(
            {"companies": metering.overview(), "checked": metering.table.checked},
            headers=NO_STORE,
        )

    async def o_spend_cap(r: Request, who: Principal) -> Response:
        cid = r.path_params["id"]
        metering.set_cap(who, cid, (await body(r)).get("cap_usd"), ip=ip_of(r))
        return JSONResponse(metering.state(cid), headers=NO_STORE)

    async def o_key_delete(r: Request, who: Principal) -> Response:
        platform.delete_key(store, who, r.path_params["env"], ip=ip_of(r))
        return JSONResponse(providers_out(), headers=NO_STORE)

    async def o_key_test(r: Request, _who: Principal) -> Response:
        env = r.path_params["env"]
        provider = provider_by_env(env)
        key = platform.platform_key(store, env)
        if not key:
            raise CloudError("no_key", "save the key first")
        ok, detail = True, ""
        try:
            if provider.kind == "stt":
                if provider.id in STT_TOKEN_VENDORS:
                    await minter(provider.id, key)
                    detail = "the vendor issued a streaming token"
                else:
                    detail = "saved (this vendor has no test address)"
            else:
                url = provider.models_url()
                if not url:
                    raise CloudError("invalid", "this vendor has no test address")
                detail = f"{len(await tester(provider.id, url, key))} models available"
        except httpx.HTTPStatusError as e:
            ok, detail = False, f"{provider.name} answered {e.response.status_code}"
        except httpx.HTTPError as e:
            ok, detail = False, f"{provider.name} unreachable ({type(e).__name__})"
        platform.record_key_test(store, env, ok, detail)
        return JSONResponse(
            {**providers_out(), "result": {"ok": ok, "detail": detail}}, headers=NO_STORE
        )

    # --- model routing ---------------------------------------------------------------------------
    async def o_route_put(r: Request, who: Principal) -> Response:
        data = await body(r)
        platform.set_route(
            store,
            seed,
            who,
            r.path_params["stage"],
            str(data.get("provider", "")),
            str(data.get("model", "")),
            ip=ip_of(r),
        )
        return JSONResponse(providers_out(), headers=NO_STORE)

    async def o_route_delete(r: Request, who: Principal) -> Response:
        platform.reset_route(store, who, r.path_params["stage"], ip=ip_of(r))
        return JSONResponse(providers_out(), headers=NO_STORE)

    async def o_route_rollback(r: Request, who: Principal) -> Response:
        platform.rollback_route(store, seed, who, r.path_params["stage"], ip=ip_of(r))
        return JSONResponse(providers_out(), headers=NO_STORE)

    # --- per-company model routes (round 2, D-078/D-079) -----------------------------------------
    async def o_company_routes(r: Request, _who: Principal) -> Response:
        return JSONResponse(
            platform.company_routes_out(store, seed, r.path_params["id"]), headers=NO_STORE
        )

    async def o_company_route_put(r: Request, who: Principal) -> Response:
        data = await body(r)
        platform.set_company_route(
            store,
            seed,
            who,
            r.path_params["id"],
            r.path_params["stage"],
            str(data.get("provider", "")),
            str(data.get("model", "")),
            ip=ip_of(r),
        )
        return JSONResponse(
            platform.company_routes_out(store, seed, r.path_params["id"]), headers=NO_STORE
        )

    async def o_company_route_delete(r: Request, who: Principal) -> Response:
        platform.reset_company_route(
            store, who, r.path_params["id"], r.path_params["stage"], ip=ip_of(r)
        )
        return JSONResponse(
            platform.company_routes_out(store, seed, r.path_params["id"]), headers=NO_STORE
        )

    # --- health board (ZC-06) --------------------------------------------------------------------
    async def o_health(_r: Request, _who: Principal) -> Response:
        return JSONResponse(platform.health(store, catalog), headers=NO_STORE)

    async def o_demote(r: Request, who: Principal) -> Response:
        minutes = (await body(r)).get("minutes", 30)
        platform.demote(store, who, r.path_params["id"], minutes, vendor_ids, ip=ip_of(r))
        return JSONResponse(platform.health(store, catalog), headers=NO_STORE)

    async def o_restore(r: Request, who: Principal) -> Response:
        platform.restore(store, who, r.path_params["id"], ip=ip_of(r))
        return JSONResponse(platform.health(store, catalog), headers=NO_STORE)

    @app_route
    async def failures_post(r: Request, who: Principal) -> Response:
        if not report_limit(who.user_id):
            raise CloudError("rate_limited", "too many reports; wait")
        demoted = platform.report_failures(store, who, (await body(r)).get("failures"), vendor_ids)
        return JSONResponse({"ok": True, "demoted": demoted}, headers=NO_STORE)

    # --- prompt studio ---------------------------------------------------------------------------
    def prompts_out(who: Principal, company_id: str | None = None) -> dict[str, Any]:
        versions = platform.prompt_versions(
            store, company_id=company_id if not who.is_owner else None, owner=who.is_owner
        )
        return {
            "prompts": [
                {
                    "key": key,
                    "stage": p["stage"],
                    "variables": list(p["variables"]),
                    "seed": {"version": int(p["version"]), "body": p["body"]},
                    "versions": [v for v in versions if v["key"] == key],
                }
                for key, p in sorted(seed.prompts.items())
            ]
        }

    async def o_prompts(_r: Request, who: Principal) -> Response:
        return JSONResponse(prompts_out(who), headers=NO_STORE)

    async def create(r: Request, who: Principal) -> dict[str, Any]:
        data = await body(r)
        return platform.create_version(
            store,
            seed,
            who,
            key=str(data.get("key", "")),
            body=data.get("body"),
            scope=str(data.get("scope", "platform" if who.is_owner else "company")),
            scope_id=str(data["scope_id"]) if data.get("scope_id") else None,
            company_id=str(data["company_id"]) if data.get("company_id") else None,
            note=data.get("note", ""),
            ip=ip_of(r),
        )

    async def run_test(who: Principal, version_id: str) -> dict[str, Any]:
        v = platform.get_version(store, who, version_id)
        result = await check_prompt(v["key"], v["body"], v["variables"], seed.prompts[v["key"]])
        platform.save_test(store, who, version_id, result)
        return platform.get_version(store, who, version_id)

    async def o_prompt_post(r: Request, who: Principal) -> Response:
        return JSONResponse(await create(r, who), status_code=HTTPStatus.CREATED)

    async def o_prompt_test(r: Request, who: Principal) -> Response:
        return JSONResponse(await run_test(who, r.path_params["id"]), headers=NO_STORE)

    async def o_prompt_publish(r: Request, who: Principal) -> Response:
        return JSONResponse(platform.publish_version(store, who, r.path_params["id"], ip=ip_of(r)))

    async def o_prompt_unpublish(r: Request, who: Principal) -> Response:
        return JSONResponse(platform.unpublish_slot(store, who, r.path_params["id"], ip=ip_of(r)))

    def byo_admin(who: Principal) -> None:
        who.require("admin")
        platform.require_byo(store, who)

    @app_route
    async def c_prompts(_r: Request, who: Principal) -> Response:
        byo_admin(who)
        return JSONResponse(prompts_out(who, who.company), headers=NO_STORE)

    @app_route
    async def c_prompt_post(r: Request, who: Principal) -> Response:
        byo_admin(who)
        return JSONResponse(await create(r, who), status_code=HTTPStatus.CREATED)

    @app_route
    async def c_prompt_test(r: Request, who: Principal) -> Response:
        byo_admin(who)
        return JSONResponse(await run_test(who, r.path_params["id"]), headers=NO_STORE)

    @app_route
    async def c_prompt_publish(r: Request, who: Principal) -> Response:
        byo_admin(who)
        return JSONResponse(platform.publish_version(store, who, r.path_params["id"], ip=ip_of(r)))

    @app_route
    async def c_prompt_unpublish(r: Request, who: Principal) -> Response:
        byo_admin(who)
        return JSONResponse(platform.unpublish_slot(store, who, r.path_params["id"], ip=ip_of(r)))

    # --- BYO entitlement -------------------------------------------------------------------------
    async def o_byo(r: Request, who: Principal) -> Response:
        cid = r.path_params["id"]
        platform.set_byo(store, who, cid, (await body(r)).get("enabled"), ip=ip_of(r))
        return JSONResponse({"enabled": platform.byo_on(store, cid)})

    async def o_byo_list(_r: Request, _who: Principal) -> Response:
        rows = store._q(
            "SELECT c.id, c.name, b.enabled_at FROM companies c"
            " LEFT JOIN company_byo b ON b.company_id = c.id ORDER BY c.name COLLATE NOCASE"
        )
        return JSONResponse(
            {
                "companies": [
                    {"id": r["id"], "name": r["name"], "byo": r["enabled_at"] is not None}
                    for r in rows
                ]
            },
            headers=NO_STORE,
        )

    # --- Zoho clients (ZC-01) --------------------------------------------------------------------
    async def o_zoho(_r: Request, _who: Principal) -> Response:
        return JSONResponse(platform.zoho_status(store), headers=NO_STORE)

    async def o_zoho_dc_put(r: Request, who: Principal) -> Response:
        data = await body(r)
        platform.set_dc_client(
            store,
            who,
            r.path_params["dc"],
            str(data.get("client_id", "")),
            str(data.get("client_secret", "")),
            ip=ip_of(r),
        )
        return JSONResponse(platform.zoho_status(store), headers=NO_STORE)

    async def o_zoho_dc_delete(r: Request, who: Principal) -> Response:
        platform.delete_dc_client(store, who, r.path_params["dc"], ip=ip_of(r))
        return JSONResponse(platform.zoho_status(store), headers=NO_STORE)

    async def o_zoho_override_put(r: Request, who: Principal) -> Response:
        data = await body(r)
        store.owner_set_org_zoho_client(
            who,
            r.path_params["id"],
            str(data.get("client_id", "")),
            str(data.get("client_secret", "")),
            str(data.get("dc", "us")),
            ip=ip_of(r),
        )
        return JSONResponse(platform.zoho_status(store), headers=NO_STORE)

    async def o_zoho_override_delete(r: Request, who: Principal) -> Response:
        store.owner_delete_org_zoho_client(who, r.path_params["id"], ip=ip_of(r))
        return JSONResponse(platform.zoho_status(store), headers=NO_STORE)

    # --- sign-up queue and webhook (ZC-10) -------------------------------------------------------
    async def o_signups(_r: Request, _who: Principal) -> Response:
        return JSONResponse(
            {
                "signups": platform.signups(store),
                "secret_set_at": platform.signup_secret_set(store),
            },
            headers=NO_STORE,
        )

    async def o_signup_approve(r: Request, who: Principal) -> Response:
        platform.approve_signup(store, who, r.path_params["id"], ip=ip_of(r))
        return JSONResponse({"signups": platform.signups(store)}, headers=NO_STORE)

    async def o_signup_secret(r: Request, who: Principal) -> Response:
        secret = platform.rotate_signup_secret(store, who, ip=ip_of(r))
        return JSONResponse({"secret": secret, "header": "X-AGN-Signup-Secret"}, headers=NO_STORE)

    async def hook_fields(r: Request) -> dict[str, str]:
        declared = r.headers.get("content-length")
        if declared is not None and (not declared.isdigit() or int(declared) > MAX_HOOK_BODY):
            raise CloudError("too_large", "request too large")
        raw = b""
        async for chunk in r.stream():
            raw += chunk
            if len(raw) > MAX_HOOK_BODY:
                raise CloudError("too_large", "request too large")
        kind = r.headers.get("content-type", "")
        if kind.startswith("application/json"):
            try:
                data = json.loads(raw or b"{}")
            except json.JSONDecodeError:
                raise CloudError("invalid", "send a JSON object") from None
            if not isinstance(data, dict):
                raise CloudError("invalid", "send a JSON object")
            return {str(k).lower(): str(v) for k, v in data.items() if isinstance(v, str | int)}
        if kind.startswith("application/x-www-form-urlencoded"):
            parsed = parse_qs(raw.decode("utf-8", "replace"), max_num_fields=30)
            return {k.lower(): v[0] for k, v in parsed.items() if v}
        raise CloudError("invalid", "send JSON or a form")

    @handle
    async def signup_hook(r: Request) -> Response:
        """Zoho Forms → webhook (POST, a custom header with the shared secret). Answers 200 for a
        duplicate address too, so Zoho does not mark the entry failed; nothing new is created."""
        # The secret first: requests without it must not use up the budget real sign-ups need
        # (security review L); wrong secrets are limited per client on their own.
        if bad_secret_limit(ip_key(r)):
            raise CloudError("rate_limited", "too many tries; wait")
        if not platform.signup_secret_ok(store, r.headers.get(SIGNUP_HEADER)):
            bad_secret_record(ip_key(r))
            return JSONResponse(
                {"error": "wrong secret", "code": "signed_out"}, status_code=HTTPStatus.UNAUTHORIZED
            )
        if not signup_limit(ip_key(r)):
            raise CloudError("rate_limited", "too many sign-ups; wait")
        fields = await hook_fields(r)
        made = platform.signup(
            store,
            seed,
            company=fields.get("company", ""),
            name=fields.get("name", ""),
            email=fields.get("email", ""),
            phone=fields.get("phone", ""),
            ip=ip_of(r),
        )
        if made is None:
            return JSONResponse({"ok": True, "created": False})
        company_id, user_id = made
        token = platform.invite_token(store, company_id, user_id)
        try:
            await send_invite(
                fields.get("email", "").strip().lower(), fields.get("name", ""), token
            )
        except Exception as err:  # the owner can resend from the queue (reset)
            log(f"signup invite email failed: {type(err).__name__}")
        return JSONResponse({"ok": True, "created": True}, status_code=HTTPStatus.CREATED)

    def o(path: str, fn: Inner, method: str = "GET") -> Route:
        return Route(
            f"/api/owner/{path}", owner_route(fn, mutating=method != "GET"), methods=[method]
        )

    api = "/api/v1"
    return [
        o("providers", o_providers),
        o("keys/{env}", o_key_put, "PUT"),
        o("keys/{env}", o_key_delete, "DELETE"),
        o("keys/{env}/test", o_key_test, "POST"),
        o("keys/{env}/rotate", o_key_rotate, "POST"),
        o("routing-job", o_routing_job),
        o("routing-job", o_routing_job_put, "PUT"),
        o("spend", o_spend),
        o("companies/{id}/spend-cap", o_spend_cap, "PUT"),
        o("routes/{stage}", o_route_put, "PUT"),
        o("routes/{stage}", o_route_delete, "DELETE"),
        o("routes/{stage}/rollback", o_route_rollback, "POST"),
        o("companies/{id}/routes", o_company_routes),
        o("companies/{id}/routes/{stage}", o_company_route_put, "PUT"),
        o("companies/{id}/routes/{stage}", o_company_route_delete, "DELETE"),
        o("health", o_health),
        o("health/{id}/demote", o_demote, "POST"),
        o("health/{id}/demote", o_restore, "DELETE"),
        o("prompts", o_prompts),
        o("prompts", o_prompt_post, "POST"),
        o("prompts/{id}/test", o_prompt_test, "POST"),
        o("prompts/{id}/publish", o_prompt_publish, "POST"),
        o("prompts/{id}/unpublish", o_prompt_unpublish, "POST"),
        o("byo", o_byo_list),
        o("companies/{id}/byo", o_byo, "PUT"),
        o("zoho/clients", o_zoho),
        o("zoho/clients/{dc}", o_zoho_dc_put, "PUT"),
        o("zoho/clients/{dc}", o_zoho_dc_delete, "DELETE"),
        o("companies/{id}/zoho-client", o_zoho_override_put, "PUT"),
        o("companies/{id}/zoho-client", o_zoho_override_delete, "DELETE"),
        o("signups", o_signups),
        o("signups/secret", o_signup_secret, "POST"),
        o("signups/{id}/approve", o_signup_approve, "POST"),
        Route(f"{api}/provider-health", failures_post, methods=["POST"]),
        Route(f"{api}/company/prompts", c_prompts),
        Route(f"{api}/company/prompts", c_prompt_post, methods=["POST"]),
        Route(f"{api}/company/prompts/{{id}}/test", c_prompt_test, methods=["POST"]),
        Route(f"{api}/company/prompts/{{id}}/publish", c_prompt_publish, methods=["POST"]),
        Route(f"{api}/company/prompts/{{id}}/unpublish", c_prompt_unpublish, methods=["POST"]),
        Route("/hooks/zoho-forms/signup", signup_hook, methods=["POST"]),
        # ZC-04: the Zoho source reads through cloud/zoho/routes.py `zoho_call` (app.py passes it).
        *bootstrap_routes.make_routes(
            bootstrap=bootstrap, app_route=app_route, body=body, ip_of=ip_of, zoho_call=zoho_call
        ),
    ]
