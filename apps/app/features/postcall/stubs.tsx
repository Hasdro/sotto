/**
 * Cross-agent stubs for Round 4 Agent 2 (master §3.4–§3.5).
 * Replaced at merge when Agent 3 (voice coach) and Agent 4 (platform safety net) land.
 */
import { Button, Panel, Stack, Text } from "@sotto/ui";
import React, { Component, type ReactNode } from "react";

// STUB(agent-3): replaced at merge with `import { startReview } from "../coach/api"`
export async function startReview(callId: string): Promise<void> {
  logEvent("voice_coach", "start_review_stub", { call_id: callId });
}

// STUB(agent-4): replaced at merge with `import { logEvent } from "../../lib/obs"`
export function logEvent(
  stage: string,
  event: string,
  meta?: Record<string, string | number | boolean>,
): void {
  if (typeof console !== "undefined" && typeof console.debug === "function") {
    console.debug(`[obs:${stage}] ${event}`, meta ?? {});
  }
}

type OutboxEntry = { kind: string; payload: Record<string, unknown>; queuedAt: number };
const _stubOutbox: OutboxEntry[] = [];

// STUB(agent-4): replaced at merge with `import { enqueue } from "../../lib/outbox"`
export async function enqueue(kind: string, payload: Record<string, unknown>): Promise<void> {
  _stubOutbox.push({ kind, payload, queuedAt: Date.now() });
  logEvent("outbox", "enqueued_stub", { kind });
}

/** Tests only: inspect queued offline items in the Agent 4 stub. */
export function _getStubOutbox(): readonly OutboxEntry[] {
  return _stubOutbox;
}

/** Tests only: clear queued offline items in the Agent 4 stub. */
export function _clearStubOutbox(): void {
  _stubOutbox.length = 0;
}

type BoundaryProps = { name: string; children: ReactNode };
type BoundaryState = { hasError: boolean };

// STUB(agent-4): replaced at merge with `import { SafeBoundary } from "../../components/SafeBoundary"`
export class SafeBoundary extends Component<BoundaryProps, BoundaryState> {
  constructor(props: BoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): BoundaryState {
    return { hasError: true };
  }

  override componentDidCatch(error: Error): void {
    logEvent("ui", "boundary_caught", {
      boundary: this.props.name,
      error: error.name || "Error",
    });
  }

  private retry = (): void => {
    this.setState({ hasError: false });
  };

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        <Panel testID={`boundary-fallback-${this.props.name}`}>
          <Stack gap="sm">
            <Text weight="semibold">This part didn&apos;t load</Text>
            <Button variant="secondary" label="Retry" onPress={this.retry} />
          </Stack>
        </Panel>
      );
    }
    return this.props.children;
  }
}
