/**
 * Setup Guide route accessible to all roles (agents, managers, admins), gated by `setup_guide`
 * and protected by SafeBoundary.
 */
import { Screen, space } from "@sotto/ui";
import { ScrollView, StyleSheet } from "react-native";
import { FeatureGate } from "../components/FeatureGate";
import { SafeBoundary } from "../components/SafeBoundary";
import { LiveSetupGuide } from "../features/home/SetupGuideContent";

export default function SetupScreen() {
  return (
    <SafeBoundary name="setup">
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
