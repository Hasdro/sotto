/**
 * Admin route for Style Memory (R3, A4): delegates to shared StyleMemoryScreen inside FeatureGate
 * and Agent 4's real SafeBoundary.
 */
import { FeatureGate } from "../../components/FeatureGate";
import { SafeBoundary } from "../../components/SafeBoundary";
import { StyleMemoryScreen } from "../../features/postcall/StyleMemoryScreen";

export default function AdminStyleMemoryRoute() {
  return (
    <FeatureGate feature="style_memory">
      <SafeBoundary name="admin.memory">
        <StyleMemoryScreen />
      </SafeBoundary>
    </FeatureGate>
  );
}
