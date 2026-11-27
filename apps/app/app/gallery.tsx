/**
 * Component gallery (P3.3): every packages/ui component in light and dark, LTR and RTL.
 * Not in the navigation; open /gallery. Sample text comes from the string table.
 */

import type { CardType } from "@sotto/shared";
import {
  Badge,
  Button,
  ChecklistRow,
  Disclosure,
  EmptyState,
  GlassSurface,
  IconButton,
  ListRow,
  LtrRun,
  Mascot,
  moodFor,
  NavRow,
  PageHeader,
  Panel,
  radius,
  SegmentedControl,
  Sheet,
  Skeleton,
  Stack,
  StatTile,
  SuggestionCard,
  space,
  Table,
  Text,
  TextField,
  type ThemeName,
  Toast,
  ToggleRow,
  TranscriptLine,
  themes,
  UIProvider,
  Wordmark,
} from "@sotto/ui";
import { useState } from "react";
import { Platform, ScrollView, StyleSheet, View } from "react-native";
import { cardStrings } from "../features/call/components/strings";
import { CALL_TEXT, type CallTextKey } from "../features/call/strings";
import { directionOf, formatNumber, type Locale, t as translate } from "../lib/i18n";
import { personaFor } from "../lib/role";

const TYPES: readonly CardType[] = ["answer", "question", "objection", "warning", "holding"];

/** One example of each source: the answer card shows the R2 notice of an AI answer. */
const sourceFor = (type: CardType) =>
  type === "holding" ? "holding" : type === "answer" ? "ai" : "playbook";

export default function Gallery() {
  return (
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.grid}>
        {(["light", "dark"] as const).map((scheme) =>
          (["en", "ar"] as const).map((locale) => (
            <Variant key={`${scheme}-${locale}`} scheme={scheme} locale={locale} />
          )),
        )}
      </View>
    </ScrollView>
  );
}

function Variant({ scheme, locale }: { scheme: ThemeName; locale: Locale }) {
  const dir = directionOf(locale);
  const t = (key: Parameters<typeof translate>[0], vars?: Parameters<typeof translate>[2]) =>
    translate(key, locale, vars);
  const [on, setOn] = useState(true);
  const [who, setWho] = useState<"customer" | "agent">("customer");
  const ct = (key: CallTextKey) => CALL_TEXT[locale][key];
  const [done, setDone] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [rated, setRated] = useState<"up" | "down" | null>(null);
  const id = (part: string) => `gallery-${part}-${scheme}-${locale}`;
  return (
    <UIProvider scheme={scheme} direction={dir}>
      <View
        testID={id("variant")}
        {...(Platform.OS === "web" ? { dir } : {})}
        style={[
          styles.variant,
          { direction: dir, backgroundColor: themes[scheme].color.background },
        ]}
      >
        <Stack gap="lg">
          {/* D-041 Quiet Paper Glass: floating glass pill, page header, nav rows, list rows. */}
          <GlassSurface style={styles.glassBar}>
            <Wordmark name={t("app.name")} />
            <Badge tone="signal" dot label={t("call.status.live")} />
          </GlassSurface>
          <PageHeader
            title={t("admin.team")}
            lead={t("inbox.subtitle")}
            actions={<Button label={t("call.pick.start")} />}
          />
          <View>
            <NavRow icon="home" label={t("role.agent")} current />
            <NavRow icon="history" label={t("call.rail.title")} />
          </View>
          <ListRow
            icon="users"
            title={personaFor("agent").name}
            description={t("call.listeningBody")}
            trailing={<IconButton icon="list" label={ct("ui.edit")} />}
          />
          <Stack gap="sm">
            <Skeleton width="60%" />
            <Skeleton />
          </Stack>
          <View style={styles.mascots}>
            {(["idle", "listening", "thinking", "suggesting", "reviewing", "offline"] as const).map(
              (m) => (
                <Mascot key={m} state={m} size={48} />
              ),
            )}
          </View>
          {/* T-051: result moods at review scores 80, 65, 50, 30 and no result. */}
          <View style={styles.mascots} testID="gallery-moods">
            {([80, 65, 50, 30, null] as const).map((score) => {
              const mood = moodFor(score);
              return (
                <View key={String(score)} style={styles.mood}>
                  <Mascot mood={mood} size={48} label={t(`review.mood.${mood}`)} />
                  <Text variant="label" tone="muted">
                    {score === null ? "—" : formatNumber(score, locale)}
                  </Text>
                </View>
              );
            })}
          </View>
          {TYPES.map((type) => (
            <SuggestionCard
              key={type}
              type={type}
              source={sourceFor(type)}
              text={t("call.listeningBody")}
              done={type !== "question"}
              strings={{
                ...cardStrings(t, type, sourceFor(type)),
                notInPlaybookShort: ct("card.notInPlaybookShort"),
              }}
            />
          ))}
          <SuggestionCard
            variant="compact"
            type="objection"
            source="playbook"
            text={t("call.pick.body")}
            done
            strings={cardStrings(t, "objection", "playbook")}
          />
          <Stack direction="row" gap="sm" wrap>
            <Button label={t("call.pick.start")} />
            <Button variant="secondary" label={t("call.offline.retry")} />
            <Button variant="outline" label={t("call.offline.retry")} />
            <Button variant="ghost" label={t("history.detail.back")} />
            <Button variant="danger" label={t("call.end")} />
            <Button label={t("call.composer.send")} disabled />
            <Button variant="secondary" label={t("meetings.opening")} busy />
          </Stack>
          {/* UX-44a: icon-only buttons (44 pt, focus ring) and helper text on a disabled button. */}
          <Stack direction="row" gap="sm" wrap>
            <IconButton
              testID={id("iconbutton")}
              icon="check"
              label={t("rating.up")}
              outlined
              selected={rated === "up"}
              onPress={() => setRated((r) => (r === "up" ? null : "up"))}
            />
            <IconButton
              icon="close"
              label={t("rating.down")}
              outlined
              selected={rated === "down"}
              onPress={() => setRated((r) => (r === "down" ? null : "down"))}
            />
            <Button label={ct("ui.sample.save")} disabled helper={ct("ui.sample.helper")} />
          </Stack>
          <Disclosure testID={id("disclosure")} title={t("call.rail.title")}>
            <Text variant="body" tone="muted">
              {t("call.listeningBody")}
            </Text>
          </Disclosure>
          <ChecklistRow
            testID={id("checklist")}
            checked={done}
            label={ct("ui.sample.task")}
            onToggle={setDone}
            editLabel={ct("ui.edit")}
          >
            <TextField label={t("playbook.search")} />
          </ChecklistRow>
          <Stack direction="row" gap="sm" wrap>
            <StatTile
              testID={id("stattile")}
              label={ct("ui.sample.calls")}
              value={formatNumber(12, locale)}
              hint={ct("ui.sample.callsHint")}
            />
          </Stack>
          <Text variant="body" testID={id("ltrrun")}>
            {`${ct("ui.sample.noteOn")} `}
            <LtrRun>Acme renewal 2027</LtrRun>
          </Text>
          <Button
            variant="secondary"
            label={ct("ui.sample.sheet")}
            onPress={() => setSheet(true)}
            testID={id("sheet-open")}
          />
          <Sheet
            open={sheet}
            title={t("call.rail.title")}
            closeLabel={ct("ui.close")}
            onClose={() => setSheet(false)}
            testID={id("sheet")}
          >
            <Text variant="body">{t("call.listeningBody")}</Text>
          </Sheet>
          <Stack direction="row" gap="sm" wrap>
            <Badge tone="warning" dot label={t("call.status.live")} />
            <Badge tone="answer" label={t("call.mode.live")} />
            <Badge tone="objection" label={t("inbox.status.open")} />
            <Badge tone="notice" label={t("call.mockBadge")} />
            <Badge tone="objection" dot label={t("call.approximate")} />
            <Badge label={t("role.agent")} />
          </Stack>
          <SegmentedControl
            accessibilityLabel={t("call.composer.who")}
            options={[
              { value: "customer", label: t("call.speaker.customer") },
              { value: "agent", label: t("call.speaker.agent") },
            ]}
            value={who}
            onChange={setWho}
          />
          <TextField label={t("playbook.search")} placeholder={t("playbook.searchPlaceholder")} />
          <Panel>
            <ToggleRow
              label={t("admin.settings.aiAnswers")}
              description={t("admin.settings.aiAnswersHint")}
              value={on}
              onValueChange={setOn}
            />
          </Panel>
          <Panel style={styles.lines}>
            <TranscriptLine
              speaker="customer"
              speakerLabel={t("call.speaker.customer")}
              text={t("call.listeningBody")}
              time="00:12"
            />
            <TranscriptLine
              speaker="agent"
              speakerLabel={t("call.speaker.agent")}
              text={t("call.pick.empty")}
              time="00:15"
            />
            <TranscriptLine
              speaker="system"
              speakerLabel={t("call.speaker.system")}
              text={t("inbox.subtitle")}
            />
          </Panel>
          <Table
            accessibilityLabel={t("admin.team")}
            columns={[
              { key: "a", title: t("admin.team.name") },
              { key: "b", title: t("admin.team.role") },
            ]}
            rows={[
              {
                id: "1",
                cells: { a: personaFor("agent").name, b: <Badge label={t("role.agent")} /> },
              },
            ]}
          />
          <Toast title={t("call.escalated.title")} />
          <Toast
            testID={id("toast-action")}
            title={ct("ui.sample.deleted")}
            action={{ label: ct("ui.undo"), onPress: () => {} }}
          />
          <EmptyState
            title={t("call.offline.title")}
            body={t("call.offline.body")}
            code={t("call.offline.command")}
          />
          <Text variant="label" tone="muted">
            {`${scheme} ${dir}`}
          </Text>
        </Stack>
      </View>
    </UIProvider>
  );
}

const styles = StyleSheet.create({
  mascots: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  mood: { alignItems: "center", gap: 4 },
  page: { padding: space.lg },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: space.lg },
  variant: {
    flexGrow: 1,
    flexBasis: 360,
    maxWidth: 560,
    padding: space.lg,
    borderRadius: radius.xl,
  },
  lines: { gap: space.sm },
  glassBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.sm,
    paddingVertical: space.xs,
    paddingHorizontal: space.md,
  },
});
