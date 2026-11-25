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
from sotto_worker.cloud.coach.morning_brief import MeetingsFetcher, generate_morning_brief
from sotto_worker.cloud.coach.store import CapAlertSender, CoachStore
from sotto_worker.cloud.store import CloudError, Principal
from sotto_worker.contracts import LLMAdapter

Wrap = Callable[..., Callable[[Request], Awaitable[Response]]]
NO_STORE = {"Cache-Control": "no-store"}


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
) -> list[Route]:
    api = "/api/v1/coach"
    prep_engine = PrepCoachEngine(coach, prompts=prompts)
    review_engine = VoiceReviewEngine(coach, prompts=prompts)

    @app_route
    async def prep_messages(request: Request, who: Principal) -> Response:
        call_id = request.path_params["call_id"]
        return JSONResponse(
            {"messages": coach.list_prep_messages(who, call_id)}, headers=NO_STORE
        )

    @app_route
    async def prep_chat(request: Request, who: Principal) -> Response:
        call_id = request.path_params["call_id"]
        data = await body(request)
        msg = str(data.get("message") or "").strip()
        voice = bool(data.get("voice", False))
        llm = llm_factory(who.company)
        tts = tts_factory(who.company) if (voice and tts_factory) else None
        out = await prep_engine.reply(
            who,
            call_id,
            msg,
            llm=llm,
            crm_brief=str(data.get("crm_brief") or ""),
            prep_notes=str(data.get("prep_notes") or ""),
            playbook=str(data.get("playbook") or ""),
            voice=voice,
            tts=tts,
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def game_plan_get(request: Request, who: Principal) -> Response:
        call_id = request.path_params["call_id"]
        plan = coach.get_game_plan_for_user(who, call_id)
        return JSONResponse({"game_plan": plan}, headers=NO_STORE)

    @app_route
    async def game_plan_generate(request: Request, who: Principal) -> Response:
        call_id = request.path_params["call_id"]
        data = await body(request)
        plan = await prep_engine.generate_game_plan(
            who,
            call_id,
            llm=llm_factory(who.company),
            crm_brief=str(data.get("crm_brief") or ""),
            prep_notes=str(data.get("prep_notes") or ""),
        )
        return JSONResponse({"game_plan": plan}, headers=NO_STORE)

    @app_route
    async def game_plan_put(request: Request, who: Principal) -> Response:
        call_id = request.path_params["call_id"]
        data = await body(request)
        goals = list(data.get("goals") or [])
        objections = list(data.get("objections") or [])
        questions = list(data.get("questions") or [])
        avoid = list(data.get("avoid") or [])
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
        include_closed = request.query_params.get("all") == "1"
        items = coach.list_reviews(who, include_closed=include_closed)
        pending_count = sum(1 for i in items if i["status"] == "pending")
        return JSONResponse(
            {"reviews": items, "pending_count": pending_count}, headers=NO_STORE
        )

    @app_route
    async def reviews_enqueue(request: Request, who: Principal) -> Response:
        data = await body(request)
        call_id = str(data.get("call_id") or "")
        duration_s = int(data.get("call_duration_s") or 0)
        created = coach.enqueue_review(who, call_id, duration_s)
        return JSONResponse({"review": created}, headers=NO_STORE)

    @app_route
    async def review_snooze(request: Request, who: Principal) -> Response:
        rid = request.path_params["review_id"]
        data = await body(request)
        preset = data.get("preset", "1h")
        if preset not in ("1h", "tomorrow_morning", "custom"):
            raise CloudError("invalid", "unknown snooze preset")
        out = coach.snooze_review(
            who,
            rid,
            preset=preset,
            until_ms=data.get("until_ms"),
            timezone_offset_min=int(data.get("timezone_offset_min") or 0),
        )
        return JSONResponse({"review": out}, headers=NO_STORE)

    @app_route
    async def review_dismiss(request: Request, who: Principal) -> Response:
        rid = request.path_params["review_id"]
        return JSONResponse(
            {"review": coach.transition_review(who, rid, "dismissed")}, headers=NO_STORE
        )

    @app_route
    async def review_cancel(request: Request, who: Principal) -> Response:
        rid = request.path_params["review_id"]
        return JSONResponse(
            {"review": coach.transition_review(who, rid, "cancelled")}, headers=NO_STORE
        )

    @app_route
    async def review_complete(request: Request, who: Principal) -> Response:
        rid = request.path_params["review_id"]
        data = await body(request)
        out = await review_engine.complete_review(
            who,
            rid,
            transcript=list(data.get("transcript") or []),
            remember_note=data.get("remember_note"),
            duration_s=int(data.get("duration_s") or 0),
            voice=bool(data.get("voice", False)),
            send_email=send_email,
            owner_email=owner_email,
        )
        return JSONResponse(out, headers=NO_STORE)

    @app_route
    async def review_transcript(request: Request, who: Principal) -> Response:
        rid = request.path_params["review_id"]
        return JSONResponse(
            {"transcript": coach.get_review_transcript(who, rid)}, headers=NO_STORE
        )

    @app_route
    async def morning_brief_get(_request: Request, who: Principal) -> Response:
        latest = coach.latest_morning_brief(who)
        if latest is None:
            meetings: list[dict[str, Any]] = []
            if fetch_meetings is not None:
                meetings = await fetch_meetings(who.company, who.user_id, "")
            latest = await generate_morning_brief(
                coach, who, meetings=meetings, prompts=prompts
            )
        return JSONResponse(
            {"brief": latest, "prefs": coach.get_morning_brief_prefs(who)}, headers=NO_STORE
        )

    @app_route
    async def morning_brief_prefs_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        prefs = coach.set_morning_brief_prefs(
            who,
            enabled=bool(data.get("enabled", True)),
            timezone_offset_min=data.get("timezone_offset_min"),
        )
        return JSONResponse({"prefs": prefs}, headers=NO_STORE)

    @app_route
    async def settings_get(_request: Request, who: Principal) -> Response:
        return JSONResponse(coach.cap_status(who.company), headers=NO_STORE)

    @app_route
    async def settings_put(request: Request, who: Principal) -> Response:
        data = await body(request)
        out = coach.set_admin_transcript_visibility(
            who, bool(data.get("allow_admin_transcript", False)), ip=ip_of(request)
        )
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
