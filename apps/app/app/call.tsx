/**
 * In-call screen (R1, R2, R4): the hero of the product.
 *
 * Development builds connect to the local demo bridge (D-013) at EXPO_PUBLIC_DEMO_BRIDGE_URL,
 * default ws://127.0.0.1:8787. `?mock=1` is DEV-ONLY: it replays a canned call through the same
 * decoder and reducer so the screen can be reviewed without the worker (mock-stream.ts).
 * Production builds (`__DEV__` false) do neither and show a neutral Phase 4 state.
 */
import {
  Button,
  EmptyState,
  layout,
  motion,
  Panel,
  Screen,
  space,
  Text,
  Toast,
  useTheme,
} from "@sotto/ui";
import { useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { CallHeader } from "../features/call/components/CallHeader";
import { CardStack } from "../features/call/components/CardStack";
import { Composer } from "../features/call/components/Composer";
import { ScenarioPicker } from "../features/call/components/ScenarioPicker";
import { TranscriptPane } from "../features/call/components/TranscriptPane";
import { demoEnabled } from "../features/call/devGate";
import { type CallSession, useCallSession } from "../features/call/useCallSession";
import { selectCards } from "../features/cards/reducer";
import { useI18n } from "../lib/locale";
import { useIsWide } from "../lib/responsive";

export default function CallScreen() {
  // demoEnabled() is constant for the life of the build, so the hook order never changes.
  return demoEnabled() ? <DemoCallScreen /> : <NotInThisBuild />;
}

function DemoCallScreen() {
  const params = useLocalSearchParams<{ mock?: string }>();
  const { locale } = useI18n();
  const mock = params.mock === "1";
  const session = useCallSession({ mock, locale });
  return <CallView session={session} mock={mock} />;
}

/** Production builds: no local demo bridge and no mock calls (D-013). Exported for tests. */
export function NotInThisBuild() {
  const { t } = useI18n();
  return (
    <Screen testID="call-not-in-build" style={styles.center}>
      <EmptyState title={t("call.notInThisBuild.title")} body={t("call.notInThisBuild.body")} />
    </Screen>
  );
}

/** The screen for a given session; exported for tests. */
export function CallView({ session, mock }: { session: CallSession; mock: boolean }) {
  const { t } = useI18n();
  const wide = useIsWide();
  const { color } = useTheme();
  const { state } = session;
  const notice = state.notice;
  const { dismissNotice } = session;

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => dismissNotice(notice.id), motion.toastMs);
    return () => clearTimeout(id);
  }, [notice, dismissNotice]);

  if (state.connection === "offline") {
    return (
      <Screen testID="call-offline" style={styles.center}>
        <EmptyState
          title={t("call.offline.title")}
          body={t("call.offline.body")}
          code={t("call.offline.command")}
          action={{ label: t("call.offline.retry"), onPress: session.retry }}
        />
      </Screen>
    );
  }
  if (!state.hello) {
    return (
      <Screen testID="call-connecting" style={styles.center}>
        <EmptyState title={t("call.connecting.title")} body={t("call.connecting.body")} />
      </Screen>
    );
  }

  const cards = selectCards(state.cards);
  const live = state.phase === "live";
  const header = (
    <CallHeader
      company={state.hello.company_name}
      phase={state.phase}
      mode={state.hello.mode}
      startedAt={state.startedAt}
      endedAt={state.endedAt}
      mock={mock}
      onEnd={session.end}
      wide={wide}
    />
  );
  const main = (
    <View style={styles.mainStack}>
      {state.phase === "idle" ? (
        <ScenarioPicker scenarios={state.hello.scenarios} onStart={session.start} />
      ) : null}
      {state.phase === "ended" ? (
        <Panel style={styles.ended} testID="call-ended">
          <View style={styles.grow}>
            <Text variant="heading" weight="semibold" accessibilityRole="header">
              {t("call.ended.title")}
            </Text>
            <Text variant="body" tone="muted">
              {t("call.ended.body", { cards: cards.length })}
            </Text>
          </View>
          <Button label={t("call.ended.again")} onPress={() => session.start(null)} />
        </Panel>
      ) : null}
      {state.phase !== "idle" ? <CardStack cards={cards} wide={wide} listening={live} /> : null}
    </View>
  );
  const toast = notice ? (
    <View style={[styles.toast, wide ? styles.toastWide : null]} pointerEvents="none">
      <Toast
        testID="toast"
        title={t(notice.kind === "escalation" ? "call.escalated.title" : "call.error.title")}
        body={notice.kind === "escalation" ? notice.text : t("call.error.body")}
      />
    </View>
  ) : null;

  if (wide) {
    return (
      <View testID="call-live" style={styles.row}>
        <View style={styles.grow}>
          {header}
          <ScrollView contentContainerStyle={styles.mainWide}>{main}</ScrollView>
          {toast}
        </View>
        <View
          style={[styles.side, { backgroundColor: color.surface, borderStartColor: color.border }]}
        >
          <View style={styles.sideScroll}>
            <TranscriptPane lines={state.transcript} scroll />
          </View>
          <Composer onSay={session.say} disabled={!live} />
        </View>
      </View>
    );
  }

  return (
    <View testID="call-live" style={styles.grow}>
      {header}
      <View style={styles.grow}>
        <ScrollView contentContainerStyle={styles.mainNarrow}>
          {main}
          {state.phase !== "idle" ? (
            <TranscriptPane lines={state.transcript} limit={6} scroll={false} />
          ) : null}
        </ScrollView>
        {toast}
      </View>
      {live ? <Composer onSay={session.say} disabled={false} compact /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { justifyContent: "center" },
  grow: { flex: 1 },
  row: { flex: 1, flexDirection: "row" },
  mainStack: { gap: space.xl },
  mainWide: {
    padding: space.xxl,
    width: "100%",
    maxWidth: layout.contentMaxWidth - layout.transcriptWidth,
    alignSelf: "center",
  },
  mainNarrow: { padding: space.lg, gap: space.xl },
  side: { width: layout.transcriptWidth, borderStartWidth: 1 },
  sideScroll: { flex: 1, padding: space.lg },
  ended: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
  toast: { position: "absolute", bottom: space.md, start: space.md, end: space.md },
  toastWide: { bottom: space.xl, start: space.xxl, end: undefined, maxWidth: layout.toastMaxWidth },
});
