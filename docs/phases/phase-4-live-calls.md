# Phase 4 — Live calls on real devices

## Goal

Make real phone calls through Sotto:

    customer's phone ⇄ SIP trunk ⇄ LiveKit room ⇄ agent app

The worker listens to the customer track only and pushes cards over the data channel.
Live p95 must stay within 1.5 s and must be comparable to the replay.

## Entry criteria

- Phase 2 gate met (engine proven on replay).
- Phase 3 in-call screen approved.

## Read first

- `docs/REQUIREMENTS.md`: R1, R4, R5.
- `docs/ARCHITECTURE.md`: token flow, failure modes.
- `docs/REFERENCES.md`: LiveKit SIP, LiveKit Agents, LiveKit React Native / Expo, CallKeep, Expo dev builds, EAS.

## Skills and subagents

- `source-driven-development`: SIP and the native call UI change often.
- `security-and-hardening`: tokens, trunk credentials.
- `debugging-and-error-recovery`.
- Subagents: `latency-guardian`, `security-auditor`.

## Environment

Local Mac with Docker and simulators, real iPhone and Android devices, and the owner on the phone.

## Tasks

### P4.1 — Telephony setup

Configure the LiveKit Cloud project with:
- the SIP trunk: Yeastar trunk if Phase 0 confirmed it, otherwise Twilio or Telnyx;
- inbound and outbound dispatch rules;
- caller ID showing the company number.

Write runbook steps in `docs/runbooks/telephony.md`.

**Acceptance:** a test call rings a real phone, and the audio flows both ways.

### P4.2 — Token service

An edge function `livekit-token` that mints per-call tokens:
- the agent may publish its mic and subscribe;
- the worker may subscribe to the customer;
- each token is scoped to the room, with a short TTL.

**Acceptance:**
- tests show an agent cannot join another company's room;
- a `security-auditor` pass is done.

### P4.3 — App calling

- Expo dev build (not Expo Go) with the LiveKit SDK.
- Native call UI: CallKit on iOS, ConnectionService on Android.
- Audio routing: earpiece, speaker, Bluetooth.
- Background audio, and reconnect when the network changes.
- The web or desktop build uses the browser WebRTC path.

**Acceptance:** call, hold, mute and end work on an iPhone, an Android phone and a laptop browser.

### P4.4 — Worker in the room

- The worker joins through agent dispatch.
- It subscribes to the **customer participant's track only**, identified by its SIP participant attributes, not by guessing.
- It runs the Phase 2 pipeline and sends cards over the data channel.
- The app renders them using the Phase 3 component.
- **No blocking work in a live turn (T-005):**
  - the worker's prewarm hook calls `preload_adapters` for the platform config **and** for each company's routing;
  - `session.warm()` runs at room join;
  - HTTP keep-alive is set longer than the expected silence (or the worker re-warms after silence), so the first question after a long pause doesn't pay TLS setup again.

**Acceptance:** cards appear during a real call. The live replay with an 8 s gap before line 1 and between lines still has p95 ≤ 1500 ms.

### P4.5 — Desktop with another softphone (R4 row 2, optional)

Prototype capturing system audio as the customer track and the mic as the agent track on macOS and Windows. Do this only if Phase 0 says it is needed.

**Acceptance:** this is either recorded as a D-NNN decision deferred, or it works on one OS.

### P4.6 — Live latency

Store the same timing events as the replay, server-side; write them to a file or a table, since Phase 5 adds the real table. Write a test script for the owner: 10 scripted questions per device.

**Acceptance:** live p95 ≤ 1500 ms on every device, reported next to the replay p95.

### P4.7 — Robustness

Test and handle each of these:
- poor network (throttle);
- app backgrounded;
- call drop and reconnect;
- worker crash and restart (cards resume);
- two workers joining the same call (exactly one serves).

**Acceptance:** each case has an automated test where possible, or a recorded manual check in the tracker.

## Exit gate

- [ ] Real calls on an iPhone, an Android phone and a laptop show cards, with live p95 ≤ 1500 ms.
- [ ] In live tests the agent's speech never triggers a card (owner-scripted check).
- [ ] The telephony runbook is written, and the token service has passed review.

## Out of scope

- Multi-tenant administration (Phase 5).
- Prompt UI (Phase 6).
- CRM (Phase 7).

## Pitfalls

- **Expo Go cannot run LiveKit.** Use dev builds.
- **iOS kills background audio without the right `UIBackgroundModes` and CallKit integration.**
- **Identifying the customer by join order is fragile.** Use participant kind and attributes instead.
- **SIP codec and transcoding latency adds up.** Measure the "audio + network" stage separately.

## Owner actions

- LiveKit Cloud account.
- Trunk or carrier account and phone numbers.
- Apple Developer and Google Play accounts (internal testing).
- Devices.
- Make the test calls.
