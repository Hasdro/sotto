# Card protocol fixtures

Both the TypeScript tests (`packages/shared/src/card.test.ts`) and the Python tests (`apps/agent-worker/tests/test_card_protocol.py`) run over these files. When the protocol changes, change the fixtures here once, and both sides must agree.

- `valid/` holds messages that both sides must accept.
- `invalid/` holds messages that both sides must reject. The file name says why.

## Known, accepted differences

Python is stricter than zod in a few cases that `JSON.parse` erases, so the TS side never sees them:
- integers written as `1.0`, `1e2` or `-0.0`;
- lone UTF-16 surrogates in strings.

The worker never sends these, because it serialises with `CardMessage.to_wire()`. They are listed here so the gap stays visible.
