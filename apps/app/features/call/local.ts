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
  type SttToken,
} from "@sotto/engine";
import {
  DemoClientMessage as DemoClientSchema,
  type DemoServerMessage,
  parseDemoServerMessage,
} from "@sotto/shared";
import { cloudApi } from "../../lib/cloud";
import { type DeviceEntry, saveDeviceCall } from "../../lib/deviceHistory";
import type { Bridge, BridgeHandlers } from "./bridge";

export function connectLocal(bundle: CallBundle, handlers: BridgeHandlers): Bridge {
  handlers.onStatus("connecting");
  const blocked = bundle.plan && !bundle.plan.can_call ? bundle.plan : null;
  let transcript: DeviceEntry[] = [];
  let startedAt = Date.now();
  const cardText = new Map<string, string>();
  const runtime = buildRuntime(bundle);

  const emit = (raw: DemoServerMessage) => {
    let msg: DemoServerMessage;
    try {
      msg = parseDemoServerMessage(raw);
    } catch (err) {
      console.warn("[engine] dropped an invalid message", err);
      return;
    }
    remember(msg);
    handlers.onMessage(msg);
  };
  const remember = (msg: DemoServerMessage) => {
    if (msg.type === "call_started") {
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
            text: text.trim(),
            at_ms: Date.now() - startedAt,
          });
        }
      } else cardText.set(c.card_id, text);
    }
  };
  const ended = (s: CallSummary) => {
    saveDeviceCall({
      id: s.call_id,
      started_at: s.started_at,
      ended_at: Date.now(),
      title: `Call ${new Date(s.started_at).toLocaleString()}`,
      mode: runtime.mode,
      cards: s.cards,
      p50_ms: s.p50_ms,
      p95_ms: s.p95_ms,
      transcript: transcript.slice(-500),
    });
    void cloudApi("/api/v1/usage", { method: "POST", body: s }).catch((err) =>
      console.warn("[engine] usage not reported", err),
    );
  };
  const bridge = new LocalCallBridge({
    runtime,
    send: emit,
    tokens: (vendor) =>
      cloudApi<SttToken>(`/api/v1/stt-token/${encodeURIComponent(vendor)}`, { method: "POST" }),
    onEscalation: (e) =>
      void cloudApi("/api/v1/escalations", {
        method: "POST",
        body: { question: e.question },
      }).catch((err) => console.warn("[engine] escalation not sent", err)),
    onEnded: ended,
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
      bridge.handle(parsed.data);
      return true;
    },
    sendAudio(pcm) {
      bridge.audio(pcm);
      return true;
    },
    close() {
      bridge.close();
    },
  };
}
