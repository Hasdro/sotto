/**
 * Style Memory route accessible to all signed-in roles (A4): opened from the agent's
 * post-call feedback toast or direct navigation.
 */
import { Screen, space } from "@sotto/ui";
import { ScrollView, StyleSheet } from "react-native";
import { FeatureGate } from "../components/FeatureGate";
import { SafeBoundary } from "../components/SafeBoundary";
import { StyleMemoryScreen } from "../features/postcall/StyleMemoryScreen";

export default function StyleMemoryRoute() {
  return (
    <SafeBoundary name="memory.view">
      <Screen>
        <ScrollView contentContainerStyle={styles.page}>
          <FeatureGate feature="style_memory">
            <StyleMemoryScreen />
          </FeatureGate>
        </ScrollView>
      </Screen>
    </SafeBoundary>
  );
}

const styles = StyleSheet.create({
  page: {
    width: "100%",
    maxWidth: 760,
    alignSelf: "center",
    padding: space.xl,
  },
});
