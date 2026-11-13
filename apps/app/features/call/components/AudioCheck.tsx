/**
 * The 5-second audio check (ZC-08): "say hello, play any sound". Each track is opened and
 * measured on its own (never mixed, R4); a failure shows one plain-language fix and, in the
 * desktop app, a button to the exact OS privacy pane (UX-21). The result is remembered per
 * device. `/call?check=audio` opens it directly (Home's "Test audio" first-run step).
 */
import { Button, Panel, radius, Stack, space, Text, useTheme } from "@sotto/ui";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { desktop } from "../../../lib/desktop";
import { isWindows } from "../../../lib/platform";
import { prefs, setPrefs } from "../../../lib/prefs";
import {
  type CheckResult,
  checkFix,
  deviceKey,
  type Levels,
  rememberCheck,
  rememberedCheck,
  runLevelCheck,
} from "../audioSetup";
import { useCallText } from "../strings";

type Run = typeof runLevelCheck;

export function AudioCheck({
  computer,
  onDone,
  run = runLevelCheck,
}: {
  computer: boolean;
  onDone?: () => void;
  run?: Run;
}) {
  const tc = useCallText();
  const key = deviceKey(prefs().micId, computer);
  const [result, setResult] = useState<CheckResult | null>(() => rememberedCheck(key));
  const [fresh, setFresh] = useState(false);
  const [levels, setLevels] = useState<Levels | null>(null);
  const [running, setRunning] = useState(false);
  const alive = useRef(true);
  useEffect(
    () => () => {
      alive.current = false;
    },
    [],
  );

  const start = () => {
    setRunning(true);
    setLevels({ customer: 0, agent: 0 });
    void run({ computer, onLevel: (l) => alive.current && setLevels(l) }).then((r) => {
      rememberCheck(key, r);
      if (!checkFix(r)) setPrefs({ audioChecked: true }); // Home's "Test audio" step completes
      if (!alive.current) return;
      setResult(r);
      setFresh(true);
      setRunning(false);
    });
  };

  const fix = result ? checkFix(result) : null;
  const bridge = desktop();
  const pane = fix?.pane && bridge?.openPrivacySettings ? fix.pane : null;
  return (
    <Panel testID="audio-check" style={styles.panel}>
      <Stack gap="md">
        <Text variant="title" weight="semibold" accessibilityRole="header">
          {tc("check.title")}
        </Text>
        <Text variant="body" tone="muted">
          {tc(computer ? "check.body" : "check.bodyWeb")}
        </Text>
        {running || fresh ? (
          <Stack gap="sm">
            <Meter label={tc("check.you")} level={levels?.agent ?? 0} testID="check-level-agent" />
            {computer ? (
              <Meter
                label={tc("check.customer")}
                level={levels?.customer ?? 0}
                testID="check-level-customer"
              />
            ) : null}
          </Stack>
        ) : null}
        {running ? (
          <Text variant="label" tone="muted" aria-live="polite" accessibilityLiveRegion="polite">
            {tc("check.running")}
          </Text>
        ) : result ? (
          <Text
            variant="body"
            tone={fix ? "danger" : "default"}
            aria-live="polite"
            accessibilityLiveRegion="polite"
            testID="check-result"
          >
            {fix ? tc(fix.text) : tc(fresh ? "check.ok" : "check.last")}
          </Text>
        ) : null}
        <Stack direction="row" gap="sm" wrap>
          <Button
            label={tc(result ? "check.again" : "check.run")}
            variant={result && !fix ? "secondary" : "primary"}
            onPress={start}
            disabled={running}
            testID="check-run"
          />
          {pane ? (
            <Button
              variant="secondary"
              label={tc(isWindows() ? "perm.openWindows" : "perm.openMac")}
              onPress={() => void bridge?.openPrivacySettings?.(pane)?.catch(() => {})}
              testID="check-open-privacy"
            />
          ) : null}
          {onDone ? (
            <Button variant="ghost" label={tc("check.done")} onPress={onDone} testID="check-done" />
          ) : null}
        </Stack>
      </Stack>
    </Panel>
  );
}

function Meter({ label, level, testID }: { label: string; level: number; testID: string }) {
  const { color } = useTheme();
  // Speech sits around 0.02–0.2 RMS: scale so a normal voice fills most of the bar.
  const pct = Math.min(100, Math.round(Math.sqrt(Math.min(1, level * 5)) * 100));
  return (
    <View style={styles.meter}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <View
        style={[styles.track, { backgroundColor: color.surfaceSunken }]}
        accessibilityRole="progressbar"
        accessibilityLabel={label}
        accessibilityValue={{ min: 0, max: 100, now: pct }}
        testID={testID}
      >
        <View style={{ width: `${pct}%`, backgroundColor: color.primary }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { padding: space.xl },
  meter: { gap: space.xs },
  track: { flexDirection: "row", height: 8, borderRadius: radius.pill, overflow: "hidden" },
});
