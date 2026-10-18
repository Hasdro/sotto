-- R3 acceptance: for every tenant table, a user (and the per-call worker, D-012) of company A
-- cannot select, insert, update or delete company B rows. Runs with `pnpm test:db`
-- (local Postgres or `supabase test db`).
begin;
select plan(142);

-- ── fixtures (as the test superuser) ──
create schema tests;
grant usage on schema tests to authenticated;

insert into auth.users (id, email) values
  ('a0000000-0000-4000-8000-000000000001', 'admin@a.test'),
  ('a0000000-0000-4000-8000-000000000002', 'manager@a.test'),
  ('a0000000-0000-4000-8000-000000000003', 'agent@a.test'),
  ('a0000000-0000-4000-8000-000000000004', 'agent2@a.test'),
  ('a0000000-0000-4000-8000-000000000005', 'agent3@a.test'),
  ('b0000000-0000-4000-8000-000000000001', 'admin@b.test'),
  ('b0000000-0000-4000-8000-000000000003', 'agent@b.test'),
  ('c0000000-0000-4000-8000-000000000001', 'owner@sotto.test');

insert into public.companies (id, name) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'Company A'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'Company B');
insert into public.teams (id, company_id, name) values
  ('aaaaaaaa-0000-4000-8000-0000000000a1', 'aaaaaaaa-0000-4000-8000-000000000000', 'North'),
  ('aaaaaaaa-0000-4000-8000-0000000000a2', 'aaaaaaaa-0000-4000-8000-000000000000', 'South'),
  ('bbbbbbbb-0000-4000-8000-0000000000b1', 'bbbbbbbb-0000-4000-8000-000000000000', 'B team');
insert into public.memberships (company_id, user_id, role, team_id) values
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'company_admin', null),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000002', 'sales_manager', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000003', 'agent', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000004', 'agent', 'aaaaaaaa-0000-4000-8000-0000000000a1'),
  ('aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000005', 'agent', 'aaaaaaaa-0000-4000-8000-0000000000a2'),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b0000000-0000-4000-8000-000000000001', 'company_admin', null),
  ('bbbbbbbb-0000-4000-8000-000000000000', 'b0000000-0000-4000-8000-000000000003', 'agent', 'bbbbbbbb-0000-4000-8000-0000000000b1');

-- One call per agent; children for the A agent's call and the B call.
insert into public.calls (id, company_id, agent_user_id) values
  ('aaaaaaaa-0000-4000-8000-0000000000c1', 'aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000003'),
  ('aaaaaaaa-0000-4000-8000-0000000000c2', 'aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000004'),
  ('aaaaaaaa-0000-4000-8000-0000000000c3', 'aaaaaaaa-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000005'),
  ('bbbbbbbb-0000-4000-8000-0000000000c1', 'bbbbbbbb-0000-4000-8000-000000000000', 'b0000000-0000-4000-8000-000000000003');

create function tests.seed_children(company uuid, call uuid, tag text) returns void
language plpgsql as $$
begin
  insert into public.devices (company_id, user_id, label)
    select company, c.agent_user_id, tag from public.calls c where c.id = call;
  insert into public.transcript_segments (company_id, call_id, speaker, text, start_ms, end_ms)
    values (company, call, 'customer', tag || ' question?', 0, 1000);
  insert into public.cards (id, company_id, call_id, type, source, text)
    values (gen_random_uuid(), company, call, 'answer', 'playbook', tag);
  insert into public.card_timings (company_id, call_id, card_id, turn_kind, source, stt_final_ms, lookup_ms, first_delta_ms, total_ms)
    values (company, call, gen_random_uuid(), 'question', 'playbook', 100, 5, 120, 300);
  insert into public.playbook_entries (company_id, kind, question, short_answer)
    values (company, 'faq', tag || ' parking?', 'Yes.');
  insert into public.escalations (company_id, call_id, question, question_hash)
    values (company, call, tag || ' school?', md5(tag));
  insert into public.prompt_versions (company_id, key, version, scope, stage, body)
    values (company, 'suggest', 1, 'company', 'suggest', tag);
  insert into public.model_routes (company_id, stage, provider, model)
    values (company, 'suggest', 'fake', tag);
  insert into public.feature_flags (company_id, flag, enabled) values (company, 'crm', true);
end
$$;
select tests.seed_children('aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'A');
select tests.seed_children('bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'B');

-- Act as a user (and optionally a JWT app_metadata) for the rest of the transaction.
create function tests.act_as(uid uuid, app_meta jsonb default '{}'::jsonb) returns void
language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    jsonb_build_object('sub', uid, 'role', 'authenticated', 'app_metadata', app_meta)::text, true);
  execute 'set local role authenticated';
end
$$;

-- Four checks per table: no select, no insert, no update, no delete of the victim company's rows.
create function tests.isolated(tbl text, victim uuid, insert_sql text, who text) returns setof text
language plpgsql as $$
begin
  return next is_empty(format('select 1 from public.%I where company_id = %L', tbl, victim),
                       who || ' cannot select ' || tbl);
  return next throws_ok(insert_sql, '42501', null, who || ' cannot insert into ' || tbl);
  return next is_empty(format('update public.%I set created_at = created_at where company_id = %L returning 1', tbl, victim),
                       who || ' cannot update ' || tbl);
  return next is_empty(format('delete from public.%I where company_id = %L returning 1', tbl, victim),
                       who || ' cannot delete ' || tbl);
end
$$;
grant execute on all functions in schema tests to authenticated;

-- Inserts that try to write into company B.
create table tests.attacks (tbl text primary key, sql text not null);
grant select on tests.attacks to authenticated;
insert into tests.attacks values
  ('teams',               $$insert into public.teams (company_id, name) values ('bbbbbbbb-0000-4000-8000-000000000000', 'x')$$),
  ('memberships',         $$insert into public.memberships (company_id, user_id, role) values ('bbbbbbbb-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000001', 'company_admin')$$),
  ('devices',             $$insert into public.devices (company_id, user_id) values ('bbbbbbbb-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000001')$$),
  ('calls',               $$insert into public.calls (company_id, agent_user_id) values ('bbbbbbbb-0000-4000-8000-000000000000', 'a0000000-0000-4000-8000-000000000001')$$),
  ('transcript_segments', $$insert into public.transcript_segments (company_id, call_id, speaker, text, start_ms, end_ms) values ('bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'customer', 'x', 0, 1)$$),
  ('cards',               $$insert into public.cards (id, company_id, call_id, type, source, text) values (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'answer', 'ai', 'x')$$),
  ('card_timings',        $$insert into public.card_timings (company_id, call_id, card_id, turn_kind, source, stt_final_ms, lookup_ms, first_delta_ms, total_ms) values ('bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000c1', gen_random_uuid(), 'question', 'ai', 1, 1, 1, 1)$$),
  ('playbook_entries',    $$insert into public.playbook_entries (company_id, kind, question, short_answer) values ('bbbbbbbb-0000-4000-8000-000000000000', 'faq', 'x', 'y')$$),
  ('escalations',         $$insert into public.escalations (company_id, call_id, question, question_hash) values ('bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'x', 'h')$$),
  ('prompt_versions',     $$insert into public.prompt_versions (company_id, key, version, scope, stage, body) values ('bbbbbbbb-0000-4000-8000-000000000000', 'k', 9, 'company', 'suggest', 'x')$$),
  ('model_routes',        $$insert into public.model_routes (company_id, stage, provider, model) values ('bbbbbbbb-0000-4000-8000-000000000000', 'judge', 'fake', 'x')$$),
  ('feature_flags',       $$insert into public.feature_flags (company_id, flag) values ('bbbbbbbb-0000-4000-8000-000000000000', 'x')$$),
  ('audit_log',           $$insert into public.audit_log (company_id, action, target_table) values ('bbbbbbbb-0000-4000-8000-000000000000', 'x', 'y')$$),
  ('outbox',              $$insert into public.outbox (company_id, kind, idempotency_key, payload) values ('bbbbbbbb-0000-4000-8000-000000000000', 'x', 'k', '{}')$$);

-- ── the matrix: company A's admin (strongest tenant user) against company B ──
select tests.act_as('a0000000-0000-4000-8000-000000000001');
select tests.isolated(tbl, 'bbbbbbbb-0000-4000-8000-000000000000', sql, 'A admin') from tests.attacks order by tbl;
select is_empty($$select 1 from public.companies where id = 'bbbbbbbb-0000-4000-8000-000000000000'$$, 'A admin cannot select company B');
select is_empty($$update public.companies set name = 'pwned' where id = 'bbbbbbbb-0000-4000-8000-000000000000' returning 1$$, 'A admin cannot update company B');
select is_empty($$delete from public.companies where id = 'bbbbbbbb-0000-4000-8000-000000000000' returning 1$$, 'A admin cannot delete company B');
select throws_ok($$insert into public.companies (name) values ('new')$$, '42501', null, 'A admin cannot create companies');
reset role;

-- ── the same matrix for company A's per-call worker (D-012) ──
select tests.act_as('a0000000-0000-4000-8000-000000000003',
  '{"sotto_role": "worker", "company_id": "aaaaaaaa-0000-4000-8000-000000000000", "call_id": "aaaaaaaa-0000-4000-8000-0000000000c1"}');
select tests.isolated(tbl, 'bbbbbbbb-0000-4000-8000-000000000000', sql, 'A worker') from tests.attacks order by tbl;
select is_empty($$select 1 from public.companies where id = 'bbbbbbbb-0000-4000-8000-000000000000'$$, 'A worker cannot select company B');
-- A worker claiming B's call but A's company still cannot write into B.
reset role;
select tests.act_as('a0000000-0000-4000-8000-000000000003',
  '{"sotto_role": "worker", "company_id": "aaaaaaaa-0000-4000-8000-000000000000", "call_id": "bbbbbbbb-0000-4000-8000-0000000000c1"}');
select throws_ok($$insert into public.cards (id, company_id, call_id, type, source, text) values (gen_random_uuid(), 'bbbbbbbb-0000-4000-8000-000000000000', 'bbbbbbbb-0000-4000-8000-0000000000c1', 'answer', 'ai', 'x')$$,
  '42501', null, 'worker with a foreign call_id still cannot write into company B');
reset role;

-- B rows are all still there (nothing was changed by the attempts above).
select is((select count(*)::int from public.playbook_entries where company_id = 'bbbbbbbb-0000-4000-8000-000000000000'), 1, 'company B playbook untouched');
select is((select name from public.companies where id = 'bbbbbbbb-0000-4000-8000-000000000000'), 'Company B', 'company B name untouched');

-- ── roles inside one company (R3 table) ──
select tests.act_as('a0000000-0000-4000-8000-000000000003');  -- agent, team North
select results_eq($$select id from public.calls order by id$$,
  $$values ('aaaaaaaa-0000-4000-8000-0000000000c1'::uuid)$$, 'an agent sees only their own calls');
select throws_ok($$insert into public.playbook_entries (company_id, kind, question, short_answer) values ('aaaaaaaa-0000-4000-8000-000000000000', 'faq', 'q', 'a')$$,
  '42501', null, 'an agent cannot edit the playbook');
select is_empty($$select 1 from public.prompt_versions$$, 'an agent cannot read prompts');
select is_empty($$select 1 from public.escalations$$, 'an agent cannot read escalations');
select is((select count(*)::int from public.playbook_entries), 1, 'an agent reads the company playbook');
reset role;

select tests.act_as('a0000000-0000-4000-8000-000000000002');  -- manager, team North
select results_eq($$select id from public.calls order by id$$,
  $$values ('aaaaaaaa-0000-4000-8000-0000000000c1'::uuid), ('aaaaaaaa-0000-4000-8000-0000000000c2'::uuid)$$,
  'a manager sees their team''s calls only');
select lives_ok($$insert into public.playbook_entries (company_id, kind, question, short_answer) values ('aaaaaaaa-0000-4000-8000-000000000000', 'faq', 'q', 'a')$$,
  'a manager can edit the playbook');
select throws_ok($$insert into public.prompt_versions (company_id, key, version, scope, stage, body) values ('aaaaaaaa-0000-4000-8000-000000000000', 'k', 2, 'company', 'suggest', 'x')$$,
  '42501', null, 'a manager cannot edit prompts');
select is((select count(*)::int from public.escalations), 1, 'a manager reads escalations');
reset role;

select tests.act_as('a0000000-0000-4000-8000-000000000001');  -- admin
select is((select count(*)::int from public.calls), 3, 'an admin sees every call in the company');
select lives_ok($$insert into public.prompt_versions (company_id, key, version, scope, stage, body) values ('aaaaaaaa-0000-4000-8000-000000000000', 'k', 2, 'company', 'suggest', 'x')$$,
  'an admin can edit prompts');
select lives_ok($$update public.memberships set role = 'sales_manager' where user_id = 'a0000000-0000-4000-8000-000000000005'$$,
  'an admin can change roles');
select ok((select count(*) from public.audit_log where target_table = 'memberships' and action = 'update') = 1,
  'role changes land in the audit log');
reset role;

-- ── the worker inside its own company ──
select tests.act_as('a0000000-0000-4000-8000-000000000003',
  '{"sotto_role": "worker", "company_id": "aaaaaaaa-0000-4000-8000-000000000000", "call_id": "aaaaaaaa-0000-4000-8000-0000000000c1"}');
select lives_ok($$insert into public.cards (id, company_id, call_id, type, source, text) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'answer', 'ai', 'x')$$,
  'the worker writes cards for its call');
select throws_ok($$insert into public.cards (id, company_id, call_id, type, source, text) values (gen_random_uuid(), 'aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c2', 'answer', 'ai', 'x')$$,
  '42501', null, 'the worker cannot write cards for another call');
select is((select count(*)::int from public.playbook_entries), 2, 'the worker reads its company playbook');
select lives_ok($$insert into public.escalations (company_id, call_id, question, question_hash) values ('aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Pets?', 'pets')$$,
  'the worker files an escalation');
select throws_ok($$insert into public.escalations (company_id, call_id, question, question_hash) values ('aaaaaaaa-0000-4000-8000-000000000000', 'aaaaaaaa-0000-4000-8000-0000000000c1', 'Pets?', 'pets')$$,
  '23505', null, 'the same question cannot escalate twice in one call (R2)');
reset role;
select is((select count(*)::int from public.outbox where kind = 'escalation_email'), 3, 'one manager email queued per escalation');

-- ── platform owner ──
select tests.act_as('c0000000-0000-4000-8000-000000000001', '{"sotto_role": "platform_owner"}');
select lives_ok($$insert into public.companies (name) values ('Company C')$$, 'the platform owner creates companies');
select is_empty($$select 1 from public.calls$$, 'the platform owner does not read tenant calls');
reset role;

-- ── anon sees nothing ──
set local role anon;
select throws_ok($$select 1 from public.companies$$, '42501', null, 'anon has no table access');
reset role;

select * from finish();
rollback;
