"""Comprehensive tests for Round 4 Agent 3:
- Prep coach & game plan (`get_game_plan()` <= 150 words, works without Zoho)
- Voice coach usage cap (no cap hidden, under cap runs, 80% email once, 100% blocks until 1st)
- Review queue (all state transitions, snooze presets, 24h reminder once, 7d expiry, <30s none)
- Post-call voice review feeds `add_feedback(source="coach_review")`, transcript access rules
- Morning brief (with & without Zoho, never empty, off switch, 08:00 local schedule)
- Multi-tenant isolation across every new table
"""

from __future__ import annotations

import json
import tempfile
import unittest
from datetime import UTC, datetime
from pathlib import Path

import pytest

from sotto_worker.adapters.coach import FakeCoachLLMAdapter, FakeTTSAdapter
from sotto_worker.cloud.coach import CoachStore, get_game_plan, register_coach_store
from sotto_worker.cloud.coach.engine import PrepCoachEngine, VoiceReviewEngine
from sotto_worker.cloud.coach.morning_brief import generate_morning_brief, morning_brief_job
from sotto_worker.cloud.coach.store import DAY_MS, HOUR_MS
from sotto_worker.cloud.memory import api as memory_api
from sotto_worker.cloud.memory.store import MemoryStore
from sotto_worker.cloud.store import CloudError, CloudStore, Principal
from sotto_worker.server.vault import Vault


def _ts(year: int, month: int, day: int, hour: int = 10, minute: int = 0) -> int:
    return int(datetime(year, month, day, hour, minute, tzinfo=UTC).timestamp() * 1000)


class CoachBackendTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self) -> None:
        self._tmp = tempfile.TemporaryDirectory()
        self.db_path = Path(self._tmp.name) / "cloud.db"
        self.cloud = CloudStore(self.db_path, Vault("test-master-secret-32-chars-long"))
        self.now = _ts(2026, 11, 15, 10, 0)
        self.coach = CoachStore(self.cloud, clock=lambda: self.now)
        register_coach_store(self.coach)
        self.memory = MemoryStore(self.cloud)
        memory_api.configure(self.memory)

        self.owner = Principal(
            user_id="owner_1",
            company_id=None,
            role="owner",
            device_id=None,
            email="owner@agn.test",
            name="Owner",
        )
        with self.cloud._tx() as db:
            for cid, cname in (("co_a", "Alpha Corp"), ("co_b", "Beta LLC")):
                db.execute(
                    "INSERT INTO companies(id, name, plan, seats, minutes_month,"
                    " created_at, updated_at) VALUES (?,?,'paid',10,1000,?,?)",
                    (cid, cname, self.now, self.now),
                )
            for uid, cid, role, email, name in (
                ("u_a_admin", "co_a", "admin", "admin@alpha.test", "Alpha Admin"),
                ("u_a_agent", "co_a", "agent", "agent@alpha.test", "Alpha Agent"),
                ("u_a_agent2", "co_a", "agent", "agent2@alpha.test", "Alpha Agent 2"),
                ("u_b_admin", "co_b", "admin", "admin@beta.test", "Beta Admin"),
                ("u_b_agent", "co_b", "agent", "agent@beta.test", "Beta Agent"),
            ):
                db.execute(
                    "INSERT INTO users(id, company_id, email, name, pw_hash, role, active,"
                    " created_at) VALUES (?,?,?,?,'hash',?,1,?)",
                    (uid, cid, email, name, role, self.now),
                )

        self.a_admin = Principal(
            "u_a_admin", "co_a", "admin", None, "admin@alpha.test", "Alpha Admin"
        )
        self.a_agent = Principal(
            "u_a_agent", "co_a", "agent", None, "agent@alpha.test", "Alpha Agent"
        )
        self.a_agent2 = Principal(
            "u_a_agent2", "co_a", "agent", None, "agent2@alpha.test", "Alpha Agent 2"
        )
        self.b_admin = Principal(
            "u_b_admin", "co_b", "admin", None, "admin@beta.test", "Beta Admin"
        )
        self.b_agent = Principal(
            "u_b_agent", "co_b", "agent", None, "agent@beta.test", "Beta Agent"
        )

    def tearDown(self) -> None:
        memory_api.configure(None)
        register_coach_store(None)
        self.cloud.close()
        self._tmp.cleanup()

    # --- 1. Prep coach & game plan (B1, B2) ------------------------------------------------------

    async def test_prep_chat_and_game_plan_without_zoho_and_contract(self) -> None:
        plan_json = json.dumps(
            {
                "goals": ["Confirm Q1 budget", "Identify decision maker", "Book technical demo"],
                "objections": [
                    {"objection": "Too expensive", "answer": "Tie price to hours saved per rep."}
                ],
                "questions": ["What breaks in your current workflow?"],
                "avoid": ["Do not promise custom integrations before scoping."],
            }
        )
        llm = FakeCoachLLMAdapter(
            replies=["Start by asking what triggered their search.", plan_json]
        )
        engine = PrepCoachEngine(self.coach)

        # Works cleanly with empty Zoho brief
        reply = await engine.reply(self.a_agent, "call_1", "They are a cold inbound lead.", llm=llm)
        assert "triggered" in reply["message"]["content"]
        assert len(self.coach.list_prep_messages(self.a_agent, "call_1")) == 2

        plan = await engine.generate_game_plan(self.a_agent, "call_1", llm=llm)
        assert len(plan["goals"]) == 3
        assert len(plan["objections"]) == 1

        # Contract §3.4: get_game_plan(company_id, call_id) returns <= 150 words
        rendered = get_game_plan("co_a", "call_1")
        assert rendered is not None
        assert rendered is not None
        assert len(rendered.split()) <= 150
        assert "Confirm Q1 budget" in rendered

    # --- 2. Usage cap tests (V2) -----------------------------------------------------------------

    async def test_voice_cap_lifecycle_80_100_and_month_reset(self) -> None:
        # Unconfigured -> hidden/unavailable
        st0 = self.coach.cap_status("co_a", now=self.now)
        assert not st0["available"]
        assert st0["reason"] == "not_configured"

        # Enabled & stages configured, but NO cap -> feature hidden/off
        self.coach.configure_company_coach(
            self.owner, "co_a", stages_configured=True, enabled=True, clear_cap=True, now=self.now
        )
        st_nocap = self.coach.cap_status("co_a", now=self.now)
        assert not st_nocap["available"]
        assert st_nocap["reason"] == "no_cap"
        with pytest.raises(CloudError):
            self.coach.check_voice_cap("co_a", now=self.now)

        # Set $1.00 monthly cap at $0.10/min (10.0 min)
        st_set = self.coach.configure_company_coach(
            self.owner, "co_a", cap_usd=1.0, cost_per_min_usd=0.10, now=self.now
        )
        assert st_set["available"]
        assert st_set["cap_minutes"] == 10.0

        sent_emails: list[tuple[str, str, str]] = []

        async def fake_send(to: str, subject: str, body: str) -> None:
            sent_emails.append((to, subject, body))

        # 5 min -> $0.50 (50%): under cap, no email
        await self.coach.record_voice_usage(
            "co_a",
            "u_a_agent",
            "review_voice",
            300,
            send_email=fake_send,
            owner_email="owner@agn.test",
            now=self.now,
        )
        assert len(sent_emails) == 0
        assert self.coach.cap_status("co_a", now=self.now)["available"]

        # +3 min -> $0.80 (80%): sends ONE alert to admin + owner
        await self.coach.record_voice_usage(
            "co_a",
            "u_a_agent",
            "review_voice",
            180,
            send_email=fake_send,
            owner_email="owner@agn.test",
            now=self.now,
        )
        assert {e[0] for e in sent_emails} == {"admin@alpha.test", "owner@agn.test"}
        assert "80%" in sent_emails[0][1]

        # +30 s -> $0.85 (still between 80% and 100%): NO duplicate 80% email
        sent_emails.clear()
        await self.coach.record_voice_usage(
            "co_a",
            "u_a_agent",
            "prep_voice",
            30,
            send_email=fake_send,
            owner_email="owner@agn.test",
            now=self.now,
        )
        assert len(sent_emails) == 0

        # +90 s -> $1.00 (100%): sends 100% alert and BLOCKS voice coach
        await self.coach.record_voice_usage(
            "co_a",
            "u_a_agent",
            "review_voice",
            90,
            send_email=fake_send,
            owner_email="owner@agn.test",
            now=self.now,
        )
        assert len(sent_emails) == 2
        assert "100%" in sent_emails[0][1]
        st_full = self.coach.cap_status("co_a", now=self.now)
        assert not st_full["available"]
        assert st_full["reason"] == "cap_reached"
        with pytest.raises(CloudError):
            self.coach.check_voice_cap("co_a", now=self.now)

        # On the 1st of next month (Dec 1, 2026), spend resets -> available again!
        dec1 = _ts(2026, 12, 1, 0, 5)
        assert self.coach.cap_status("co_a", now=dec1)["available"]

        # Or raising cap in the current month immediately unblocks
        self.coach.configure_company_coach(
            self.owner, "co_a", cap_usd=2.0, cost_per_min_usd=0.10, now=self.now
        )
        assert self.coach.cap_status("co_a", now=self.now)["available"]

    # --- 3. Review queue tests (V3) --------------------------------------------------------------

    async def test_review_queue_states_snooze_reminder_expiry_and_short_call(self) -> None:
        # < 30 s creates no review
        assert self.coach.enqueue_review(self.a_agent, "call_short", 29, now=self.now) is None

        # >= 30 s creates pending review
        r1 = self.coach.enqueue_review(self.a_agent, "call_r1", 120, now=self.now)
        assert r1 is not None
        assert r1["status"] == "pending"

        # Snooze 1h
        s1 = self.coach.snooze_review(self.a_agent, r1["id"], preset="1h", now=self.now)
        assert s1["status"] == "snoozed"
        assert s1["snoozed_until"] == self.now + HOUR_MS

        # Wakes up after 1h
        woke = self.coach.get_review(self.a_agent, r1["id"], now=self.now + HOUR_MS + 1000)
        assert woke["status"] == "pending"

        # Snooze tomorrow morning (UTC+4 -> 08:00 local = 04:00 UTC next day)
        s2 = self.coach.snooze_review(
            self.a_agent, r1["id"], preset="tomorrow_morning", timezone_offset_min=240, now=self.now
        )
        assert s2["snoozed_until"] == _ts(2026, 11, 16, 4, 0)

        # Snooze custom time
        custom_t = self.now + 3 * HOUR_MS
        s3 = self.coach.snooze_review(
            self.a_agent, r1["id"], preset="custom", until_ms=custom_t, now=self.now
        )
        assert s3["snoozed_until"] == custom_t

        # 24h reminder fires once (after waking from snooze)
        r2 = self.coach.enqueue_review(self.a_agent, "call_r2", 90, now=self.now)
        assert r2 is not None
        assert len(self.coach.due_reminders(now=self.now + 23 * HOUR_MS)) == 0
        due = self.coach.due_reminders(now=self.now + 25 * HOUR_MS)
        assert r2["id"] in [d["id"] for d in due]
        assert self.coach.mark_reminded("co_a", r2["id"], now=self.now + 25 * HOUR_MS)
        # Never reminded a second time
        due_later = [d["id"] for d in self.coach.due_reminders(now=self.now + 30 * HOUR_MS)]
        assert r2["id"] not in due_later

        # Dismiss (no reason needed) & Cancel
        d_out = self.coach.transition_review(
            self.a_agent, r2["id"], "dismissed", now=self.now + 26 * HOUR_MS
        )
        assert d_out["status"] == "dismissed"

        r3 = self.coach.enqueue_review(self.a_agent, "call_r3", 90, now=self.now)
        assert r3 is not None
        c_out = self.coach.transition_review(
            self.a_agent, r3["id"], "cancelled", now=self.now + 1000
        )
        assert c_out["status"] == "cancelled"

        # 7-day expiry
        r4 = self.coach.enqueue_review(self.a_agent, "call_r4", 90, now=self.now)
        assert r4 is not None
        exp = self.coach.get_review(self.a_agent, r4["id"], now=self.now + 7 * DAY_MS + 1000)
        assert exp["status"] == "expired"

    # --- 4. Voice review feeds Agent 2 memory + interruptible + transcript rules (V4) ------------

    async def test_voice_review_feeds_memory_and_enforces_transcript_visibility(self) -> None:
        self.coach.configure_company_coach(
            self.owner, "co_a", stages_configured=True, enabled=True, cap_usd=10.0, now=self.now
        )
        rev = self.coach.enqueue_review(self.a_agent, "call_v4", 180, now=self.now)
        assert rev is not None

        llm = FakeCoachLLMAdapter(
            replies=[
                'Nice discovery! Instead of "we are cheaper", try "cut ramp time in half". '
                "Anything I should remember for next time?"
            ]
        )
        tts = FakeTTSAdapter(chunk_bytes=8)
        engine = VoiceReviewEngine(self.coach)

        opening = await engine.opening_turn(
            self.a_agent,
            rev["id"],
            call_summary="Discussed pricing with Acme.",
            key_moment_quote="we are cheaper",
            score=78,
            llm=llm,
            voice=True,
            now=self.now,
        )
        assert opening["max_duration_s"] == 180
        assert "Anything I should remember for next time?" in opening["reply"]

        # Interruptible TTS stops after 1 chunk
        seen = [0]

        def _stop() -> bool:
            return seen[0] >= 1

        async for _chunk in engine.speak_interruptible(opening["reply"], tts, interrupted=_stop):
            seen[0] += 1
        assert seen[0] == 1

        # Complete review -> calls add_feedback(source="coach_review")
        done = await engine.complete_review(
            self.a_agent,
            rev["id"],
            transcript=[
                {"role": "assistant", "content": opening["reply"]},
                {"role": "user", "content": "Remind me to ask for budget earlier."},
            ],
            remember_note="Ask about budget before quoting.",
            duration_s=95,
            voice=True,
            now=self.now + 100_000,
        )
        assert done["review"]["status"] == "done"
        assert done["feedback_id"] is not None
        fb_rows = self.cloud._q(
            "SELECT id, source, note, call_id FROM memory_feedback WHERE company_id='co_a'"
        )
        assert len(fb_rows) == 1
        assert fb_rows[0]["source"] == "coach_review"
        assert fb_rows[0]["note"] == "Ask about budget before quoting."
        assert fb_rows[0]["call_id"] == "call_v4"

        # Transcript visibility: agent sees own; other agent forbidden; admin blocked until allowed
        assert len(self.coach.get_review_transcript(self.a_agent, rev["id"])) == 2
        with pytest.raises(CloudError):
            self.coach.get_review_transcript(self.a_agent2, rev["id"])
        with pytest.raises(CloudError):
            self.coach.get_review_transcript(self.a_admin, rev["id"])

        self.coach.set_admin_transcript_visibility(self.a_admin, True, now=self.now)
        assert len(self.coach.get_review_transcript(self.a_admin, rev["id"])) == 2

    # --- 5. Morning brief (V5) -------------------------------------------------------------------

    async def test_morning_brief_with_and_without_zoho_and_off_switch(self) -> None:
        # Without Zoho and no pending reviews -> still never empty, mode=text
        b_no_zoho = await generate_morning_brief(
            self.coach, self.a_agent, meetings=[], now=self.now
        )
        assert b_no_zoho["mode"] == "text"
        assert len(b_no_zoho["content"]["summary_text"]) > 10
        assert not b_no_zoho["content"]["has_zoho_meetings"]

        # With voice coach enabled + Zoho meetings -> mode=voice, meetings included
        self.coach.configure_company_coach(
            self.owner, "co_a", stages_configured=True, enabled=True, cap_usd=10.0, now=self.now
        )
        self.coach.enqueue_review(self.a_agent, "call_mb", 120, now=self.now)
        b_zoho = await generate_morning_brief(
            self.coach,
            self.a_agent,
            meetings=[{"title": "Acme renewal", "start": "10:00"}],
            now=self.now + DAY_MS,
        )
        assert b_zoho["mode"] == "voice"
        assert b_zoho["content"]["has_zoho_meetings"]
        assert "Acme renewal" in b_zoho["content"]["summary_text"]
        assert b_zoho["content"]["pending_reviews_count"] == 1

        # Scheduled job: 07:00 UTC -> none delivered; 08:15 UTC -> skips disabled user
        self.coach.set_morning_brief_prefs(self.a_agent, enabled=False)
        early = _ts(2026, 11, 20, 7, 0)
        assert await morning_brief_job(self.coach, now=early) == 0

        morning = _ts(2026, 11, 20, 8, 15)
        delivered = await morning_brief_job(self.coach, now=morning)
        # 5 active users total, 1 disabled (a_agent) -> 4 delivered
        assert delivered == 4
        # Second run same day is idempotent -> 0 delivered
        assert await morning_brief_job(self.coach, now=morning + HOUR_MS) == 0

    # --- 6. Multi-tenant isolation across EVERY new table (R3, §3.6) -----------------------------

    async def test_multi_tenant_isolation_all_tables(self) -> None:
        # Company A creates rows in every table
        self.coach.add_prep_message(
            self.a_agent, "call_iso", "user", "Alpha secret note", now=self.now
        )
        self.coach.save_game_plan(
            self.a_agent,
            "call_iso",
            goals=["Alpha goal"],
            objections=[],
            questions=[],
            avoid=[],
            rendered_text="Goals: Alpha goal.",
            now=self.now,
        )
        self.coach.configure_company_coach(
            self.owner, "co_a", stages_configured=True, enabled=True, cap_usd=5.0, now=self.now
        )
        rev_a = self.coach.enqueue_review(self.a_agent, "call_iso", 120, now=self.now)
        assert rev_a is not None
        await generate_morning_brief(self.coach, self.a_agent, meetings=[], now=self.now)

        # Company B cannot read or mutate Company A's rows
        assert self.coach.list_prep_messages(self.b_agent, "call_iso") == []
        assert self.coach.get_game_plan_for_user(self.b_agent, "call_iso") is None
        assert get_game_plan("co_b", "call_iso") is None
        assert not self.coach.cap_status("co_b", now=self.now)["available"]
        assert self.coach.list_reviews(self.b_agent, include_closed=True, now=self.now) == []
        with pytest.raises(CloudError):
            self.coach.get_review(self.b_agent, rev_a["id"], now=self.now)
        with pytest.raises(CloudError):
            self.coach.snooze_review(self.b_agent, rev_a["id"], preset="1h", now=self.now)
        with pytest.raises(CloudError):
            self.coach.transition_review(self.b_agent, rev_a["id"], "dismissed", now=self.now)
        with pytest.raises(CloudError):
            self.coach.get_review_transcript(self.b_admin, rev_a["id"])
        assert self.coach.latest_morning_brief(self.b_agent) is None


if __name__ == "__main__":
    unittest.main()
