"""Starlette HTTP routes for Agent 3: prep coach, game plan, voice review, queue, morning brief."""

from __future__ import annotations

from collections.abc import Awaitable, Callable
from typing import Any

from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from sotto_worker.adapters.coach.base import TTSAdapter
from sotto_worker.cloud.coach.api import render_game_plan
from sotto_worker.cloud.coach.engine import PrepCoachEngine, VoiceReviewEngine
from sotto_worker.cloud.coach.morning_brief import (
    MeetingsFetcher,
    _local_dt,
    generate_morning_brief,
)
from sotto_worker.cloud.coach.store import CapAlertSender, CoachStore
from sotto_worker.cloud.store import CloudError, Principal
from sotto_worker.contracts import LLMAdapter

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}


def _req_str(data: dict[str, Any], key: str, *, required: bool = False, limit: int = 4000) -> str:
    if key not in data or data[key] is None:
        if required:
            raise CloudError("invalid", f"{key} is required")
        return ""
    val = data[key]
    if not isinstance(val, str):
        raise CloudError("invalid", f"{key} must be a string")
    clean = val.strip()
    if required and not clean:
        raise CloudError("invalid", f"{key} is required")
    return clean[:limit]


def _req_bool(data: dict[str, Any], key: str, default: bool = False) -> bool:
    if key not in data or data[key] is None:
        return default
    val = data[key]
    if not isinstance(val, bool):
        raise CloudError("invalid", f"{key} must be a boolean")
    return val


def _req_int(
    data: dict[str, Any], key: str, default: int | None = None, *, min_val: int = 0
) -> int | None:
    if key not in data or data[key] is None:
        return default
    val = data[key]
    if isinstance(val, bool) or not isinstance(val, int):
        raise CloudError("invalid", f"{key} must be an integer")
    if val < min_val:
        raise CloudError("invalid", f"{key} must be >= {min_val}")
    return val


def _req_str_list(data: dict[str, Any], key: str, *, limit: int = 10) -> list[str]:
    if key not in data or data[key] is None:
        return []
    val = data[key]
    if not isinstance(val, list) or not all(isinstance(x, str) for x in val):
        raise CloudError("invalid", f"{key} must be a list of strings")
    return [x.strip() for x in val[:limit] if x.strip()]


def make_routes(
    *,
    coach: CoachStore,
    app_route: Wrap,
    body: Callable[[Request], Awaitable[dict[str, Any]]],
    ip_of: Callable[[Request], str],
    llm_factory: Callable[[str], LLMAdapter],
    tts_factory: Callable[[str], TTSAdapter | None] | None = None,
    prompts: dict[str, dict[str, Any]] | None = None,
    fetch_meetings: MeetingsFetcher | None = None,
    send_email: CapAlertSender | None = None,
    owner_email: str | None = None,
    llm_limit: Callable[[str], bool] | None = None,
) -> list[Route]:
    api = "/api/v1/coach"
    prep_engine = PrepCoachEngine(coach, prompts=prompts)
    review_engine = VoiceReviewEngine(coach, prompts=prompts)

    def _require_company_user(who: Principal) -> None:
        if not who.company:
            raise CloudError("forbidden", "no company context")

    def _require_review_access(who: Principal) -> None:
        _require_company_user(who)
        if (
            coach.s.feature_state(who, "call_review").state != "available"
            and coach.s.feature_state(who, "voice_coach").state != "available"
        ):
            coach.s.require_feature(who, "voice_coach")

    @app_route
    async def prep_messages(request: Request, who: Principal) -> Response:
        _require_company_user(who)
        coach.s.require_feature(who, "prep_coach")
        call_id = request.path_params["call_id"]
        return JSONResponse({"messages": coach.list_prep_messages(who, call_id)}, headers=NO_STORE)

    @app_route
    async def prep_chat(request: Request, who: Principal) -> Response:
        _require_company_user(who)
        coach.s.require_feature(who, "prep_coach")
        call_id = request.path_params["call_id"]
        data = await body(request)
        msg = _req_str(data, "message", required=True, limit=2000)
        voice = _req_bool(data, "voice", False)
        if voice:
            coach.s.require_feature(who, "voice_coach")
        if llm_limit is not None and not llm_limit(who.user_id):
            raise CloudError("rate_limited", "too many prep coach requests; wait a moment")
        playbook_text = ""
        if coach.s.org_feature_on(who.company, "ai_knowledge"):
            entries = coach.s.playbook(who.company)[:8]
            playbook_text = "\n".join(
                str(e.get("answer") or e.get("title") or "").strip() for e in entries
            )[:3000]
        llm = llm_factory(who.company)
        tts = tts_factory(who.company) if (voice and tts_factory) else None
        out = await prep_engine.reply(
            who,
            call_id,
            msg,
            llm=llm,
            crm_brief=_req_str(data, "crm_brief", limit=4000),
            prep_notes=_req_str(data, "prep_notes", limit=2000),
            playbook=playbook_text,
            voice=voice,
            tts=tts,
            send_email=send_email,
            owner_email=owner_email,
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def game_plan_get(request: Request, who: Principal) -> Response:
        _require_company_user(who)
        coach.s.require_feature(who, "prep_coach")
        call_id = request.path_params["call_id"]
        plan = coach.get_game_plan_for_user(who, call_id)
        return JSONResponse({"game_plan": plan}, headers=NO_STORE)

    @app_route
    async def game_plan_generate(request: Request, who: Principal) -> Response:
        _require_company_user(who)
        coach.s.require_feature(who, "prep_coach")
        if llm_limit is not None and not llm_limit(who.user_id):
            raise CloudError("rate_limited", "too many game plan requests; wait a moment")
        call_id = request.path_params["call_id"]
        data = await body(request)
        plan = await prep_engine.generate_game_plan(
            who,
            call_id,
            llm=llm_factory(who.company),
            crm_brief=_req_str(data, "crm_brief", limit=4000),
            prep_notes=_req_str(data, "prep_notes", limit=2000),
        )
        return JSONResponse({"game_plan": plan}, headers=NO_STORE)

    @app_route
    async def game_plan_put(request: Request, who: Principal) -> Response:
        _require_company_user(who)
        coach.s.require_feature(who, "prep_coach")
        call_id = request.path_params["call_id"]
        data = await body(request)
        goals = _req_str_list(data, "goals")
        raw_obj = data.get("objections")
        if raw_obj is None:
            objections: list[dict[str, str]] = []
        elif not isinstance(raw_obj, list) or not all(isinstance(o, dict) for o in raw_obj):
            raise CloudError("invalid", "objections must be a list of objects")
        else:
            objections = [
                {
                    "objection": str(o.get("objection") or "").strip(),
                    "answer": str(o.get("answer") or "").strip(),
                }
                for o in raw_obj[:5]
                if isinstance(o.get("objection"), str)
            ]
        questions = _req_str_list(data, "questions")
        avoid = _req_str_list(data, "avoid")
        rendered = render_game_plan(
            goals=goals, objections=objections, questions=questions, avoid=avoid
        )
        plan = coach.save_game_plan(
            who,
            call_id,
            goals=goals,
            objections=objections,
            questions=questions,
            avoid=avoid,
            rendered_text=rendered,
        )
        return JSONResponse({"game_plan": plan}, headers=NO_STORE)

    @app_route
    async def reviews_list(request: Request, who: Principal) -> Response:
        _require_review_access(who)
        include_closed = request.query_params.get("all") == "1"
        items = coach.list_reviews(who, include_closed=include_closed)
        pending_count = sum(1 for i in items if i["status"] == "pending")
        return JSONResponse({"reviews": items, "pending_count": pending_count}, headers=NO_STORE)

    @app_route
    async def reviews_enqueue(request: Request, who: Principal) -> Response:
        _require_review_access(who)
        data = await body(request)
        call_id = _req_str(data, "call_id", required=True, limit=128)
        duration_s = _req_int(data, "call_duration_s", 0, min_val=0)
        if duration_s is None:
            raise CloudError("invalid", "call_duration_s is required")
        created = coach.enqueue_review(who, call_id, duration_s)
        return JSONResponse({"review": created}, headers=NO_STORE)

    @app_route
    async def review_snooze(request: Request, who: Principal) -> Response:
        _require_review_access(who)
        rid = request.path_params["review_id"]
        data = await body(request)
        preset = data.get("preset", "1h")
        if preset not in ("1h", "tomorrow_morning", "custom"):
            raise CloudError("invalid", "unknown snooze preset")
        until_ms = _req_int(data, "until_ms", None, min_val=1)
        tz_offset = _req_int(data, "timezone_offset_min", 0, min_val=-720)
        if tz_offset is None:
            raise CloudError("invalid", "timezone_offset_min is required")
        out = coach.snooze_review(
            who,
            rid,
            preset=preset,
            until_ms=until_ms,
            timezone_offset_min=tz_offset,
        )
        return JSONResponse({"review": out}, headers=NO_STORE)

    @app_route
    async def review_dismiss(request: Request, who: Principal) -> Response:
        _require_review_access(who)
        rid = request.path_params["review_id"]
        return JSONResponse(
            {"review": coach.transition_review(who, rid, "dismissed")}, headers=NO_STORE
        )

    @app_route
    async def review_cancel(request: Request, who: Principal) -> Response:
        _require_review_access(who)
        rid = request.path_params["review_id"]
        return JSONResponse(
            {"review": coach.transition_review(who, rid, "cancelled")}, headers=NO_STORE
        )

    @app_route
    async def review_complete(request: Request, who: Principal) -> Response:
        _require_review_access(who)
        rid = request.path_params["review_id"]
        data = await body(request)
        raw_tr = data.get("transcript")
        if raw_tr is None:
            transcript: list[dict[str, str]] = []
        elif not isinstance(raw_tr, list) or not all(isinstance(x, dict) for x in raw_tr):
            raise CloudError("invalid", "transcript must be a list of messages")
        else:
            transcript = raw_tr
        remember_raw = data.get("remember_note")
        if remember_raw is not None and not isinstance(remember_raw, str):
            raise CloudError("invalid", "remember_note must be a string")
        duration_s = _req_int(data, "duration_s", 0, min_val=0)
        if duration_s is None:
            raise CloudError("invalid", "duration_s is required")
        voice = _req_bool(data, "voice", False)
        if voice:
            coach.s.require_feature(who, "voice_coach")
        try:
            coach.get_review(who, rid)
        except CloudError as err:
            if err.code == "not_found" and not rid.startswith("rev_"):
                coach.s.require_own_call(who, rid)
                coach.enqueue_review(who, rid, max(30, duration_s))
            else:
                raise
        out = await review_engine.complete_review(
            who,
            rid,
            transcript=transcript,
            remember_note=remember_raw,
            duration_s=duration_s,
            voice=voice,
            send_email=send_email,
            owner_email=owner_email,
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def review_transcript(request: Request, who: Principal) -> Response:
        _require_review_access(who)
        rid = request.path_params["review_id"]
        return JSONResponse({"transcript": coach.get_review_transcript(who, rid)}, headers=NO_STORE)

    @app_route
    async def morning_brief_get(_request: Request, who: Principal) -> Response:
        _require_company_user(who)
        coach.s.require_feature(who, "morning_brief")
        prefs = coach.get_morning_brief_prefs(who)
        if not prefs["enabled"]:
            return JSONResponse({"brief": None, "prefs": prefs}, headers=NO_STORE)
        now_val = coach.clock()
        day_iso = _local_dt(now_val, int(prefs["timezone_offset_min"])).strftime("%Y-%m-%d")
        latest = coach.latest_morning_brief(who, day=day_iso)
        if latest is None:
            meetings: list[dict[str, Any]] = []
            if fetch_meetings is not None:
                try:
                    meetings = await fetch_meetings(who.company, who.user_id, day_iso)
                except Exception:
                    meetings = []
            llm = None
            try:
                llm = llm_factory(who.company)
            except Exception:
                llm = None
            latest = await generate_morning_brief(
                coach, who, meetings=meetings, prompts=prompts, llm=llm, now=now_val
            )
        return JSONResponse({"brief": latest, "prefs": prefs}, headers=NO_STORE)

    @app_route
    async def morning_brief_prefs_put(request: Request, who: Principal) -> Response:
        _require_company_user(who)
        coach.s.require_feature(who, "morning_brief")
        data = await body(request)
        enabled = _req_bool(data, "enabled", True)
        tz_offset = _req_int(data, "timezone_offset_min", None, min_val=-720)
        prefs = coach.set_morning_brief_prefs(
            who,
            enabled=enabled,
            timezone_offset_min=tz_offset,
        )
        return JSONResponse({"prefs": prefs}, headers=NO_STORE)

    @app_route
    async def settings_get(_request: Request, who: Principal) -> Response:
        _require_company_user(who)
        who.require("admin")
        return JSONResponse(coach.cap_status(who.company), headers=NO_STORE)

    @app_route
    async def settings_put(request: Request, who: Principal) -> Response:
        _require_company_user(who)
        if "allow_admin_transcript" not in (data := await body(request)):
            raise CloudError("invalid", "allow_admin_transcript is required")
        allow = _req_bool(data, "allow_admin_transcript", False)
        out = coach.set_admin_transcript_visibility(who, allow, ip=ip_of(request))
        return JSONResponse(out, headers=NO_STORE)

    return [
        Route(f"{api}/prep/{{call_id}}/messages", prep_messages, methods=["GET"]),
        Route(f"{api}/prep/{{call_id}}/chat", prep_chat, methods=["POST"]),
        Route(f"{api}/prep/{{call_id}}/game-plan", game_plan_get, methods=["GET"]),
        Route(f"{api}/prep/{{call_id}}/game-plan", game_plan_generate, methods=["POST"]),
        Route(f"{api}/prep/{{call_id}}/game-plan", game_plan_put, methods=["PUT"]),
        Route(f"{api}/reviews", reviews_list, methods=["GET"]),
        Route(f"{api}/reviews/enqueue", reviews_enqueue, methods=["POST"]),
        Route(f"{api}/reviews/{{review_id}}/snooze", review_snooze, methods=["POST"]),
        Route(f"{api}/reviews/{{review_id}}/dismiss", review_dismiss, methods=["POST"]),
        Route(f"{api}/reviews/{{review_id}}/cancel", review_cancel, methods=["POST"]),
        Route(f"{api}/reviews/{{review_id}}/complete", review_complete, methods=["POST"]),
        Route(f"{api}/reviews/{{review_id}}/transcript", review_transcript, methods=["GET"]),
        Route(f"{api}/morning-brief", morning_brief_get, methods=["GET"]),
        Route(f"{api}/morning-brief/prefs", morning_brief_prefs_put, methods=["PUT"]),
        Route(f"{api}/settings", settings_get, methods=["GET"]),
        Route(f"{api}/settings", settings_put, methods=["PUT"]),
    ]
