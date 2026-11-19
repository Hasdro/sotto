/**
 * Admin › Company › Bug reports (Round 3, D-086): the vendor's view of the review queue —
 * what the team reported, who reported it, and the review: fix the title or description,
 * set the status, send it to GitHub when it is real. The queue endpoints are owner-only,
 * so outside the owner console this screen says the queue lives there instead of failing:
 * the owner console is a separate origin with its own cookie, and the app session cannot
 * use it. (The same queue is a tab in the owner console itself.)
 */
import {
  Badge,
  Button,
  Dropdown,
  layout,
  Panel,
  Screen,
  Stack,
  space,
  Table,
  Text,
  TextField,
} from "@sotto/ui";
import { useCallback, useEffect, useState } from "react";
import { Linking, StyleSheet, View } from "react-native";
import { PageHeader } from "../../components/PageHeader";
import {
  type BugReport,
  type BugReportStatus,
  listBugReports,
  OwnerApiError,
  submitBugReportToGithub,
  updateBugReport,
} from "../../features/support/api";
import { useI18n } from "../../lib/locale";

const STATUS_TONE: Record<BugReportStatus, "notice" | "primary" | "answer" | "neutral"> = {
  new: "notice",
  reviewed: "primary",
  submitted: "answer",
  closed: "neutral",
};

const STATUSES: readonly BugReportStatus[] = ["new", "reviewed", "submitted", "closed"];

function formatDate(ms: number, locale: "en" | "ar"): string {
  return new Date(ms).toLocaleDateString(locale === "ar" ? "ar-AE" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function BugReportsScreen() {
  const { t, locale } = useI18n();
  const [reports, setReports] = useState<BugReport[]>([]);
  const [filter, setFilter] = useState<BugReportStatus | "all">("all");
  const [ownerOnly, setOwnerOnly] = useState(false);
  const [failed, setFailed] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const load = useCallback(() => {
    setFailed(false);
    setOwnerOnly(false);
    listBugReports(filter === "all" ? undefined : filter)
      .then((r) => setReports(r.reports))
      .catch((e) => {
        if (e instanceof OwnerApiError && (e.status === 401 || e.status === 403)) {
          setOwnerOnly(true);
        } else {
          setFailed(true);
        }
      });
  }, [filter]);
  useEffect(load, [load]);
  const selected = reports.find((r) => r.id === selectedId) ?? null;
  return (
    <Screen scroll maxWidth={layout.readableMaxWidth} testID="bug-reports" style={styles.page}>
      <PageHeader icon="message" title={t("bug.queue.title")} />
      <Dropdown
        options={[
          { value: "all", label: t("bug.filter.all") },
          ...STATUSES.map((s) => ({ value: s, label: t(`bug.status.${s}`) })),
        ]}
        value={filter}
        onChange={(v) => {
          setSelectedId(null);
          setFilter(v);
        }}
        accessibilityLabel={t("bug.queue.title")}
        testID="bug-reports-filter"
      />
      {ownerOnly ? (
        <Panel testID="bug-reports-owner-only">
          <Stack gap="sm">
            <Text weight="medium">{t("bug.queue.ownerOnly")}</Text>
            <Text tone="muted">{t("bug.queue.ownerOnlyBody")}</Text>
          </Stack>
        </Panel>
      ) : failed ? (
        <Panel>
          <Stack gap="md">
            <Text>{t("bug.queue.loadFailed")}</Text>
            <Button
              variant="secondary"
              label={t("billing.retry")}
              onPress={load}
              testID="bug-reports-retry"
            />
          </Stack>
        </Panel>
      ) : reports.length === 0 ? (
        <Panel>
          <Text tone="muted">{t("bug.queue.empty")}</Text>
        </Panel>
      ) : (
        <Table
          columns={[
            { key: "title", title: t("bug.titleField"), flex: 2 },
            { key: "company", title: t("profile.company"), flex: 1 },
            { key: "status", title: t("bug.status"), flex: 1 },
            { key: "when", title: t("bug.reported"), flex: 1 },
            { key: "open", title: "", flex: 1 },
          ]}
          rows={reports.map((r) => ({
            id: r.id,
            cells: {
              title: r.title,
              company: r.company_name,
              status: <Badge label={t(`bug.status.${r.status}`)} tone={STATUS_TONE[r.status]} />,
              when: formatDate(r.created_at, locale),
              open: (
                <Button
                  variant="ghost"
                  label={t("settings.open")}
                  onPress={() => setSelectedId(r.id)}
                  testID={`bug-report-open-${r.id}`}
                />
              ),
            },
          }))}
          accessibilityLabel={t("bug.queue.title")}
          testID="bug-reports-table"
        />
      )}
      {selected ? (
        <BugReview report={selected} onChange={load} onClose={() => setSelectedId(null)} />
      ) : null}
    </Screen>
  );
}

function BugReview({
  report,
  onChange,
  onClose,
}: {
  report: BugReport;
  onChange: () => void;
  onClose: () => void;
}) {
  const { t, locale } = useI18n();
  const [title, setTitle] = useState(report.title);
  const [description, setDescription] = useState(report.description);
  const [status, setStatus] = useState<BugReportStatus>(report.status);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issueUrl, setIssueUrl] = useState<string | null>(report.github_issue_url);
  const dirty =
    title !== report.title || description !== report.description || status !== report.status;
  const save = () => {
    setError(null);
    setSaving(true);
    updateBugReport(report.id, { title: title.trim(), description: description.trim(), status })
      .then(() => onChange())
      .catch(() => setError(t("bug.failed")))
      .finally(() => setSaving(false));
  };
  const submit = () => {
    setError(null);
    setSubmitting(true);
    submitBugReportToGithub(report.id)
      .then((r) => {
        setIssueUrl(r.issue_url);
        onChange();
      })
      .catch(() => setError(t("bug.failed")))
      .finally(() => setSubmitting(false));
  };
  return (
    <Panel testID="bug-review">
      <Stack gap="md">
        <Text variant="heading" weight="semibold">
          {t("bug.reportedBy", { email: report.user_email })}
        </Text>
        <Text variant="label" tone="muted">
          {t("bug.reportedOn", { when: formatDate(report.created_at, locale) })}
          {report.page_url ? ` · ${report.page_url}` : ""}
        </Text>
        <TextField
          label={t("bug.titleField")}
          value={title}
          onChangeText={setTitle}
          testID="bug-review-title"
        />
        <TextField
          label={t("bug.description")}
          value={description}
          onChangeText={setDescription}
          multiline
          height={120}
          testID="bug-review-description"
        />
        <Dropdown
          options={STATUSES.map((s) => ({ value: s, label: t(`bug.status.${s}`) }))}
          value={status}
          onChange={setStatus}
          accessibilityLabel={t("bug.status")}
          testID="bug-review-status"
        />
        {issueUrl ? (
          <Button
            variant="ghost"
            label={t("bug.issue")}
            onPress={() => void Linking.openURL(issueUrl)}
            testID="bug-review-issue"
          />
        ) : null}
        {error ? <Text variant="label">{error}</Text> : null}
        <View style={styles.actions}>
          <Button
            variant="secondary"
            label={t("bug.edit")}
            onPress={save}
            disabled={!dirty || saving}
            testID="bug-review-save"
          />
          {report.status !== "submitted" && !issueUrl ? (
            <Button
              label={t("bug.submitGithub")}
              onPress={submit}
              disabled={submitting}
              testID="bug-review-submit"
            />
          ) : null}
          <Button variant="ghost" label={t("tutorial.skip")} onPress={onClose} />
        </View>
      </Stack>
    </Panel>
  );
}

const styles = StyleSheet.create({
  page: { gap: space.lg },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
});
