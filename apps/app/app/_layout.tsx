import { ReadexPro_400Regular } from "@expo-google-fonts/readex-pro/400Regular";
import { ReadexPro_500Medium } from "@expo-google-fonts/readex-pro/500Medium";
import { ReadexPro_600SemiBold } from "@expo-google-fonts/readex-pro/600SemiBold";
import { UIProvider, useTheme } from "@sotto/ui";
import { useFonts } from "expo-font";
import { Slot } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { AccessGate } from "../components/AccessGate";
import { AppShell } from "../components/AppShell";
import { CallSessionProvider } from "../features/call/CallSessionProvider";
import { EscalationStoreProvider } from "../features/escalations/store";
import { PromptStoreProvider } from "../features/prompts/store";
import { LocaleProvider, useI18n } from "../lib/locale";
import { RoleProvider } from "../lib/role";

export default function RootLayout() {
  // Font keys must match packages/ui fontFamily (DESIGN.md §4).
  const [loaded, error] = useFonts({
    ReadexPro_400Regular,
    ReadexPro_500Medium,
    ReadexPro_600SemiBold,
  });
  if (!loaded && !error) return null;
  return (
    <LocaleProvider>
      <RoleProvider>
        <EscalationStoreProvider>
          <PromptStoreProvider>
            <Root />
          </PromptStoreProvider>
        </EscalationStoreProvider>
      </RoleProvider>
    </LocaleProvider>
  );
}

function Root() {
  const { dir } = useI18n();
  return (
    <UIProvider direction={dir}>
      <Themed dir={dir} />
    </UIProvider>
  );
}

function Themed({ dir }: { dir: "ltr" | "rtl" }) {
  const { color } = useTheme();
  return (
    <View
      // react-native-web reads `dir` to resolve start/end in inline styles; native uses `direction`.
      {...(Platform.OS === "web" ? { dir } : {})}
      style={[styles.root, { direction: dir, backgroundColor: color.background }]}
    >
      <StatusBar style="auto" />
      <AccessGate>
        <CallSessionProvider>
          <AppShell>
            <Slot />
          </AppShell>
        </CallSessionProvider>
      </AccessGate>
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
