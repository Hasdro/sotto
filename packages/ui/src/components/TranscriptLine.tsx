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
 * One line of the live transcript, as a chat bubble: the customer in the reference's bubble gray on
 * the start side with a blue label (their words trigger cards, R4), the agent in the lighter gray
 * on the end side (owner, 22 Oct; restyled D-041); system lines
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
    // The reference bubble: 22 px with one 6 px tail corner on the speaker's side, flat fill.
    paddingVertical: space.sm + 3,
    paddingHorizontal: space.md + 3,
    borderRadius: radius.xl,
    maxWidth: "86%",
  },
  customer: { borderBottomStartRadius: radius.sm },
  agent: { borderBottomEndRadius: radius.sm },
  head: { flexDirection: "row", alignItems: "baseline", gap: space.sm },
  system: {
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    gap: 2,
  },
});
