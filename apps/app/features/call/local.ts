/**
 * Calls on this device (D-022): the client engine answers the demo protocol locally, so the call
 * screen works exactly as with the D-020 server socket. The management server only mints a
 * short-lived speech-to-text token at microphone start and receives the call's numbers at the end.
 */
import {
  buildRuntime,
  type CallBundle,
  type CallSummary,
  LocalCallBridge,
  reviewCall,
  type SttToken,
} from "@sotto/engine";
import {
  DemoClientMessage as DemoClientSchema,
  type DemoServerMessage,
  parseDemoServerMessage,
} from "@sotto/shared";
import { Platform } from "react-native";
import { callNotes } from "../../lib/callNotes";
import { type CallSource, callSource } from "../../lib/callSource";
import { CloudError, cloudApi, cloudState, setCallLive } from "../../lib/cloud";
import {
  type DeviceEntry,
  markReviewing,
  saveDeviceCall,
  setDeviceReview,
} from "../../lib/deviceHistory";
import {
  attachedBriefText,
  attachedCallName,
  attachedContact,
  attachedGamePlanText,
  saveBriefFor,
} from "../crm/attached";
import { stateOf } from "../flags/catalog";
import { learnAfterCall } from "../learning/learn";
import type { Bridge, BridgeHandlers } from "./bridge";
import { isPracticeId, practiceRun, practiceScenario, setPracticeRun } from "./practice";

/** Call review is a flagged feature (D-028): when it is not available the transcript never goes
 * to the after-call model at all (D-036). */
export function reviewAllowed(): boolean {
  const s = cloudState();
  return s.status !== "signed_in" || stateOf(s.me.features, "call_review").state === "available";
}

export function connectLocal(bundle: CallBundle, handlers: BridgeHandlers): Bridge {
  handlers.onStatus("connecting");
  const blocked = bundle.plan && !bundle.plan.can_call ? bundle.plan : null;
  let transcript: DeviceEntry[] = [];
  let startedAt = Date.now();
  let source: CallSource = "computer";
  const cardText = new Map<string, string>();
  // React Native's built-in fetch cannot stream a response; Expo's can (cards word by word).
  const fetchFn =
    Platform.OS === "web" ? undefined : (require("expo/fetch") as { fetch: typeof fetch }).fetch;
  // D-073: the practice script plays on the same engine; the hello list never offers it, so a
  // real account still shows the listen screen (call.tsx decides from `bundle.practice`).
  const practice = practiceScenario(bundle);
  const runtime = buildRuntime(
    practice ? { ...bundle, scenarios: [...bundle.scenarios, practice] } : bundle,
    undefined,
    fetchFn,
  );

  const emit = (raw: DemoServerMessage) => {
    let msg: DemoServerMessage;
    try {
      msg = parseDemoServerMessage(raw);
    } catch (err) {
      console.warn("[engine] dropped an invalid message", err);
      return;
    }
    if (msg.type === "hello") {
      msg = { ...msg, scenarios: msg.scenarios.filter((x) => !isPracticeId(x.id)) };
    }
    // No "sent to your manager" toast on a practice call: nothing was sent.
    if (msg.type === "escalation" && practiceRun()) return;
    remember(msg);
    handlers.onMessage(msg);
    if (msg.type === "call_started") {
      setCallLive(true);
      if (!practiceRun()) registerStart(msg.call_id); // practice minutes are not counted
    }
  };
  // The server notes when the call began (minutes are capped by its own clock) and can still
  // refuse it if the plan ended since the bundle was loaded.
  const registerStart = (callId: string) => {
    cloudApi("/api/v1/calls/start", { method: "POST", body: { call_id: callId } }).catch(
      (err: unknown) => {
        if (err instanceof CloudError && err.status === 402) {
          emit({ type: "notice", message: `Calls are paused: ${err.message}. Ask your admin.` });
          bridge.handle({ type: "end" });
        }
      },
    );
  };
  const remember = (msg: DemoServerMessage) => {
    if (msg.type === "call_started") {
      source = callSource() ?? "computer";
      transcript = [];
      startedAt = Date.now();
    } else if (msg.type === "transcript") {
      transcript.push({ kind: "line", speaker: msg.speaker, text: msg.text, at_ms: msg.at_ms });
    } else if (msg.type === "escalation") {
      transcript.push({ kind: "escalation", text: msg.question, at_ms: Date.now() - startedAt });
    } else if (msg.type === "card") {
      const c = msg.card;
      const text = (cardText.get(c.card_id) ?? "") + c.delta;
      if (c.done) {
        cardText.delete(c.card_id);
        if (text.trim()) {
          transcript.push({
            kind: "card",
            type: c.type,
            source: c.source,
            id: c.card_id,
            text: text.trim(),
            at_ms: Date.now() - startedAt,
          });
        }
      } else cardText.set(c.card_id, text);
    }
  };
  const ended = (s: CallSummary) => {
    setCallLive(false);
    // Practice (D-073): no History, no brief, no review, no learning, no usage report.
    if (practiceRun()) return;
    void saveBriefFor(s.call_id); // T-056: the brief is kept with the call (server, org-scoped)
    // UX-009: the linked Zoho name; "" lets History name it in the reader's language and clock.
    const named = attachedCallName();
    saveDeviceCall({
      id: s.call_id,
      started_at: s.started_at,
      ended_at: Date.now(),
      title: named?.title ?? "",
      ...(named?.company ? { company: named.company } : {}),
      mode: runtime.mode,
      cards: s.cards,
      p50_ms: s.p50_ms,
      p95_ms: s.p95_ms,
      source,
      notes: callNotes(true),
      transcript: transcript.slice(-500),
    });
    // The review runs after the call, on the summary model; the screens show it when it lands.
    const lines = transcript.flatMap((e) =>
      e.kind === "line" ? [{ speaker: e.speaker, text: e.text }] : [],
    );
    // R11: after the review (its summary goes into the learning packet), or at once without one.
    const learn = (summary: string) =>
      void learnAfterCall({
        callId: s.call_id,
        router: runtime.router,
        bundle,
        transcript,
        summary,
        brief: attachedBriefText(),
        now: Date.now(),
      });
    if (reviewAllowed()) review(s.call_id, lines, learn);
    else learn("");
    const contact = attachedContact();
    void cloudApi("/api/v1/usage", {
      method: "POST",
      body: {
        ...s,
        source,
        ...(named?.title ? { title: named.title } : {}),
        ...(contact ? { contact } : {}),
      },
    }).catch((err) => console.warn("[engine] usage not reported", err));
  };
  const review = (
    callId: string,
    lines: { speaker: "customer" | "agent"; text: string }[],
    then: (summary: string) => void,
  ) => {
    markReviewing(callId);
    void reviewCall({
      router: runtime.router,
      prompt: bundle.prompts.review,
      company: runtime.company,
      lines,
      now: Date.now(),
    }).then((result) => {
      setDeviceReview(callId, result);
      then(result?.summary ?? "");
      // Reports (owner, 22 Oct): only the numbers go to the server, never the summary or tips.
      if (result) {
        const { scores, success, sentiment } = result;
        void cloudApi(`/api/v1/calls/${encodeURIComponent(callId)}/review`, {
          method: "POST",
          body: { scores, success, sentiment },
        }).catch(() => {}); // the usage report may not have landed yet: Reports just lack it
      }
    });
  };
  const bridge = new LocalCallBridge({
    runtime,
    send: emit,
    tokens: (vendor) =>
      cloudApi<SttToken>(`/api/v1/stt-token/${encodeURIComponent(vendor)}`, {
        method: "POST",
        timeoutMs: 2500,
      }),
    onEscalation: (e) => {
      if (practiceRun()) return; // a practice question never reaches the manager
      void cloudApi("/api/v1/escalations", {
        method: "POST",
        body: { question: e.question, transcript_excerpt: e.transcriptExcerpt, call_id: e.callId },
      }).catch((err) => console.warn("[engine] escalation not sent", err));
    },
    onEnded: ended,
    crmBrief: attachedBriefText, // R10: the record the agent attached in the context rail
    gamePlan: attachedGamePlanText, // B2: saved prep game plan for the live suggest prompt
  });
  if (blocked) {
    emit({
      type: "notice",
      message: `Calls are paused: ${blocked.blocked_reason ?? blocked.status}. Ask your admin.`,
    });
  }
  return {
    send(msg) {
      const parsed = DemoClientSchema.safeParse(msg);
      if (!parsed.success) return false;
      if (blocked && msg.type !== "end") {
        emit({
          type: "error",
          message: `calls are paused (${blocked.blocked_reason ?? blocked.status})`,
        });
        return false;
      }
      // Set before the engine sees the start, so its first messages already know.
      if (parsed.data.type === "start") setPracticeRun(isPracticeId(parsed.data.scenario_id));
      bridge.handle(parsed.data);
      return true;
    },
    sendAudio(pcm) {
      bridge.audio(pcm);
      return true;
    },
    agent: {
      start: () => bridge.agentStart(),
      push: (pcm) => bridge.agentAudio(pcm),
      stop: () => bridge.agentStop(),
    },
    close() {
      setCallLive(false);
      bridge.close();
    },
  };
}
