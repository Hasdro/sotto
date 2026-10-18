import { space, type } from "@sotto/ui";
import { StyleSheet, Text, View } from "react-native";
import { t } from "../lib/i18n";
import { useTheme } from "../lib/theme";

export default function Home() {
  const theme = useTheme();
  return (
    <View testID="home" style={[styles.screen, { backgroundColor: theme.color.background }]}>
      <Text accessibilityRole="header" style={[type.title, { color: theme.color.text }]}>
        {t("home.title")}
      </Text>
      <Text style={[type.body, { color: theme.color.textMuted }]}>{t("home.subtitle")}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.sm,
    padding: space.lg,
  },
});
