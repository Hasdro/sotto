/**
 * DEV-ONLY mock of the demo bridge, enabled by `?mock=1` on the in-call route.
 *
 * It exists so the in-call screen can be screenshotted and reviewed without the Python worker.
 * It replays a canned, fictional demo call (the fixture company of packages/shared demo fixtures)
 * as raw JSON frames through the SAME decoder and reducer as the real bridge, so nothing here
 * bypasses validation. Remove it together with the demo bridge when Phase 4 brings LiveKit.
 */
import type { DemoClientMessage } from "@sotto/shared";
import type { Locale } from "../../lib/i18n";
import { type Bridge, type BridgeHandlers, decodeServerFrame } from "./bridge";

type Frame = { after: number; data: Record<string, unknown> };

const CALL_ID = "0b8f3c1e-7a2d-4e6f-8c9b-1d2e3f4a5b6c";
const uuid = (n: number) => `6f1c2a52-3b7e-4d0a-9a51-${String(n).padStart(12, "0")}`;

type Line = { say: string; who?: "customer" | "agent" };
type CardSpec = {
  type: "answer" | "question" | "objection" | "warning" | "holding";
  source: "playbook" | "ai" | "backup" | "holding";
  text: string;
  label?: string;
};
type Turn = { lines: Line[]; cards: CardSpec[]; escalate?: string };

type Script = { company: string; scenario: string; turns: Turn[] };

const SCRIPTS: Record<Locale, Script> = {
  en: {
    company: "Palm Grove Realty (demo)",
    scenario: "Price objection",
    turns: [
      {
        lines: [{ say: "Hi, I saw the two-bedroom at Palm Grove Marina. Is it still available?" }],
        cards: [
          {
            type: "answer",
            source: "playbook",
            text: "Yes, two left, on floors 12 and 18. Offer a viewing this week.",
          },
        ],
      },
      {
        lines: [
          { who: "agent", say: "It is. We have two left. Would you like to see them this week?" },
          { say: "Maybe. Can I pay the deposit in bitcoin?" },
        ],
        cards: [
          {
            type: "holding",
            source: "holding",
            text: "Good question. Let me confirm that and send it to you today.",
          },
        ],
        escalate: "Can I pay the deposit in bitcoin?",
      },
      {
        lines: [{ say: "Another agency quoted us twenty percent less for something similar." }],
        cards: [
          {
            type: "objection",
            source: "playbook",
            text: "Ask what their quote includes, then offer a line-by-line comparison.",
          },
        ],
      },
      {
        lines: [{ say: "Does the service charge cover district cooling?" }],
        cards: [
          {
            type: "holding",
            source: "holding",
            text: "Good question. Let me confirm that and send it to you today.",
          },
          {
            type: "answer",
            source: "ai",
            label: "Not in playbook — check before promising",
            text: "District cooling is billed separately. Offer to confirm the rate with the developer today.",
          },
        ],
      },
    ],
  },
  ar: {
    company: "بالم جروف العقارية (تجريبي)",
    scenario: "اعتراض على السعر",
    turns: [
      {
        lines: [{ say: "مرحبًا، شفت شقة الغرفتين في بالم جروف مارينا. هل ما زالت متاحة؟" }],
        cards: [
          {
            type: "answer",
            source: "playbook",
            text: "نعم، بقيت شقتان في الطابقين 12 و18. اعرض عليه معاينة هذا الأسبوع.",
          },
        ],
      },
      {
        lines: [
          { who: "agent", say: "نعم متاحة، بقيت شقتان. تحب نرتب معاينة هذا الأسبوع؟" },
          { say: "ممكن. هل أقدر أدفع العربون بالبيتكوين؟" },
        ],
        cards: [
          {
            type: "holding",
            source: "holding",
            text: "سؤال ممتاز. خلني أتأكد وأرسل لك الجواب اليوم.",
          },
        ],
        escalate: "هل أقدر أدفع العربون بالبيتكوين؟",
      },
      {
        lines: [{ say: "شركة ثانية عطتني سعر أقل بعشرين بالمية لشقة مشابهة." }],
        cards: [
          {
            type: "objection",
            source: "playbook",
            text: "اسأله ماذا يشمل عرضهم، ثم اعرض مقارنة بندًا ببند.",
          },
        ],
      },
      {
        lines: [{ say: "هل رسوم الخدمة تشمل التبريد المركزي؟" }],
        cards: [
          {
            type: "holding",
            source: "holding",
            text: "سؤال ممتاز. خلني أتأكد وأرسل لك الجواب اليوم.",
          },
          {
            type: "answer",
            source: "ai",
            label: "ليست في الدليل — تأكد قبل أن تعد",
            text: "التبريد المركزي يُحسب منفصلًا. اعرض أن تتأكد من السعر مع المطوّر اليوم.",
          },
        ],
      },
    ],
  },
};

/** Splits text into word-sized deltas, keeping the spaces, like a streamed model reply. */
export function toDeltas(text: string, wordsPerDelta = 2): string[] {
  const words = text.match(/\S+\s*/g) ?? [text];
  const out: string[] = [];
  for (let i = 0; i < words.length; i += wordsPerDelta) {
    out.push(words.slice(i, i + wordsPerDelta).join(""));
  }
  return out;
}

/** The frames of the canned call, each with its delay after the previous one. */
export function scriptFrames(locale: Locale, fast = true): Frame[] {
  const script = SCRIPTS[locale];
  const gap = fast ? 1 : 6; // stretch factor between beats
  const frames: Frame[] = [{ after: 20, data: { type: "call_started", call_id: CALL_ID } }];
  let atMs = 1200;
  let cardN = 1;
  for (const turn of script.turns) {
    for (const line of turn.lines) {
      atMs += 2400;
      frames.push({
        after: 60 * gap,
        data: { type: "transcript", speaker: line.who ?? "customer", text: line.say, at_ms: atMs },
      });
    }
    frames.push({ after: 10 * gap, data: { type: "turn_end", at_ms: atMs + 300 } });
    for (const spec of turn.cards) {
      const id = uuid(cardN++);
      const deltas = toDeltas(spec.text);
      deltas.forEach((delta, seq) => {
        const last = seq === deltas.length - 1;
        frames.push({
          after: (seq === 0 ? 120 : 30) * gap,
          data: {
            type: "card",
            card: {
              v: 1,
              card_id: id,
              call_id: CALL_ID,
              seq,
              type: spec.type,
              source: spec.source,
              delta,
              done: last,
              ...(spec.label && seq === 0 ? { label: spec.label } : {}),
            },
          },
        });
      });
    }
    if (turn.escalate) {
      frames.push({ after: 40 * gap, data: { type: "escalation", question: turn.escalate } });
    }
  }
  return frames;
}

export function mockHello(locale: Locale): Record<string, unknown> {
  const s = SCRIPTS[locale];
  return {
    type: "hello",
    v: 1,
    company_name: s.company,
    mode: "fake",
    scenarios: [{ id: "price-objection", title: s.scenario }],
  };
}

/**
 * A Bridge that replays the canned call. `autostart` starts it right after hello, so a
 * screenshot run needs no clicks. Typed lines are echoed back as transcript.
 */
export function connectMockBridge(
  handlers: BridgeHandlers,
  opts: { locale: Locale; autostart: boolean; fast?: boolean },
): Bridge {
  const timers: ReturnType<typeof setTimeout>[] = [];
  let elapsedMs = 0;
  let closed = false;

  const deliver = (data: unknown) => {
    if (closed) return;
    const msg = decodeServerFrame(JSON.stringify(data));
    if (msg) handlers.onMessage(msg);
  };
  const play = (frames: Frame[]) => {
    let at = 0;
    for (const f of frames) {
      at += f.after;
      timers.push(setTimeout(() => deliver(f.data), at));
    }
  };

  handlers.onStatus("connecting");
  timers.push(
    setTimeout(() => {
      deliver(mockHello(opts.locale));
      if (opts.autostart) play(scriptFrames(opts.locale, opts.fast ?? true));
    }, 30),
  );

  return {
    send(msg: DemoClientMessage) {
      if (msg.type === "start") play(scriptFrames(opts.locale, opts.fast ?? false));
      if (msg.type === "say") {
        elapsedMs += 3000;
        play([
          {
            after: 10,
            data: { type: "transcript", speaker: msg.speaker, text: msg.text, at_ms: elapsedMs },
          },
        ]);
      }
      if (msg.type === "end") play([{ after: 10, data: { type: "call_ended", call_id: CALL_ID } }]);
      return true;
    },
    close() {
      closed = true;
      for (const t of timers) clearTimeout(t);
    },
  };
}
