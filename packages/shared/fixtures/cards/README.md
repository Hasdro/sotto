# Card protocol fixtures

Both the TypeScript tests (`packages/shared/src/card.test.ts`) and the Python tests (`apps/agent-worker/tests/test_card_protocol.py`) run over these files. When the protocol changes, change the fixtures here once, and both sides must agree.

- `valid/` holds messages that both sides must accept.
- `invalid/` holds messages that both sides must reject. The file name says why.
