import { StyleSheet, View } from "react-native";
import { useTheme } from "../theme.tsx";
import { radius, space } from "../tokens.ts";
import { Icon } from "./Icon.tsx";
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
 * One line of the live transcript, as a chat bubble: the customer in blue on the start side (their
 * words trigger cards, R4), the agent in amber on the end side (owner, 22 Oct); system lines
 * (escalations) use the notice style.
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
  const c = theme.speaker[speaker];
  return (
    <View
      testID={testID}
      style={[
        styles.line,
        { backgroundColor: c.fill, alignSelf: customer ? "flex-start" : "flex-end" },
        customer ? styles.customer : styles.agent,
      ]}
    >
      <View style={styles.head}>
        <Icon name={customer ? "mic" : "headphones"} size={13} color={c.label} />
        <Text variant="label" weight="semibold" color={c.label}>
          {speakerLabel}
        </Text>
        {time ? (
          <Text variant="label" color={c.label}>
            {time}
          </Text>
        ) : null}
      </View>
      <Text variant="body" color={c.text}>
        {text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  line: {
    gap: 2,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    maxWidth: "92%",
  },
  customer: { borderTopStartRadius: radius.sm },
  agent: { borderTopEndRadius: radius.sm },
  head: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  system: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
});
