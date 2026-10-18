-- P7.2 / R2 step 5: the manager answers an escalation; on approval the answer becomes a
-- playbook entry. One call does both, so the inbox state and the playbook never disagree.

create function public.approve_escalation(escalation uuid, short_answer text, details text default '')
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  e public.escalations;
  entry_id uuid;
begin
  select * into e from public.escalations where id = escalation for update;
  if e.id is null or not app.staff_sees_call(e.company_id, e.call_id) then
    raise exception 'escalation not found' using errcode = '42501';
  end if;
  if e.status = 'added' then
    raise exception 'escalation already added to the playbook' using errcode = '23505';
  end if;
  if length(coalesce(short_answer, '')) = 0 or array_length(regexp_split_to_array(trim(short_answer), '\s+'), 1) > 25 then
    raise exception 'short answer must be 1 to 25 words (sayable on one card)' using errcode = '22023';
  end if;
  insert into public.playbook_entries (company_id, kind, question, short_answer, details, tags)
  values (e.company_id, 'faq', e.question, trim(short_answer), coalesce(details, ''), array['from-escalation'])
  returning id into entry_id;
  update public.escalations set status = 'added', answer = trim(short_answer) where id = e.id;
  return entry_id;
end
$$;

revoke execute on function public.approve_escalation(uuid, text, text) from public, anon;
grant execute on function public.approve_escalation(uuid, text, text) to authenticated;
