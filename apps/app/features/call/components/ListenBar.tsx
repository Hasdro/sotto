import { Badge, Button, radius, size, space, Text, useTheme } from "@sotto/ui";
import { StyleSheet, View } from "react-native";
import { desktop, type PrivacyPane } from "../../../lib/desktop";
import type { StringKey } from "../../../lib/i18n";
import { useI18n } from "../../../lib/locale";
import { isWindows } from "../../../lib/platform";
import type { AudioSource } from "../mic";
import { type CallTextKey, useCallText } from "../strings";
import type { MicState } from "../useCallSession";

type Os = "mac" | "windows" | "other";

/**
 * UX-21: what a failed start says and which OS privacy pane fixes it. The desktop app names the
 * exact setting; the browser keeps its own copy (no settings button there). Pure.
 */
export function permissionHelp(
  state: MicState,
  source: AudioSource,
  inDesktop: boolean,
  os: Os,
): { text: { call: CallTextKey } | { app: StringKey }; pane: PrivacyPane | null } | null {
  if (state !== "denied" && state !== "unsupported") return null;
  const denied = state === "denied";
  if (inDesktop && os === "mac" && denied) {
    return source === "computer"
      ? { text: { call: "perm.systemAudioMac" }, pane: "system-audio" }
      : { text: { call: "perm.micMac" }, pane: "mic" };
  }
  if (inDesktop && os === "windows" && denied) {
    return source === "computer"
      ? { text: { app: "call.listen.computerDeniedWindows" }, pane: "mic" }
      : { text: { call: "perm.micWindows" }, pane: "mic" };
  }
  if (inDesktop && source === "mic") return { text: { call: "perm.noMicDesktop" }, pane: null };
  return {
    text: {
      app:
        source === "computer"
          ? denied
            ? "call.listen.computerDenied"
            : "call.listen.computerUnsupported"
          : denied
            ? "call.mic.denied"
            : "call.mic.unsupported",
    },
    pane: null,
  };
}

function osOf(): Os {
  if (isWindows()) return "windows";
  const ua = (globalThis as { navigator?: { userAgent?: string } }).navigator?.userAgent ?? "";
  return /Mac/i.test(ua) ? "mac" : "other";
}

type Props = {
  state: MicState;
  source: AudioSource;
  vendor: string | null;
  partial: string | null;
  onToggle: () => void;
};

/**
 * During a real call (D-024): what Sotto is listening to, a pause button, and the words heard so
 * far. No typing: lines come only from the customer's audio. The microphone shows the R4
 * "approximate" badge, because it can also hear the agent.
 */
export function ListenBar({ state, source, vendor, partial, onToggle }: Props) {
  const { t } = useI18n();
  const tc = useCallText();
  const { color } = useTheme();
  const win = isWindows();
  const os = osOf();
  const bridge = desktop();
  const on = state === "on" || state === "starting";
  const help = permissionHelp(state, source, bridge !== null, os);
  const problem = help !== null;
  const pane = help?.pane && bridge?.openPrivacySettings ? help.pane : null;
  const status = help
    ? "call" in help.text
      ? tc(help.text.call)
      : t(help.text.app)
    : state === "starting"
      ? t(win ? "call.listen.startingWindows" : "call.listen.starting")
      : on
        ? t(source === "computer" ? "call.listen.onComputer" : "call.listen.onMic", {
            vendor: vendor ?? "",
          })
        : t("call.listen.paused");
  return (
    <View
      style={[styles.wrap, { borderTopColor: color.border, backgroundColor: color.surface }]}
      testID="listen-bar"
    >
      {partial ? (
        <Text
          variant="label"
          tone="muted"
          numberOfLines={2}
          testID="partial"
          accessibilityLiveRegion="polite"
        >
          {t("call.hearing", { text: partial })}
        </Text>
      ) : null}
      <View style={styles.row}>
        <Button
          label={t(on ? "call.listen.pause" : "call.listen.resume")}
          variant={on ? "secondary" : "primary"}
          onPress={onToggle}
          testID="mic-toggle"
          leading={
            <View style={[styles.dot, { backgroundColor: on ? color.danger : color.onPrimary }]} />
          }
        />
        <Text variant="label" tone={problem ? "danger" : "muted"} style={styles.status}>
          {status}
        </Text>
        {pane ? (
          <Button
            variant="secondary"
            label={tc(os === "windows" ? "perm.openWindows" : "perm.openMac")}
            onPress={() => void bridge?.openPrivacySettings?.(pane)?.catch(() => {})}
            testID="open-privacy"
          />
        ) : null}
        {source === "mic" ? (
          <Badge tone="objection" label={t("call.listen.approximate")} testID="approximate" />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, padding: space.md, borderTopWidth: 1 },
  row: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  status: { flexShrink: 1 },
  dot: { width: size.dot, height: size.dot, borderRadius: radius.pill },
});
