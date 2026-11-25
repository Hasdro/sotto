/**
 * Admin wrapper for the Role-aware Setup Guide (L2), wrapped in SafeBoundary + FeatureGate.
 * Re-exports `SetupGuideView` and `StepTester` for backwards-compatible imports.
 */
import { Screen, space } from "@sotto/ui";
import { ScrollView, StyleSheet } from "react-native";
import { FeatureGate } from "../../components/FeatureGate";
import { SafeBoundary } from "../../components/SafeBoundary";
import {
  LiveSetupGuide,
  SetupGuideView,
  type StepTester,
} from "../../features/home/SetupGuideContent";

export { SetupGuideView, type StepTester };

export default function AdminSetupScreen() {
  return (
    <SafeBoundary name="admin.setup">
      <Screen>
        <ScrollView contentContainerStyle={styles.page}>
          <FeatureGate feature="setup_guide">
            <LiveSetupGuide />
          </FeatureGate>
        </ScrollView>
      </Screen>
    </SafeBoundary>
  );
}

const styles = StyleSheet.create({
  page: {
    padding: space.xl,
    maxWidth: 760,
    width: "100%",
    alignSelf: "center",
  },
});
