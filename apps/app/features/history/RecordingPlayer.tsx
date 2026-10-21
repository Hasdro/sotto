/** Plays a call's recording, from this device or the server (owner, 21–22 Oct). Web and
 * desktop only; shows nothing when the call has no recording. */
import { Panel, space, Text } from "@sotto/ui";
import { createElement, useEffect, useState } from "react";
import { Platform, StyleSheet } from "react-native";
import { cloudBlob } from "../../lib/cloud";
import { useI18n } from "../../lib/locale";
import { recording } from "../../lib/recordings";

export function RecordingPlayer({ callId }: { callId: string }) {
  const { t } = useI18n();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (Platform.OS !== "web") return;
    let made: string | null = null;
    let live = true;
    // This device's copy first; otherwise the server's (a manager playing an agent's call).
    void recording(callId)
      .then((b) => b ?? cloudBlob(`/api/v1/recordings/${encodeURIComponent(callId)}`))
      .then((blob) => {
        if (!blob || !live) return;
        made = URL.createObjectURL(blob);
        setUrl(made);
      });
    return () => {
      live = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [callId]);
  if (!url) return null;
  return (
    <Panel style={styles.panel} testID="recording">
      <Text variant="label" weight="medium" tone="muted" accessibilityRole="header">
        {t("history.detail.recording")}
      </Text>
      {createElement("audio", {
        src: url,
        controls: true,
        preload: "metadata",
        style: { width: "100%" },
        "aria-label": t("history.detail.recording"),
      })}
    </Panel>
  );
}

const styles = StyleSheet.create({ panel: { gap: space.sm, marginBottom: space.xl } });
