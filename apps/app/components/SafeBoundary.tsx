/**
 * Shared React error boundary (S2, §3.5): keeps failures small ("This part didn't load – Retry")
 * instead of blanking the app, and reports error metadata through obs.ts.
 */
import { Button, radius, space, Text, useTheme } from "@sotto/ui";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { logEvent } from "../lib/obs";

export type SafeBoundaryProps = {
  /** Stable identifier for diagnostics (e.g. "app.root", "call.cards", "wizard.step2"). */
  name: string;
  children: ReactNode;
  /** Optional custom fallback message. Defaults to "This part didn't load". */
  message?: string;
  /** Optional callback when the user taps Retry. */
  onRetry?: () => void;
  /** When this key changes (e.g. route pathname), reset the error state automatically. */
  resetKey?: string | number | null;
};

type State = {
  hasError: boolean;
  retryCount: number;
};

class BoundaryCore extends Component<SafeBoundaryProps, State> {
  state: State = { hasError: false, retryCount: 0 };

  static getDerivedStateFromError(): Partial<State> {
    return { hasError: true };
  }

  componentDidUpdate(prevProps: SafeBoundaryProps): void {
    if (this.state.hasError && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    logEvent("ui.boundary", "render_error", {
      level: "error",
      boundary: this.props.name,
      error_name: error.name || "Error",
      has_stack: Boolean(info.componentStack),
      retry_count: this.state.retryCount,
    });
  }

  private handleRetry = () => {
    this.props.onRetry?.();
    this.setState((prev) => ({ hasError: false, retryCount: prev.retryCount + 1 }));
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <FallbackCard
          name={this.props.name}
          message={this.props.message ?? "This part didn't load"}
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}

function FallbackCard({
  name,
  message,
  onRetry,
}: {
  name: string;
  message: string;
  onRetry: () => void;
}) {
  const { color } = useTheme();
  return (
    <View
      testID={`safe-boundary-${name}`}
      accessibilityRole="alert"
      style={[styles.card, { backgroundColor: color.surface, borderColor: color.border }]}
    >
      <Text variant="body" weight="medium" color={color.text}>
        {message}
      </Text>
      <Button
        variant="secondary"
        label="Retry"
        onPress={onRetry}
        testID={`safe-boundary-retry-${name}`}
      />
    </View>
  );
}

export function SafeBoundary(props: SafeBoundaryProps): ReactNode {
  return <BoundaryCore {...props} />;
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.md,
    padding: space.lg,
    margin: space.md,
    borderWidth: 1,
    borderRadius: radius.lg,
  },
});
