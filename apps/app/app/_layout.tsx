import { IBMPlexSansArabic_400Regular } from "@expo-google-fonts/ibm-plex-sans-arabic/400Regular";
import { IBMPlexSansArabic_500Medium } from "@expo-google-fonts/ibm-plex-sans-arabic/500Medium";
import { IBMPlexSansArabic_600SemiBold } from "@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold";
import { Inter_400Regular } from "@expo-google-fonts/inter/400Regular";
import { Inter_500Medium } from "@expo-google-fonts/inter/500Medium";
import { Inter_600SemiBold } from "@expo-google-fonts/inter/600SemiBold";
import { UIProvider, useTheme } from "@sotto/ui";
import { useFonts } from "expo-font";
import { Slot, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, StyleSheet, View } from "react-native";
import { AccessGate } from "../components/AccessGate";
import { AppShell } from "../components/AppShell";
import { SafeBoundary } from "../components/SafeBoundary";
import { CallSessionProvider } from "../features/call/CallSessionProvider";
import { EscalationStoreProvider } from "../features/escalations/store";
import { LocaleProvider, useI18n } from "../lib/locale";
import { usePrefs } from "../lib/prefs";
import { RoleProvider } from "../lib/role";

export default function RootLayout() {
  // Font keys must match packages/ui fontFamily + arabicFontFamily (DESIGN-SYSTEM §3.3, D-041).
  const [loaded, error] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
  });
  if (!loaded && !error) return null;
  return (
    <LocaleProvider>
      <RoleProvider>
        <EscalationStoreProvider>
          <Root />
        </EscalationStoreProvider>
      </RoleProvider>
    </LocaleProvider>
  );
}

function Root() {
  const { dir } = useI18n();
  const { theme } = usePrefs();
  return (
    <UIProvider direction={dir} scheme={theme === "system" ? null : theme}>
      <Themed dir={dir} />
    </UIProvider>
  );
}

function Themed({ dir }: { dir: "ltr" | "rtl" }) {
  const { color } = useTheme();
  // The desktop mini window shows the main window's card: no menu, no sign-in, no call of its own.
  // The password-reset page (UX-39r) is opened signed out, from the reset email.
  const pathname = usePathname();
  const bare = pathname === "/mini" || pathname === "/reset-password";
  return (
    <View
      // react-native-web reads `dir` to resolve start/end in inline styles; native uses `direction`.
      {...(Platform.OS === "web" ? { dir } : {})}
      style={[styles.root, { direction: dir, backgroundColor: color.background }]}
    >
      <StatusBar style="auto" />
      {bare ? (
        <SafeBoundary name="screen"><Slot /></SafeBoundary>
      ) : (
        <SafeBoundary name="app.root"><AccessGate>
          <CallSessionProvider>
            <AppShell>
              <SafeBoundary name="screen"><Slot /></SafeBoundary>
            </AppShell>
          </CallSessionProvider>
        </AccessGate></SafeBoundary>
      )}
    </View>
  );
}

const styles = StyleSheet.create({ root: { flex: 1 } });
