-- P7.2 / R2 step 5: an answered escalation becomes a playbook entry; only staff who can see
-- the call may approve; company B can never approve company A's escalation.
begin;
select plan(9);

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000002', 'manager@a.test'),
  ('a0000000-0000-4000-8000-000000000003', 'agent@a.test'),
  ('b0000000-0000-4000-8000-000000000001', 'admin@b.test');
insert into public.companies (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'A'), ('bbbbbbbb-0000-4000-8000-000000000000', 'B');
insert into public.teams (id, company_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000000', 'North');
insert into public.memberships (company_id, user_id, role, team_id) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'sales_manager', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'agent', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b0000000-0000-4000-8000-000000000001', 'company_admin', null);
insert into public.calls (id, company_id, agent_user_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000003');
insert into public.escalations (id, company_id, call_id, question, question_hash) values
  ('eeeeeeee-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Do you allow pets?', 'pets');

create schema tests;
grant usage on schema tests to authenticated;
create function tests.act_as(uid uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', jsonb_build_object('sub', uid, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
grant execute on all functions in schema tests to authenticated;

select tests.act_as('b0000000-0000-4000-8000-000000000001');
select throws_ok($$select public.approve_escalation('eeeeeeee-0000-4000-8000-000000000001', 'Yes, small pets.')$$,
  '42501', null, 'company B cannot approve company A''s escalation');
reset role;

select tests.act_as('a0000000-0000-4000-8000-000000000003');
select throws_ok($$select public.approve_escalation('eeeeeeee-0000-4000-8000-000000000001', 'Yes, small pets.')$$,
  '42501', null, 'an agent cannot approve answers');
reset role;

select tests.act_as('a0000000-0000-4000-8000-000000000002');
select throws_ok($$select public.approve_escalation('eeeeeeee-0000-4000-8000-000000000001', repeat('word ', 30))$$,
  '22023', null, 'an answer longer than 25 words is refused');
select lives_ok($$select public.approve_escalation('eeeeeeee-0000-4000-8000-000000000001', 'Yes, small pets are welcome.')$$,
  'the team manager approves the answer');
select is((select status from public.escalations where id = 'eeeeeeee-0000-4000-8000-000000000001'), 'added', 'the escalation is marked added');
select is((select short_answer from public.playbook_entries where question = 'Do you allow pets?'), 'Yes, small pets are welcome.',
  'the answer is now in the playbook');
select throws_ok($$select public.approve_escalation('eeeeeeee-0000-4000-8000-000000000001', 'Again.')$$,
  '23505', null, 'an escalation is added only once');
reset role;
select is((select count(*)::int from public.audit_log where target_table = 'playbook_entries' and action = 'insert'), 1,
  'the new playbook entry is audited');


set local role anon;
select throws_ok($$select public.approve_escalation('eeeeeeee-0000-4000-8000-000000000001', 'x')$$,
  '42501', null, 'anon cannot call it');
reset role;

select * from finish();
rollback;
