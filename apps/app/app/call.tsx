/**
 * In-call screen (R1, R2, R4): the hero of the product.
 *
 * Signed in to a Sotto server (D-022), the call runs on this device and listens to the customer:
 * the computer's sound (Zoom, Google Meet, softphones) or the microphone (D-024). Development
 * builds without a server use the local demo bridge (D-013); `?mock=1` (development only) replays
 * a canned call so the screen can be reviewed without the worker (mock-stream.ts).
 */
import {
  Button,
  EmptyState,
  layout,
  motion,
  Panel,
  Screen,
  Stack,
  space,
  Text,
  Toast,
  useTheme,
} from "@sotto/ui";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { FeatureGate } from "../components/FeatureGate";
import { PostCallPanel } from "../features/actions/PostCallPanel";
import { useSharedCall } from "../features/call/CallSessionProvider";
import { CallHeader } from "../features/call/components/CallHeader";
import { CallNotes } from "../features/call/components/CallNotes";
import { CardStack } from "../features/call/components/CardStack";
import { Composer, type MicControl } from "../features/call/components/Composer";
import { ConfirmEnd } from "../features/call/components/ConfirmEnd";
import { CrmRail } from "../features/call/components/CrmRail";
import { ListenBar } from "../features/call/components/ListenBar";
import { ListenStart, PhoneCallsLater } from "../features/call/components/ListenStart";
import { ScenarioPicker } from "../features/call/components/ScenarioPicker";
import { TranscriptPane } from "../features/call/components/TranscriptPane";
import { demoEnabled } from "../features/call/devGate";
import { computerAudioAvailable } from "../features/call/mic";
import { type CallSession, useCallSession } from "../features/call/useCallSession";
import { selectCards } from "../features/cards/reducer";
import { bindCall, useAttached } from "../features/crm/attached";
import { mockLookup, mockPerform } from "../features/crm/mock";
import { EmailAction } from "../features/email";
import { useEscalations } from "../features/escalations/store";
import { CallReviewPanel } from "../features/review/CallReviewPanel";
import { FollowUp } from "../features/review/FollowUp";
import { WhatsAppAction } from "../features/whatsapp";
import { useI18n } from "../lib/locale";
import { useIsWide } from "../lib/responsive";

export default function CallScreen() {
  // demoEnabled() is constant for the life of the build, so the hook order never changes.
  return demoEnabled() ? <DemoCallScreen /> : <NotInThisBuild />;
}

function DemoCallScreen() {
  const params = useLocalSearchParams<{ mock?: string }>();
  const mock = __DEV__ && params.mock === "1"; // never in a release build (D-024)
  return mock ? <MockCallScreen /> : <SharedCallScreen />;
}

/** The real call: held by CallSessionProvider, so leaving this screen keeps it live (T-025). */
function SharedCallScreen() {
  const { session, activate } = useSharedCall();
  useEffect(activate, [activate]);
  // An escalated question is now in the manager's inbox on the server: refresh the badge.
  const { reload } = useEscalations();
  const escalated = session.state.escalations.length;
  useEffect(() => {
    if (escalated > 0) reload();
  }, [escalated, reload]);
  return <CallView session={session} mock={false} />;
}

/** `?mock=1` (development only): a canned call owned by this screen alone. */
function MockCallScreen() {
  const { locale } = useI18n();
  const session = useCallSession({ mock: true, locale });
  return <CallView session={session} mock />;
}

/** Production builds: no local demo bridge and no mock calls (D-013). Exported for tests. */
export function NotInThisBuild() {
  const { t } = useI18n();
  return (
    <Screen testID="call-not-in-build" style={styles.center}>
      <EmptyState
        mascot="offline"
        title={t("call.notInThisBuild.title")}
        body={t("call.notInThisBuild.body")}
      />
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
  const [confirming, setConfirming] = useState(false);
  // Density rule (T-050): the live call shows the card, the status and one collapsed rail toggle.
  const [railOpen, setRailOpen] = useState(false);
  const live = state.phase === "live";
  // A new call starts with a clean brief, unless a meeting was picked for it on Home.
  useEffect(() => bindCall(state.callId), [state.callId]);
  useEffect(() => {
    if (!live) setConfirming(false);
  }, [live]);

  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => dismissNotice(notice.id), motion.toastMs);
    return () => clearTimeout(id);
  }, [notice, dismissNotice]);

  if (state.connection === "offline") {
    return (
      <Screen testID="call-offline" style={styles.center}>
        <EmptyState
          mascot="offline"
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
  const vendor = state.hello.stt_vendor ?? null;
  // Practice (development only): scripted scenarios or the mock stream, with typed lines. A real
  // account has neither (D-024): the call is heard, never typed.
  const practice = mock || state.hello.scenarios.length > 0;
  const mic: MicControl | null =
    vendor && !mock && Platform.OS === "web"
      ? { state: session.mic, vendor, onToggle: () => session.toggleMic() }
      : null;
  const listenBar = (
    <ListenBar
      state={session.mic}
      source={session.source}
      vendor={vendor}
      partial={state.partial}
      onToggle={() => session.toggleMic()}
    />
  );
  const header = (
    <CallHeader
      company={state.hello.company_name}
      phase={state.phase}
      mode={state.hello.mode}
      startedAt={state.startedAt}
      endedAt={state.endedAt}
      mock={mock}
      onEnd={() => setConfirming(true)}
      wide={wide}
      rail={
        state.phase === "idle" ? null : { open: railOpen, onToggle: () => setRailOpen((o) => !o) }
      }
    />
  );
  const showRail = railOpen && state.phase !== "idle";
  // R10: Zoho lookup in the rail; the dev mock call uses canned records (never in a release).
  const crm = (
    <CrmRail lookup={mock ? mockLookup : undefined} perform={mock ? mockPerform : undefined} />
  );
  const controls = practice ? (
    live ? (
      <Composer
        onSay={session.say}
        disabled={false}
        compact={!wide}
        mic={mic}
        partial={state.partial}
      />
    ) : null
  ) : live ? (
    listenBar
  ) : null;
  const confirm = (
    <ConfirmEnd
      open={confirming}
      onCancel={() => setConfirming(false)}
      onConfirm={() => {
        setConfirming(false);
        session.end();
      }}
    />
  );
  const main = (
    <View style={styles.mainStack}>
      {state.phase === "idle" && practice ? (
        <ScenarioPicker scenarios={state.hello.scenarios} onStart={session.start} />
      ) : null}
      {state.phase === "idle" && !practice ? (
        Platform.OS === "web" ? (
          <ListenStart computer={computerAudioAvailable()} onStart={session.startListening} />
        ) : (
          <PhoneCallsLater />
        )
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
          <Button
            label={t("call.ended.again")}
            onPress={() =>
              practice ? session.start(null) : session.startListening(session.source)
            }
          />
        </Panel>
      ) : null}
      {state.phase === "ended" && (!practice || mock) ? (
        // R12 (T-061): Zoho writes, each approved on its own card, and the follow-up slot.
        <PostCallPanel
          perform={mock ? mockPerform : undefined}
          slot={<MessagingSlot callId={state.callId ?? null} />}
        />
      ) : null}
      {state.phase === "ended" && !practice ? (
        <FeatureGate feature="call_review">
          <CallReviewPanel callId={state.callId ?? null} />
        </FeatureGate>
      ) : null}
      {state.phase === "ended" && !practice ? (
        <FeatureGate feature="follow_up">
          <FollowUp callId={state.callId ?? null} />
        </FeatureGate>
      ) : null}
      {state.phase !== "idle" ? (
        <CardStack cards={cards} wide={wide} listening={live} speaking={Boolean(state.partial)} />
      ) : null}
    </View>
  );
  const toast = notice ? (
    <View style={[styles.toast, wide ? styles.toastWide : null]} pointerEvents="none">
      <Toast
        testID="toast"
        title={t(
          notice.kind === "escalation"
            ? "call.escalated.title"
            : notice.kind === "info"
              ? "call.notice.title"
              : "call.error.title",
        )}
        body={notice.kind === "error" ? t("call.error.body") : notice.text}
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
          {confirm}
          {controls}
        </View>
        {showRail ? (
          <View
            testID="call-rail"
            accessibilityLabel={t("call.rail.title")}
            role="complementary"
            style={[
              styles.side,
              { backgroundColor: color.surface, borderStartColor: color.border },
            ]}
          >
            <ScrollView style={styles.sideCrm} contentContainerStyle={styles.sideCrmBody}>
              {crm}
            </ScrollView>
            <View style={styles.sideScroll}>
              <TranscriptPane lines={state.transcript} scroll />
            </View>
            {!practice ? (
              <View style={styles.sideNotes}>
                <CallNotes />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <View testID="call-live" style={styles.grow}>
      {header}
      <View style={styles.grow}>
        <ScrollView contentContainerStyle={styles.mainNarrow}>
          {main}
          {showRail ? (
            <View
              testID="call-rail"
              accessibilityLabel={t("call.rail.title")}
              role="complementary"
              style={styles.railNarrow}
            >
              {crm}
              <TranscriptPane lines={state.transcript} limit={6} scroll={false} />
              {!practice ? <CallNotes /> : null}
            </View>
          ) : null}
        </ScrollView>
        {toast}
        {confirm}
      </View>
      {controls}
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
  railNarrow: { gap: space.xl },
  side: { width: layout.transcriptWidth, borderStartWidth: 1 },
  sideScroll: { flex: 1, padding: space.lg },
  sideCrm: { flexGrow: 0, maxHeight: "55%" },
  sideCrmBody: { padding: space.lg, paddingBottom: 0 },
  sideNotes: { paddingHorizontal: space.lg, paddingBottom: space.md },
  ended: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.md },
  toast: { position: "absolute", bottom: space.md, start: space.md, end: space.md },
  toastWide: { bottom: space.xl, start: space.xxl, end: undefined, maxWidth: layout.toastMaxWidth },
});

/** R12 (T-063/T-065): email and WhatsApp after the call, prefilled from the attached Zoho record.
 * Each action greys or hides itself from the feature map and sends only after its own confirm. */
function MessagingSlot({ callId }: { callId: string | null }) {
  const crm = useAttached();
  const person = crm.kind === "attached" ? crm.brief.person : null;
  return (
    <Stack gap="md">
      <EmailAction callId={callId} customer={{ name: person?.name, email: person?.email }} />
      <WhatsAppAction callId={callId} customer={{ name: person?.name, phone: person?.phone }} />
    </Stack>
  );
}
