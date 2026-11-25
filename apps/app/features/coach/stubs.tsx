/**
 * Cross-agent UI & observability stubs for Round 4 Agent 3 (00-master.md §3.5).
 * Each stub carries `// STUB(agent-N): replaced at merge`.
 */

import { Button, Disclosure, Panel, Stack, Text } from "@sotto/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";

// STUB(agent-4): replaced at merge
export function logEvent(
  stage: string,
  event: string,
  meta?: Record<string, string | number | boolean | undefined>,
): void {
  if (__DEV__) {
    void stage;
    void event;
    void meta;
  }
}

// STUB(agent-4): replaced at merge
export function enqueue(kind: string, payload: Record<string, unknown>): void {
  logEvent("outbox", "stub_enqueue", { kind, keys: Object.keys(payload).length });
}

type BoundaryProps = { name: string; children: ReactNode };
type BoundaryState = { failed: boolean };

// STUB(agent-4): replaced at merge
export class SafeBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: Error, _info: ErrorInfo): void {
    logEvent("ui", "boundary_caught", { name: this.props.name, error: error.name });
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <Panel sunken testID={`boundary-error-${this.props.name}`}>
        <Stack gap="sm">
          <Text variant="label" tone="muted">
            This part didn't load.
          </Text>
          <Button
            variant="secondary"
            label="Retry"
            onPress={() => this.setState({ failed: false })}
          />
        </Stack>
      </Panel>
    );
  }
}

// STUB(agent-1): replaced at merge
export function CallStatePanel({ summary }: { summary?: string | null }) {
  return (
    <Disclosure title="What I know so far" testID="call-state-panel">
      <Text variant="label" tone="muted">
        {summary?.trim() || "Call state updates automatically as the customer speaks."}
      </Text>
    </Disclosure>
  );
}
