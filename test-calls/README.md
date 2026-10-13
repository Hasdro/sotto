# Golden test calls

Recorded real calls (with consent) used by the replay test for R1 latency, R4 separation
and suggestion quality.

**Audio files never go into git.** They contain customer voices. Keep them in a private
storage bucket or a local folder listed in `.gitignore`; only the label JSON lives here.

Per call: `<call-id>.json`

```json
{
  "id": "call-001",
  "audio": { "customer": "call-001.customer.wav", "agent": "call-001.agent.wav" },
  "language": "en+ar",
  "moments": [
    {
      "at_ms": 252000,
      "speaker": "customer",
      "type": "objection",
      "text": "Another company quoted us 20% less.",
      "good_suggestion": "Ask what their quote includes, then offer a line-by-line comparison.",
      "playbook_ref": "objections.md#price-competitor-quote"
    }
  ]
}
```
