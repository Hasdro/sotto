import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { radius, space } from "../tokens.ts";
import { Text } from "./Text.tsx";

export type TranscriptSpeaker = "customer" | "agent" | "system";

export type TranscriptLineProps = {
  speaker: TranscriptSpeaker;
  /** Localised speaker name, e.g. "Customer", "You". */
  speakerLabel: string;
  text: string;
  /** Optional time stamp, e.g. "01:24". */
  time?: string;
  testID?: string;
};

/**
 * One line of the live transcript. The customer's words carry the weight (they are what
 * triggers cards, R4); the agent's own words are muted; system lines (escalations) use the notice style.
 */
export function TranscriptLine({ speaker, speakerLabel, text, time, testID }: TranscriptLineProps) {
  const theme = useTheme();
  if (speaker === "system") {
    return (
      <View
        testID={testID}
        style={[
          styles.system,
          { backgroundColor: theme.color.noticeFill, borderColor: theme.color.noticeBorder },
        ]}
      >
        <Text variant="label" weight="medium" tone="notice">
          {speakerLabel}
        </Text>
        <Text variant="label" tone="notice">
          {text}
        </Text>
      </View>
    );
  }
  const customer = speaker === "customer";
  return (
    <View testID={testID} style={styles.line}>
      <View style={styles.head}>
        <Text variant="label" weight="semibold" tone={customer ? "primary" : "muted"}>
          {speakerLabel}
        </Text>
        {time ? (
          <Text variant="label" tone="muted">
            {time}
          </Text>
        ) : null}
      </View>
      <Text variant="body" tone={customer ? "default" : "muted"}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: { gap: 2, paddingVertical: space.xs },
  head: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  system: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
});
