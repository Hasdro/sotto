/**
 * "Invite your team from Zoho CRM" (ZC-13): the admin's own Zoho connection reads the org's
 * users in sales roles; the admin sees the list (role agent, ticked up to the seats left) and
 * invites only after pressing Invite. The server re-reads every id from Zoho and audits each.
 */
import { Badge, Button, Disclosure, SegmentedControl, Stack, Text, ToggleRow } from "@sotto/ui";
import { useState } from "react";
import {
  type Invited,
  type ZohoPerson,
  type ZohoTeam,
  zohoInvite,
  zohoTeam,
} from "../integrations/api";
import { useIntegrationsText } from "../integrations/strings";

const errorOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function ZohoInvite({ connected }: { connected: boolean }) {
  const ti = useIntegrationsText();
  const [team, setTeam] = useState<ZohoTeam | "loading" | null>(null);
  const [picked, setPicked] = useState<Record<string, "agent" | "manager" | null>>({});
  const [result, setResult] = useState<Invited | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setTeam("loading");
    setNote(null);
    setResult(null);
    zohoTeam()
      .then((t) => {
        setTeam(t);
        const fresh = t.people.filter((p) => !p.member);
        setPicked(
          Object.fromEntries(
            fresh.map((p, i) => [p.zoho_id, i < t.seats_left ? ("agent" as const) : null]),
          ),
        );
      })
      .catch((e) => {
        setTeam(null);
        setNote(ti("zohoTeam.failed", { error: errorOf(e) }));
      });
  };
  const ready = team && team !== "loading" ? team : null;
  const chosen = Object.entries(picked).flatMap(([zoho_id, role]) =>
    role ? [{ zoho_id, role }] : [],
  );
  const left = ready?.seats_left ?? 0;
  const why = !chosen.length
    ? ti("zohoTeam.why.none")
    : chosen.length > left
      ? ti("zohoTeam.why.seats", { left: String(left) })
      : busy
        ? ti("smtp.why.busy")
        : undefined;
  const invite = () => {
    setBusy(true);
    setNote(null);
    zohoInvite(chosen)
      .then((r) => {
        setResult(r);
        setTeam(null);
        setPicked({});
      })
      .catch((e) => setNote(ti("zohoTeam.failed", { error: errorOf(e) })))
      .finally(() => setBusy(false));
  };

  return (
    <Disclosure title={ti("zohoTeam.title")} testID="zoho-invite">
      <Stack gap="md">
        <Text variant="label" tone="muted">
          {ti("zohoTeam.body")}
        </Text>
        <Button
          variant="secondary"
          label={ti(team === "loading" ? "zohoTeam.loading" : "zohoTeam.load")}
          disabled={!connected || team === "loading"}
          helper={connected ? undefined : ti("zohoTeam.connect")}
          onPress={load}
          testID="zoho-invite-load"
        />
        {ready ? (
          <Stack gap="sm" testID="zoho-invite-preview">
            <Stack direction="row" gap="sm" wrap>
              <Badge tone="neutral" label={ti("zohoTeam.seats", { left: String(left) })} />
            </Stack>
            {ready.fallback ? (
              <Text variant="label" tone="muted">
                {ti("zohoTeam.fallback")}
              </Text>
            ) : null}
            {ready.people.filter((p) => !p.member).length === 0 ? (
              <Text variant="body" tone="muted">
                {ti("zohoTeam.empty")}
              </Text>
            ) : null}
            {ready.people.map((p) => (
              <PersonRow
                key={p.zoho_id}
                person={p}
                role={picked[p.zoho_id] ?? null}
                onChange={(role) => setPicked((x) => ({ ...x, [p.zoho_id]: role }))}
              />
            ))}
            <Button
              label={ti("zohoTeam.invite", { count: String(chosen.length) })}
              disabled={Boolean(why)}
              helper={why}
              onPress={invite}
              testID="zoho-invite-go"
            />
          </Stack>
        ) : null}
        {result ? (
          <Stack gap="xs" testID="zoho-invite-done">
            <Text variant="body" weight="semibold" aria-live="polite">
              {ti("zohoTeam.done", { count: String(result.invited.length) })}
            </Text>
            {result.invited.map((i) => (
              <Text key={i.id} variant="label" selectable>
                {`${i.name} · ${i.email} · ${i.temporary_password}`}
              </Text>
            ))}
          </Stack>
        ) : null}
        {note ? (
          <Text variant="label" tone="danger" aria-live="polite" testID="zoho-invite-note">
            {note}
          </Text>
        ) : null}
      </Stack>
    </Disclosure>
  );
}

function PersonRow({
  person,
  role,
  onChange,
}: {
  person: ZohoPerson;
  role: "agent" | "manager" | null;
  onChange: (role: "agent" | "manager" | null) => void;
}) {
  const ti = useIntegrationsText();
  const detail = [person.email, person.zoho_role].filter(Boolean).join(" · ");
  if (person.member) {
    return (
      <Stack gap="xs" testID={`zoho-person-${person.zoho_id}`}>
        <Text variant="body">{person.name}</Text>
        <Text variant="label" tone="muted">{`${detail} · ${ti("zohoTeam.member")}`}</Text>
      </Stack>
    );
  }
  return (
    <Stack gap="xs">
      <ToggleRow
        label={person.name}
        description={detail}
        value={role !== null}
        onValueChange={(on) => onChange(on ? "agent" : null)}
        testID={`zoho-person-${person.zoho_id}`}
      />
      {role ? (
        <SegmentedControl
          options={[
            { value: "agent", label: ti("zohoTeam.agent") },
            { value: "manager", label: ti("zohoTeam.manager") },
          ]}
          value={role}
          onChange={(v) => onChange(v)}
          accessibilityLabel={person.name}
          testID={`zoho-person-role-${person.zoho_id}`}
        />
      ) : null}
    </Stack>
  );
}
