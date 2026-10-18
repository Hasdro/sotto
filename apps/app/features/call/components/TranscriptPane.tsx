import { space, Text, TranscriptLine } from "@sotto/ui";
import { useRef } from "react";
import { ScrollView, type ScrollViewInstance, StyleSheet, View } from "react-native";
import { useI18n } from "../../../lib/locale";
import type { TranscriptEntry } from "../session";
import { clock } from "./strings";

type Props = {
  lines: readonly TranscriptEntry[];
  /** In the narrow layout the transcript sits under the cards and shows only the latest lines. */
  limit?: number;
  scroll: boolean;
};

/** Secondary to the cards (DESIGN.md §5): customer lines carry weight, the agent's are muted. */
export function TranscriptPane({ lines, limit, scroll }: Props) {
  const { t } = useI18n();
  const ref = useRef<ScrollViewInstance>(null);
  const shown = limit ? lines.slice(-limit) : lines;
  const body =
    shown.length === 0 ? (
      <Text variant="body" tone="muted">
        {t("call.transcript.empty")}
      </Text>
    ) : (
      shown.map((l) => (
        <TranscriptLine
          key={l.id}
          speaker={l.speaker}
          speakerLabel={
            l.system === "connection_lost"
              ? t("call.connectionLost.title")
              : t(`call.speaker.${l.speaker}`)
          }
          text={l.system === "connection_lost" ? t("call.connectionLost.body") : l.text}
          time={l.speaker === "system" ? undefined : clock(l.atMs)}
        />
      ))
    );
  return (
    <View style={scroll ? styles.fill : null}>
      <Text
        variant="label"
        weight="medium"
        tone="muted"
        accessibilityRole="header"
        style={styles.head}
      >
        {t("call.transcript")}
      </Text>
      {scroll ? (
        <ScrollView
          ref={ref}
          style={styles.fill}
          contentContainerStyle={styles.list}
          onContentSizeChange={() => ref.current?.scrollToEnd({ animated: false })}
        >
          {body}
        </ScrollView>
      ) : (
        <View style={styles.list}>{body}</View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  head: { marginBottom: space.sm },
  list: { gap: space.sm, paddingBottom: space.md },
});
