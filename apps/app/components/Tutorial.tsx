/**
 * The practice tutorial (owner decision T-038, 21 Oct): a short walkthrough shown after sign-in,
 * with a practice card that writes itself, a "Don't show this again" box, and a replay button in
 * Settings. Nothing here touches the server or the call history.
 */
import {
  Button,
  Icon,
  Mascot,
  type MascotState,
  radius,
  SuggestionCard,
  space,
  Text,
  useTheme,
} from "@sotto/ui";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Modal, Pressable, StyleSheet, View } from "react-native";
import { cardStrings } from "../features/call/components/strings";
import type { StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { setPrefs, usePrefs } from "../lib/prefs";
import { useCloud } from "../lib/useCloud";

export type Step = {
  mascot: MascotState;
  title: StringKey;
  body: StringKey;
  demo?: "card" | "colors";
};

const STEPS: readonly Step[] = [
  { mascot: "idle", title: "tutorial.1.title", body: "tutorial.1.body" },
  { mascot: "listening", title: "tutorial.2.title", body: "tutorial.2.body" },
  { mascot: "thinking", title: "tutorial.3.title", body: "tutorial.3.body", demo: "card" },
  { mascot: "suggesting", title: "tutorial.4.title", body: "tutorial.4.body", demo: "colors" },
  { mascot: "reviewing", title: "tutorial.5.title", body: "tutorial.5.body" },
];

/** ZC A15 (UX-10): the first-run checklist on Home guides a new person; the tutorial opens only
 * when asked for (Settings › Advanced › Play the tutorial). */
export function Tutorial() {
  const cloud = useCloud();
  const { tutorialRequested } = usePrefs();
  if (cloud.status !== "signed_in" || !tutorialRequested) return null;
  return (
    <TutorialDialog
      onClose={(never) =>
        setPrefs({ tutorialRequested: false, ...(never ? { tutorialDone: true } : {}) })
      }
    />
  );
}

export function TutorialDialog({
  onClose,
  steps = STEPS,
  testID = "tutorial",
}: {
  onClose: (never: boolean) => void;
  steps?: readonly Step[];
  testID?: string;
}) {
  const { t } = useI18n();
  const { color } = useTheme();
  const [i, setI] = useState(0);
  const [never, setNever] = useState(false);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    fade.setValue(0);
    Animated.timing(fade, {
      toValue: 1,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [fade]);
  const step = steps[i] as Step;
  const last = i === steps.length - 1;
  return (
    <Modal transparent visible animationType="fade" onRequestClose={() => onClose(never)}>
      <View style={[styles.scrim, { backgroundColor: `${color.scrim}99` }]}>
        <View
          testID={testID}
          accessibilityViewIsModal
          style={[styles.sheet, { backgroundColor: color.surface, borderColor: color.border }]}
        >
          <Animated.View
            style={[
              styles.body,
              {
                opacity: fade,
                transform: [
                  { translateY: fade.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) },
                ],
              },
            ]}
          >
            <Mascot state={step.mascot} size={72} />
            <Text
              variant="title"
              weight="semibold"
              style={styles.center}
              accessibilityRole="header"
            >
              {t(step.title)}
            </Text>
            <Text tone="muted" style={styles.center}>
              {t(step.body)}
            </Text>
            {step.demo === "card" ? <PracticeCard /> : null}
            {step.demo === "colors" ? <Colors /> : null}
          </Animated.View>
          <View
            role="group"
            style={styles.dots}
            accessibilityLabel={t("tutorial.step", { n: i + 1, total: steps.length })}
          >
            {steps.map((s, k) => (
              <View
                key={s.title}
                style={[
                  styles.dot,
                  {
                    backgroundColor: k === i ? color.primary : color.border,
                    width: k === i ? 20 : 8,
                  },
                ]}
              />
            ))}
          </View>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: never }}
            aria-checked={never}
            onPress={() => setNever(!never)}
            style={styles.check}
            testID="tutorial-never"
          >
            <View
              style={[
                styles.box,
                {
                  borderColor: never ? color.primary : color.borderStrong,
                  backgroundColor: never ? color.primary : "transparent",
                },
              ]}
            >
              {never ? <Icon name="check" size={14} color={color.onPrimary} /> : null}
            </View>
            <Text variant="label">{t("tutorial.never")}</Text>
          </Pressable>
          <View style={styles.actions}>
            <Button
              variant="ghost"
              label={t("tutorial.skip")}
              onPress={() => onClose(never)}
              testID="tutorial-close"
            />
            <View style={styles.grow} />
            {i > 0 ? (
              <Button variant="secondary" label={t("tutorial.back")} onPress={() => setI(i - 1)} />
            ) : null}
            <Button
              label={t(last ? "tutorial.done" : "tutorial.next")}
              onPress={() => (last ? onClose(never) : setI(i + 1))}
              testID="tutorial-next"
            />
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** The practice: a customer line, then a card writing itself word by word. */
function PracticeCard() {
  const { t } = useI18n();
  const { color } = useTheme();
  const full = t("tutorial.demo.answer");
  const [n, setN] = useState(0);
  const words = full.split(" ");
  useEffect(() => {
    setN(0);
    const id = setInterval(() => setN((k) => (k >= words.length ? k : k + 1)), 120);
    return () => clearInterval(id);
  }, [words.length]);
  return (
    <View style={styles.demo}>
      <View style={[styles.bubble, { backgroundColor: color.surfaceSunken }]}>
        <Text variant="label" tone="muted">
          {t("tutorial.demo.customer")}
        </Text>
        <Text>{t("tutorial.demo.question")}</Text>
      </View>
      <SuggestionCard
        type="answer"
        source="playbook"
        text={words.slice(0, n).join(" ")}
        done={n >= words.length}
        variant="compact"
        strings={cardStrings(t, "answer", "playbook")}
      />
    </View>
  );
}

function Colors() {
  const { t } = useI18n();
  const { card } = useTheme();
  const kinds = ["answer", "question", "objection", "warning", "holding"] as const;
  return (
    <View style={styles.colors}>
      {kinds.map((k) => (
        <View key={k} style={[styles.chip, { backgroundColor: card[k].fill }]}>
          <View style={[styles.chipDot, { backgroundColor: card[k].accent }]} />
          <Text variant="label" weight="medium" color={card[k].text}>
            {t(`card.type.${k}`)}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, alignItems: "center", justifyContent: "center", padding: space.lg },
  sheet: {
    width: 560,
    maxWidth: "100%",
    padding: space.xl,
    gap: space.lg,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
  body: { alignItems: "center", gap: space.md, minHeight: 300 },
  center: { textAlign: "center" },
  dots: { flexDirection: "row", gap: space.xs, alignSelf: "center" },
  dot: { height: 8, borderRadius: 4 },
  check: { flexDirection: "row", alignItems: "center", gap: space.sm, alignSelf: "flex-start" },
  box: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: { flexDirection: "row", alignItems: "center", gap: space.sm, flexWrap: "wrap" },
  grow: { flex: 1 },
  demo: { alignSelf: "stretch", gap: space.sm },
  bubble: {
    padding: space.md,
    borderRadius: radius.md,
    gap: 2,
    alignSelf: "flex-start",
    maxWidth: "85%",
  },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: space.sm, justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.xs,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
    borderRadius: radius.pill,
  },
  chipDot: { width: 8, height: 8, borderRadius: 4 },
});
