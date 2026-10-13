# Phase 4 — Live calls on real devices

```
Connect the real calling path. Check current LiveKit SIP and Expo SDK docs first.

- Outbound and inbound calls through our SIP trunk into a LiveKit room; the customer
  sees our company number.
- The app joins as the agent (dev build, not Expo Go), with native call UI where
  available (CallKit on iOS, ConnectionService on Android).
- The agent worker joins, subscribes to the customer track only, and sends cards over
  the data channel. Same logging as the replay.
- Handle: bad network, app in background, call drop/reconnect, Bluetooth headset.

Give me a test script for a real call. After I run it, read the latency logs and report
live p95 next to the replay p95.
```

**Done when:** real calls on iPhone, Android and laptop show cards < 1.5 s; agent speech never triggers.
