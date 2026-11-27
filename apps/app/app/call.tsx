/**
 * In-call screen (R1, R2, R4): the hero of the product.
 *
 * Signed in to a Sotto server (D-022), the call runs on this device and listens to the customer:
 * the computer's sound (Zoom, Google Meet, softphones) or the microphone (D-024). Development
 * builds without a server use the local demo bridge (D-013); `?mock=1` (development only) replays
 * a canned call so the screen can be reviewed without the worker (mock-stream.ts).
 * `/call?practice=1` (D-073) offers the neutral practice script in any account: labelled
 * "Practice", never saved, rated or uploaded (features/call/practice.ts).
 */
import { EmptyState, layout, motion, Screen, Sheet, space, Toast, useTheme } from "@sotto/ui";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { useFeature } from "../components/FeatureGate";
import { SafeBoundary } from "../components/SafeBoundary";
import { useSharedCall } from "../features/call/CallSessionProvider";
import { useCallApp } from "../features/call/callApp";
import { AudioCheck } from "../features/call/components/AudioCheck";
import { CallHeader } from "../features/call/components/CallHeader";
import { CallNotes } from "../features/call/components/CallNotes";
import { CardStack } from "../features/call/components/CardStack";
import { Composer, type MicControl } from "../features/call/components/Composer";
import { ConfirmEnd } from "../features/call/components/ConfirmEnd";
import { CrmRail } from "../features/call/components/CrmRail";
import { EndedView } from "../features/call/components/EndedView";
import { ListenBar } from "../features/call/components/ListenBar";
import { ListenStart, PhoneCallsLater } from "../features/call/components/ListenStart";
import { PracticeStart } from "../features/call/components/PracticeStart";
import { PreparedNote } from "../features/call/components/PreparedNote";
import { ScenarioPicker } from "../features/call/components/ScenarioPicker";
import { TalkMeter } from "../features/call/components/TalkMeter";
import { TranscriptPane } from "../features/call/components/TranscriptPane";
import { demoEnabled } from "../features/call/devGate";
import { computerAudioAvailable } from "../features/call/mic";
import { practiceScenario, usePracticeRun } from "../features/call/practice";
import { useCallText } from "../features/call/strings";
import { type CallSession, useCallSession } from "../features/call/useCallSession";
import { selectCards } from "../features/cards/reducer";
import { bindCall, useAttachedState } from "../features/crm/attached";
import { mockLookup, mockPerform } from "../features/crm/mock";
import { useEscalations } from "../features/escalations/store";
import { desktop } from "../lib/desktop";
import { useI18n } from "../lib/locale";
import { prefs, setPrefs } from "../lib/prefs";
import { useIsWide } from "../lib/responsive";
import { useCloud } from "../lib/useCloud";

export default function CallScreen() {
  // demoEnabled() is constant for the life of the build, so the hook order never changes.
  return demoEnabled() ? <DemoCallScreen /> : <NotInThisBuild />;
}

function DemoCallScreen() {
  const params = useLocalSearchParams<{
    mock?: string;
    prepare?: string;
    check?: string;
    practice?: string;
  }>();
  const mock = __DEV__ && params.mock === "1"; // never in a release build (D-024)
  // Home's "Prepare" (UX-03h): `/call?prepare=1` opens the rail on the brief editor.
  // Home's "Test audio" (UX-10, ZC-08): `/call?check=audio` opens the level check.
  // Home's "Try a practice call" (D-073): `/call?practice=1` opens the practice start.
  const opts = {
    prepare: params.prepare === "1",
    check: params.check === "audio",
    practice: params.practice === "1",
  };
  return mock ? <MockCallScreen {...opts} /> : <SharedCallScreen {...opts} />;
}
type Opts = { prepare: boolean; check: boolean; practice: boolean };

/** The real call: held by CallSessionProvider, so leaving this screen keeps it live (T-025). */
function SharedCallScreen(opts: Opts) {
  const { session, activate } = useSharedCall();
  useEffect(activate, [activate]);
  // An escalated question is now in the manager's inbox on the server: refresh the badge.
  const { reload } = useEscalations();
  const escalated = session.state.escalations.length;
  useEffect(() => {
    if (escalated > 0) reload();
  }, [escalated, reload]);
  return <CallView session={session} mock={false} {...opts} />;
}

/** `?mock=1` (development only): a canned call owned by this screen alone. */
function MockCallScreen(opts: Opts) {
  const { locale } = useI18n();
  const session = useCallSession({ mock: true, locale });
  return <CallView session={session} mock {...opts} />;
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
export function CallView({
  session,
  mock,
  prepare = false,
  check = false,
  practice: askPractice = false,
}: {
  session: CallSession;
  mock: boolean;
  /** `/call?prepare=1`: open the rail on the brief editor before the call. */
  prepare?: boolean;
  /** `/call?check=audio`: open the 5-second audio check (ZC-08). */
  check?: boolean;
  /** `/call?practice=1`: open the practice start (D-073). */
  practice?: boolean;
}) {
  const { t } = useI18n();
  const tc = useCallText();
  const wide = useIsWide();
  const { color } = useTheme();
  const { state } = session;
  const notice = state.notice;
  const { dismissNotice } = session;
  const [confirming, setConfirming] = useState(false);
  const talkMeterGate = useFeature("talk_meter");
  const talkDurations = useMemo(() => {
    let agentMs = 0;
    let customerMs = 0;
    for (const e of state.transcript) {
      const words = e.text.trim() ? e.text.trim().split(/\s+/).length : 0;
      const ms = words > 0 ? Math.max(500, words * 350) : 0;
      if (e.speaker === "agent") agentMs += ms;
      else if (e.speaker === "customer") customerMs += ms;
    }
    return { agentMs, customerMs };
  }, [state.transcript]);
  // Density rule (T-050): the live call shows the card, the status and one collapsed rail toggle.
  // Before the call the same toggle opens the brief editor (UX-01); Home's Prepare opens it on a
  // wide window. On a narrow one the rail is a sheet over everything, so it stays one tap away
  // (UX-008).
  const [railOpen, setRailOpen] = useState(prepare && wide);
  const [checking, setChecking] = useState(check);
  useEffect(() => {
    if (check) setChecking(true);
  }, [check]);
  const callApp = useCallApp();
  const cloud = useCloud();
  const { crm: linked } = useAttachedState();
  const script = practiceScenario(cloud.status === "signed_in" ? cloud.bundle : null);
  const practiceRun = usePracticeRun();
  const [practicing, setPracticing] = useState(askPractice);
  useEffect(() => {
    if (askPractice) setPracticing(true);
  }, [askPractice]);
  useEffect(() => {
    if (prepare && wide) setRailOpen(true);
  }, [prepare, wide]);
  const live = state.phase === "live";
  const idle = state.phase === "idle";
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

  if (state.connection === "offline" && session.pipeline?.status !== "reconnecting") {
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
  // Scripted (development only): scenarios or the mock stream, with typed lines. A real account
  // has neither (D-024): the call is heard, never typed. Its practice call (D-073) plays the
  // neutral script with nothing to type, and is labelled and kept apart the same way.
  const scripted = mock || state.hello.scenarios.length > 0;
  const realPractice = !scripted && practiceRun && !idle;
  const practice = scripted || realPractice;
  const startPractice = () => {
    if (!script) return;
    session.start(script.id);
    // Home's "Try a practice call" step (D-073) is done once one has started.
    const done = prefs().setupDone;
    if (!done.includes("practice")) setPrefs({ setupDone: [...done, "practice"] });
  };
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
  // PROD-002: the desktop app's floating card, one click from the call (also ⌃⌥M from any app).
  const showMini = desktop()?.showMini;
  // UI-005: the header names the call — the practice, the linked meeting or contact — not the
  // company, which stays beside the status.
  const linkedTitle =
    linked.kind === "attached"
      ? linked.brief.meeting?.title.trim() || linked.brief.person?.name.trim() || ""
      : "";
  const header = (
    <CallHeader
      onMini={showMini ? () => showMini(true) : null}
      title={practice ? tc("call.practiceTitle") : linkedTitle || tc("call.title")}
      company={state.hello.company_name}
      phase={state.phase}
      mode={state.hello.mode}
      practice={practice}
      startedAt={state.startedAt}
      // UX-007: the clock stops when the agent ends the call, while the engine finishes.
      endedAt={state.endedAt ?? state.endRequestedAt}
      ending={state.endRequestedAt !== null}
      endLabel={realPractice ? tc("call.endPractice") : undefined}
      mock={mock}
      // A practice run keeps nothing (D-073), so it ends at once; a real call asks first (T-025).
      onEnd={() => (realPractice ? session.end() : setConfirming(true))}
      wide={wide}
      rail={{ open: railOpen, onToggle: () => setRailOpen((o) => !o) }}
    />
  );
  const showRail = railOpen;
  // R10: Zoho lookup in the rail; the dev mock call uses canned records (never in a release).
  // Before the call: the full brief editor; live: a quiet read-only brief (UX-01).
  const crm = (
    <SafeBoundary name="call.rail">
      <CrmRail
        stage={idle ? "prepare" : "live"}
        lookup={mock ? mockLookup : undefined}
        perform={mock ? mockPerform : undefined}
        callId={state.callId ?? undefined}
        onStartListening={
          idle && !practicing && Platform.OS === "web"
            ? () => (scripted ? session.start(null) : session.startListening(session.source))
            : undefined
        }
      />
    </SafeBoundary>
  );
  const notes = !practice && !idle ? <CallNotes /> : null;
  const controls = scripted ? (
    live ? (
      <Composer
        onSay={session.say}
        disabled={false}
        compact={!wide}
        mic={mic}
        partial={state.partial}
      />
    ) : null
  ) : live && !realPractice ? (
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
      {state.phase === "idle" && scripted ? (
        <ScenarioPicker scenarios={state.hello.scenarios} onStart={session.start} />
      ) : null}
      {state.phase === "idle" && !scripted && practicing ? (
        <PracticeStart
          available={Boolean(script)}
          onStart={startPractice}
          onReal={() => setPracticing(false)}
        />
      ) : null}
      {state.phase === "idle" && prepare && !wide && !railOpen && !practicing ? (
        <PreparedNote onOpen={() => setRailOpen(true)} />
      ) : null}
      {state.phase === "idle" && !scripted && !practicing ? (
        Platform.OS === "web" ? (
          checking ? (
            <AudioCheck computer={computerAudioAvailable()} onDone={() => setChecking(false)} />
          ) : (
            <ListenStart
              computer={computerAudioAvailable()}
              callApp={callApp}
              onStart={session.startListening}
              onCheck={() => setChecking(true)}
              onPractice={script ? () => setPracticing(true) : undefined}
            />
          )
        ) : (
          <PhoneCallsLater onPractice={script ? () => setPracticing(true) : undefined} />
        )
      ) : null}
      {state.phase === "ended" ? (
        <EndedView
          cardCount={cards.length}
          practice={practice}
          mock={mock}
          callId={state.callId ?? null}
          durationS={
            state.startedAt !== null && state.endedAt !== null
              ? Math.max(0, Math.round((state.endedAt - state.startedAt) / 1000))
              : undefined
          }
          cards={cards}
          perform={mock ? mockPerform : undefined}
          onAgain={() =>
            realPractice
              ? startPractice()
              : scripted
                ? session.start(null)
                : session.startListening(session.source)
          }
        />
      ) : null}
      {state.phase !== "idle" && state.phase !== "ended" ? (
        <SafeBoundary name="call.cards">
          {live && talkMeterGate.state === "available" ? (
            <TalkMeter
              agentMs={talkDurations.agentMs}
              customerMs={talkDurations.customerMs}
              approximate={session.source === "mic"}
            />
          ) : null}
          <CardStack
            cards={cards}
            wide={wide}
            listening={live}
            speaking={Boolean(state.partial)}
            practice={practice}
          />
        </SafeBoundary>
      ) : null}
    </View>
  );
  // UX-07: top-end on wide, above the composer on narrow; never takes a touch (pointerEvents
  // none), so rows under it stay usable. An escalation says only "Sent to your manager": the
  // question is already in the transcript line.
  const pipelineBanner = session.pipeline?.bannerText ?? null;
  const toast = notice ? (
    <View testID="toast-wrap" style={[styles.toast, wide ? styles.toastWide : styles.toastNarrow]}>
      <Toast
        testID="toast"
        title={t(
          notice.kind === "escalation"
            ? "call.escalated.title"
            : notice.kind === "info"
              ? "call.notice.title"
              : "call.error.title",
        )}
        {...(notice.kind === "error"
          ? { body: t("call.error.body") }
          : notice.kind === "info"
            ? { body: notice.text }
            : {})}
      />
    </View>
  ) : pipelineBanner ? (
    <View testID="toast-wrap" style={[styles.toast, wide ? styles.toastWide : styles.toastNarrow]}>
      <Toast testID="pipeline-banner" title={pipelineBanner} />
    </View>
  ) : null;

  if (wide) {
    return (
      <View testID="call-live" style={styles.row}>
        <View style={styles.grow}>
          {header}
          {/* The toast sits at the top-end of the content, under the header's controls. */}
          <View style={styles.grow}>
            <ScrollView contentContainerStyle={styles.mainWide}>{main}</ScrollView>
            {toast}
          </View>
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
            <ScrollView
              style={idle ? styles.grow : styles.sideCrm}
              contentContainerStyle={styles.sideCrmBody}
            >
              {crm}
            </ScrollView>
            {idle ? null : (
              <View style={styles.sideScroll}>
                <SafeBoundary name="call.rail">
                  <TranscriptPane
                    lines={state.transcript}
                    scroll
                    hideTalkMeter={live && talkMeterGate.state === "available"}
                  />
                </SafeBoundary>
              </View>
            )}
            {notes ? (
              <View style={styles.sideNotes}>
                <SafeBoundary name="call.rail">{notes}</SafeBoundary>
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
        <ScrollView contentContainerStyle={styles.mainNarrow}>{main}</ScrollView>
        {/* UX-01: on a phone the rail is a bottom sheet over the card, never instead of it. */}
        <Sheet
          open={showRail}
          title={t("call.rail.title")}
          closeLabel={tc("ui.close")}
          onClose={() => setRailOpen(false)}
          testID="call-rail-sheet"
        >
          <View testID="call-rail" style={styles.railNarrow}>
            {crm}
            {idle ? null : (
              <SafeBoundary name="call.rail">
                <TranscriptPane
                  lines={state.transcript}
                  limit={6}
                  scroll={false}
                  hideTalkMeter={live && talkMeterGate.state === "available"}
                />
              </SafeBoundary>
            )}
            {notes ? <SafeBoundary name="call.rail">{notes}</SafeBoundary> : null}
          </View>
        </Sheet>
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
  toast: { position: "absolute", pointerEvents: "none" },
  toastNarrow: { bottom: space.md, start: space.md, end: space.md },
  toastWide: { top: space.lg, end: space.xxl, maxWidth: layout.toastMaxWidth, width: "100%" },
});
