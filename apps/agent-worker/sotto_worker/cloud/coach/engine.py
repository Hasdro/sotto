"""Prep coach and post-call voice review engines (B2, V1, V4).

Prompt text is always loaded from the prompt registry / `seed/prompts/` (R6, never hard-coded).
Model calls go through the LLMAdapter / TTSAdapter protocols (R6).
"""

from __future__ import annotations

import json
import re
from collections.abc import AsyncIterator, Callable
from pathlib import Path
from typing import Any

from sotto_worker.adapters.coach.base import AudioChunk, TTSAdapter, TTSOptions
from sotto_worker.cloud.coach.api import render_game_plan
from sotto_worker.cloud.coach.store import CapAlertSender, CoachStore
from sotto_worker.cloud.memory.api import add_feedback
from sotto_worker.cloud.obs.log import log_event
from sotto_worker.cloud.store import CloudError, Principal
from sotto_worker.contracts import LLMAdapter, LLMRequest, Message

MAX_REVIEW_SECONDS = 180  # V4: <= 3 minutes
TURN_MARKER = "---turn---"
DEFAULT_PROMPTS_DIR = Path(__file__).resolve().parents[5] / "seed" / "prompts"


def load_prompt_body(key: str, *, prompts: dict[str, dict[str, Any]] | None = None) -> str:
    """Load prompt body from the active registry dict, falling back to seed/prompts/<key>.md."""
    if prompts and key in prompts:
        body = str((prompts[key] or {}).get("body") or "").strip()
        if body:
            return body
    path = DEFAULT_PROMPTS_DIR / f"{key}.md"
    raw = path.read_text(encoding="utf-8")
    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) == 3:
            return parts[2].strip()
    return raw.strip()


def render_template(template: str, values: dict[str, str]) -> str:
    return re.sub(r"\{\{\s*([\w.]+)\s*\}\}", lambda m: values.get(m.group(1), ""), template).strip()


def _split_turn_prompt(rendered: str) -> tuple[str, str]:
    if TURN_MARKER in rendered:
        system, _, turn_part = rendered.partition(TURN_MARKER)
        return system.strip(), turn_part.strip()
    return rendered.strip(), ""


def _safe_var(val: str, limit: int = 4000) -> str:
    return val.replace(TURN_MARKER, " ").strip()[:limit]


async def _collect_llm(llm: LLMAdapter, req: LLMRequest) -> str:
    chunks: list[str] = []
    async for chunk in llm.stream(req):
        chunks.append(chunk.text)
    return "".join(chunks).strip()


class PrepCoachEngine:
    """Pre-call brainstorming coach (text always; voice when voice_coach is enabled + under cap)."""

    def __init__(
        self,
        store: CoachStore,
        *,
        prompts: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self.store = store
        self.prompts = prompts

    async def reply(
        self,
        who: Principal,
        call_id: str,
        user_message: str,
        *,
        llm: LLMAdapter,
        crm_brief: str = "",
        prep_notes: str = "",
        playbook: str = "",
        voice: bool = False,
        tts: TTSAdapter | None = None,
        send_email: CapAlertSender | None = None,
        owner_email: str | None = None,
        now: int | None = None,
    ) -> dict[str, Any]:
        if voice:
            self.store.check_voice_cap(who.company, now=now)
        self.store.add_prep_message(who, call_id, "user", user_message, now=now)
        history = self.store.list_prep_messages(who, call_id)
        rendered = render_template(
            load_prompt_body("coach_prep", prompts=self.prompts),
            {
                "crm.brief": _safe_var(crm_brief),
                "prep.notes": _safe_var(prep_notes),
                "company.playbook": _safe_var(playbook),
            },
        )
        system, turn_context = _split_turn_prompt(rendered)
        messages: list[Message] = []
        if turn_context:
            messages.append(Message(role="user", content=turn_context))
        messages.extend(
            Message(role="user" if m["role"] == "user" else "assistant", content=m["content"])
            for m in history[-12:]
        )
        answer = await _collect_llm(
            llm,
            LLMRequest(system=system, messages=messages, max_tokens=260, temperature=0.4),
        )
        saved = self.store.add_prep_message(who, call_id, "assistant", answer, now=now)
        audio_bytes = 0
        if voice and tts is not None and answer:
            async for chunk in tts.synthesize(answer, TTSOptions()):
                audio_bytes += len(chunk.data)
            if audio_bytes > 0:
                est_s = max(1, round(len(answer.split()) / 2.5))
                await self.store.record_voice_usage(
                    who.company,
                    who.user_id,
                    "prep_voice",
                    est_s,
                    call_id=call_id,
                    send_email=send_email,
                    owner_email=owner_email,
                    now=now,
                )
        log_event("coach_prep", "reply", call_id=call_id, voice=voice, audio_bytes=audio_bytes)
        return {"message": saved, "voice": voice, "audio_bytes": audio_bytes}

    async def generate_game_plan(
        self,
        who: Principal,
        call_id: str,
        *,
        llm: LLMAdapter,
        crm_brief: str = "",
        prep_notes: str = "",
        now: int | None = None,
    ) -> dict[str, Any]:
        history = self.store.list_prep_messages(who, call_id)
        chat_lines = "\n".join(f"{m['role']}: {m['content']}" for m in history[-16:])
        rendered_prompt = render_template(
            load_prompt_body("game_plan", prompts=self.prompts),
            {
                "crm.brief": _safe_var(crm_brief),
                "prep.notes": _safe_var(prep_notes),
                "prep.chat": _safe_var(chat_lines),
            },
        )
        system, user_part = _split_turn_prompt(rendered_prompt)
        raw = await _collect_llm(
            llm,
            LLMRequest(
                system=system,
                messages=[
                    Message(role="user", content=user_part or "Generate the game plan JSON.")
                ],
                max_tokens=420,
                temperature=0.3,
            ),
        )
        parsed = _parse_game_plan_json(raw)
        rendered = render_game_plan(
            goals=parsed["goals"],
            objections=parsed["objections"],
            questions=parsed["questions"],
            avoid=parsed["avoid"],
        )
        return self.store.save_game_plan(
            who,
            call_id,
            goals=parsed["goals"],
            objections=parsed["objections"],
            questions=parsed["questions"],
            avoid=parsed["avoid"],
            rendered_text=rendered,
            now=now,
        )


def _parse_game_plan_json(raw: str) -> dict[str, Any]:
    text = raw.strip()
    if "{" in text and "}" in text:
        snippet = text[text.find("{") : text.rfind("}") + 1]
        try:
            data = json.loads(snippet)
            if isinstance(data, dict):
                return {
                    "goals": [str(x) for x in (data.get("goals") or [])][:3],
                    "objections": [
                        {
                            "objection": str(o.get("objection", "")),
                            "answer": str(o.get("answer", "")),
                        }
                        for o in (data.get("objections") or [])
                        if isinstance(o, dict)
                    ][:3],
                    "questions": [str(x) for x in (data.get("questions") or [])][:3],
                    "avoid": [str(x) for x in (data.get("avoid") or [])][:3],
                }
        except json.JSONDecodeError:
            pass
    lines = [line.strip("- •").strip() for line in text.splitlines() if line.strip()]
    return {
        "goals": lines[:3] or ["Confirm customer priority and next step."],
        "objections": [],
        "questions": lines[3:5],
        "avoid": [],
    }


class VoiceReviewEngine:
    """Post-call voice/text review engine (V4): <= 3 min, interruptible, feeds Agent 2 memory."""

    def __init__(
        self,
        store: CoachStore,
        *,
        prompts: dict[str, dict[str, Any]] | None = None,
    ) -> None:
        self.store = store
        self.prompts = prompts

    async def opening_turn(
        self,
        who: Principal,
        review_id: str,
        *,
        call_summary: str,
        key_moment_quote: str,
        score: int | None,
        llm: LLMAdapter,
        voice: bool = True,
        now: int | None = None,
    ) -> dict[str, Any]:
        review = self.store.get_review(who, review_id, now=now)
        if voice:
            self.store.check_voice_cap(who.company, now=now)
        rendered_prompt = render_template(
            load_prompt_body("coach_review", prompts=self.prompts),
            {
                "call.summary": _safe_var(call_summary),
                "call.key_moment_quote": _safe_var(key_moment_quote, 1000),
                "call.score": str(score) if score is not None else "n/a",
            },
        )
        system, user_part = _split_turn_prompt(rendered_prompt)
        reply = await _collect_llm(
            llm,
            LLMRequest(
                system=system,
                messages=[Message(role="user", content=user_part or "Start the post-call review.")],
                max_tokens=450,
                temperature=0.4,
            ),
        )
        return {
            "review_id": review["id"],
            "call_id": review["call_id"],
            "max_duration_s": MAX_REVIEW_SECONDS,
            "voice": voice,
            "reply": reply,
        }

    async def speak_interruptible(
        self,
        text: str,
        tts: TTSAdapter,
        *,
        interrupted: Callable[[], bool] | None = None,
    ) -> AsyncIterator[AudioChunk]:
        """Yields audio chunks until done or `interrupted()` returns True."""
        async for chunk in tts.synthesize(text, TTSOptions()):
            if interrupted is not None and interrupted():
                break
            yield chunk

    async def complete_review(
        self,
        who: Principal,
        review_id: str,
        *,
        transcript: list[dict[str, str]],
        remember_note: str | None = None,
        duration_s: int = 0,
        voice: bool = False,
        send_email: CapAlertSender | None = None,
        owner_email: str | None = None,
        now: int | None = None,
    ) -> dict[str, Any]:
        if isinstance(duration_s, bool) or not isinstance(duration_s, int) or duration_s < 0:
            raise CloudError("invalid", "duration_s must be a non-negative integer")
        if remember_note is not None and not isinstance(remember_note, str):
            raise CloudError("invalid", "remember_note must be a string")
        clean_transcript: list[dict[str, str]] = []
        for entry in transcript[:100]:
            if not isinstance(entry, dict):
                raise CloudError("invalid", "transcript entries must be objects")
            role = entry.get("role")
            content = entry.get("content")
            if role not in ("user", "assistant") or not isinstance(content, str):
                raise CloudError("invalid", "transcript entries require role and content")
            clean_transcript.append({"role": role, "content": content[:4000]})
        review = self.store.get_review(who, review_id, now=now)
        if voice:
            self.store.check_voice_cap(who.company, now=now)
        clamped_s = min(max(0, duration_s), MAX_REVIEW_SECONDS)
        clean_note = (remember_note or "").strip() or None
        updated = self.store.transition_review(
            who,
            review["id"],
            "done",
            transcript=clean_transcript,
            feedback_note=clean_note,
            now=now,
        )
        feedback_id: str | None = None
        if clean_note:
            feedback_id = add_feedback(
                company_id=who.company,
                user_id=who.user_id,
                call_id=review["call_id"],
                source="coach_review",
                rating=None,
                reasons=[],
                note=clean_note,
            )
        usage_status: dict[str, Any] | None = None
        if voice and clamped_s > 0:
            usage_status = await self.store.record_voice_usage(
                who.company,
                who.user_id,
                "review_voice",
                clamped_s,
                call_id=review["call_id"],
                send_email=send_email,
                owner_email=owner_email,
                now=now,
            )
        log_event(
            "coach_review",
            "completed",
            call_id=review["call_id"],
            duration_ms=clamped_s * 1000,
            has_memory_note=bool(clean_note),
        )
        return {
            "review": updated,
            "feedback_id": feedback_id,
            "usage": usage_status,
        }
