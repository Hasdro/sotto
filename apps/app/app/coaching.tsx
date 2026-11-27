/**
 * Coaching (INT-05): what the team already does, turned into practice points — AI cards marked
 * "not helpful", objections that keep coming up, the weakest of the six review skills and what
 * AGN learned from the ratings. An agent sees only themselves; a manager their team; an admin the
 * company. People are listed by name (yourself first), never ranked. Managers and admins can opt
 * in to a weekly email and send themselves a preview.
 */
import {
  Badge,
  Button,
  EmptyState,
  layout,
  Panel,
  radius,
  Screen,
  Stack,
  space,
  Text,
  ToggleRow,
  useTheme,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";
import { AppLink } from "../components/AppLink";
import { PageHeader } from "../components/PageHeader";
import {
  type Coaching,
  type CoachPerson,
  coachingApi,
  type Digest,
  SKILLS,
  type Skill,
} from "../features/coaching/api";
import { countKey, type StringKey } from "../lib/i18n";
import { useI18n } from "../lib/locale";
import { useCloud } from "../lib/useCloud";

const SKILL_KEY: Record<Skill, StringKey> = {
  opening: "review.dim.opening",
  discovery: "review.dim.discovery",
  listening: "review.dim.listening",
  objections: "review.dim.objections",
  clarity: "review.dim.clarity",
  next_step: "review.dim.next_step",
};
const THEME_KEY: Record<string, StringKey> = {
  price: "reports.theme.price",
  timing: "reports.theme.timing",
  think: "reports.theme.think",
  competitor: "reports.theme.competitor",
  trust: "reports.theme.trust",
  other: "reports.theme.other",
};
const TYPE_KEY: Record<string, StringKey> = {
  answer: "card.type.answer",
  question: "card.type.question",
  objection: "card.type.objection",
  signal: "card.type.signal",
  warning: "card.type.warning",
};
const SCOPE_KEY: Record<Coaching["scope"], StringKey> = {
  self: "coaching.scope.self",
  team: "coaching.scope.team",
  company: "coaching.scope.company",
};

export default function CoachingScreen() {
  const { t } = useI18n();
  const cloud = useCloud();
  const signedIn = cloud.status === "signed_in" && !cloud.offline;
  const role = cloud.status === "signed_in" ? cloud.me.user.role : "agent";
  const [data, setData] = useState<Coaching | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!signedIn) return;
    coachingApi.view(30).then(setData, () => setFailed(true));
  }, [signedIn]);

  return (
    <Screen scroll maxWidth={layout.contentMaxWidth} testID="coaching" style={styles.page}>
      <PageHeader
        icon="spark"
        title={t("coaching.title")}
        subtitle={data ? t(SCOPE_KEY[data.scope], { days: data.days }) : t("coaching.subtitle")}
      />
      {!signedIn ? (
        <EmptyState
          testID="coaching-none"
          title={t("coaching.none.title")}
          body={t("coaching.none.body")}
        />
      ) : failed ? (
        <Text tone="danger">{t("coaching.error")}</Text>
      ) : !data ? null : (
        <Stack gap="lg">
          {data.scope !== "self" ? (
            <Text variant="label" tone="muted" testID="coaching-no-ranking">
              {t("coaching.noRanking")}
            </Text>
          ) : null}
          {data.scope !== "self" && Object.keys(data.objections).length > 0 ? (
            <Section title={t("coaching.teamObjections")}>
              <View style={styles.chips} testID="coaching-objections">
                {Object.entries(data.objections).map(([theme, n]) => (
                  <Badge
                    key={theme}
                    tone="neutral"
                    label={`${THEME_KEY[theme] ? t(THEME_KEY[theme]) : theme} · ${n}`}
                  />
                ))}
              </View>
            </Section>
          ) : null}
          {data.people.map((p) => (
            <PersonCard key={p.user_id} person={p} />
          ))}
          {data.scope !== "self" ? (
            <Section title={t("coaching.learned")}>
              {data.learned.length === 0 ? (
                <Text tone="muted">{t("coaching.learnedNone")}</Text>
              ) : (
                <View accessibilityRole="list" testID="coaching-learned">
                  {data.learned.map((l) => (
                    <Text key={l}>{`• ${l}`}</Text>
                  ))}
                </View>
              )}
              {role === "admin" ? (
                <AppLink href="/admin/instructions" testID="coaching-edit-learned">
                  <Text tone="primary" weight="medium">
                    {t("coaching.learnedEdit")}
                  </Text>
                </AppLink>
              ) : null}
            </Section>
          ) : null}
          {role !== "agent" ? <WeeklyEmail /> : null}
        </Stack>
      )}
    </Screen>
  );
}

function PersonCard({ person: p }: { person: CoachPerson }) {
  const { t } = useI18n();
  const rejected = Object.entries(p.rejected);
  const objections = Object.entries(p.objections).sort((a, b) => b[1] - a[1]);
  return (
    <Panel testID={`coach-${p.user_id}`}>
      <Stack gap="sm">
        <View style={styles.head}>
          <Text variant="heading" weight="semibold" accessibilityRole="header">
            {p.name || t("coaching.unnamed")}
          </Text>
          {p.me ? <Badge label={t("coaching.you")} tone="primary" /> : null}
        </View>
        {/* UI-010: "1 call · 1 card rated", never "1 cards rated". */}
        <Text variant="label" tone="muted" testID={`coach-counts-${p.user_id}`}>
          {[
            t(countKey("coaching.calls", p.calls), { n: p.calls }),
            t(countKey("coaching.rated", p.rated), { n: p.rated }),
            t("coaching.notHelpful", { n: p.not_helpful }),
          ].join(" · ")}
        </Text>
        {p.weakest ? (
          <Text weight="medium" testID={`coach-weakest-${p.user_id}`}>
            {t("coaching.practice", {
              skill: t(SKILL_KEY[p.weakest]),
              score: p.skills[p.weakest] ?? 0,
            })}
          </Text>
        ) : (
          <Text tone="muted">{t("coaching.noReviews")}</Text>
        )}
        <SkillBars person={p} />
        {rejected.length > 0 ? (
          <Text variant="label" tone="muted">
            {`${t("coaching.rejected")}: ${rejected
              .map(([type, n]) => `${TYPE_KEY[type] ? t(TYPE_KEY[type]) : type} ${n}`)
              .join(" · ")}`}
          </Text>
        ) : null}
        {objections.length > 0 ? (
          <Text variant="label" tone="muted">
            {`${t("coaching.objections")}: ${objections
              .map(([theme, n]) => `${THEME_KEY[theme] ? t(THEME_KEY[theme]) : theme} ${n}`)
              .join(" · ")}`}
          </Text>
        ) : null}
      </Stack>
    </Panel>
  );
}

/** UI-010: the six review skills as short bars (0–10) instead of one line of six numbers; the
 * skill to practise is marked "Focus". Colours follow the call review (green ≥ 7, amber ≥ 4). */
function SkillBars({ person: p }: { person: CoachPerson }) {
  const { t } = useI18n();
  const { color, card } = useTheme();
  const shown = SKILLS.filter((s) => p.skills[s] !== undefined);
  if (shown.length === 0) return null;
  return (
    <View style={styles.skills} testID={`coach-skills-${p.user_id}`}>
      {shown.map((s) => {
        const v = p.skills[s] ?? 0;
        const focus = s === p.weakest;
        const fill =
          v >= 7 ? card.answer.accent : v >= 4 ? card.objection.accent : card.warning.accent;
        return (
          <View key={s} style={styles.skill} testID={`coach-skill-${p.user_id}-${s}`}>
            <View style={styles.head}>
              <Text
                variant="label"
                weight={focus ? "semibold" : "medium"}
                numberOfLines={1}
                style={styles.grow}
              >
                {t(SKILL_KEY[s])}
              </Text>
              {focus ? <Badge label={t("coaching.focus")} tone="objection" /> : null}
              <Text variant="label" weight="semibold" style={styles.num}>
                {`${Math.round(v * 10) / 10}/10`}
              </Text>
            </View>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t(SKILL_KEY[s])}
              accessibilityValue={{ min: 0, max: 10, now: v }}
              style={[styles.track, { backgroundColor: color.surfaceSunken }]}
            >
              <View
                style={[
                  styles.fill,
                  { width: `${Math.min(100, Math.max(0, v * 10))}%`, backgroundColor: fill },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

function WeeklyEmail() {
  const { t } = useI18n();
  const [digest, setDigest] = useState<Digest | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    coachingApi.digest().then(setDigest, () => {});
  }, []);
  const preview = useCallback(() => {
    setBusy(true);
    setNote(null);
    coachingApi
      .preview()
      .then((r) => setNote(r.sent ? t("coaching.email.sent") : t("coaching.email.noMail")))
      .catch(() => setNote(t("coaching.error")))
      .finally(() => setBusy(false));
  }, [t]);
  return (
    <Section title={t("coaching.email")}>
      <ToggleRow
        testID="coaching-weekly"
        label={t("coaching.email.weekly")}
        description={t("coaching.email.weeklyBody")}
        value={digest?.weekly ?? false}
        onValueChange={(on) => {
          coachingApi.setDigest(on).then(setDigest, () => setNote(t("coaching.error")));
        }}
      />
      <View style={styles.head}>
        <Button
          testID="coaching-preview"
          label={t("coaching.email.preview")}
          variant="secondary"
          disabled={busy}
          onPress={preview}
        />
        {note ? (
          <Text variant="label" tone="muted" accessibilityLiveRegion="polite">
            {note}
          </Text>
        ) : null}
      </View>
    </Section>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Stack gap="sm">
      <Text variant="label" weight="semibold" tone="muted" accessibilityRole="header">
        {title}
      </Text>
      <Panel>
        <Stack gap="sm">{children}</Stack>
      </Panel>
    </Stack>
  );
}

const styles = StyleSheet.create({
  page: { paddingTop: space.xl },
  head: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: space.sm },
  grow: { flex: 1, minWidth: 0 },
  num: { fontVariant: ["tabular-nums"] },
  skills: { flexDirection: "row", flexWrap: "wrap", columnGap: space.xl, rowGap: space.md },
  skill: { flexGrow: 1, flexBasis: 240, gap: space.xs },
  track: { height: 6, borderRadius: radius.pill, overflow: "hidden" },
  fill: { height: 6, borderRadius: radius.pill },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.xs },
});
