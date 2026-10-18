-- Sotto tenancy schema (P5.1, P5.2; ARCHITECTURE §3; R3; D-012).
-- Every tenant table: company_id not null, RLS on, policies per role, pgTAP isolation test in
-- supabase/tests/. Global tables: plans, platform_prompt_versions, platform_model_routes.
--
-- Who is who (all from the Supabase JWT, read with auth.uid() / auth.jwt()):
--   * a user: auth.uid() + rows in memberships (company_admin | sales_manager | agent);
--   * the platform owner: app_metadata.sotto_role = 'platform_owner';
--   * the per-call worker (D-012): app_metadata.sotto_role = 'worker' with company_id and call_id.

create extension if not exists pgcrypto;

create schema if not exists app;
grant usage on schema app to authenticated, anon;

create type app.member_role as enum ('company_admin', 'sales_manager', 'agent');
create type app.plan_state as enum ('trial', 'active', 'expired', 'suspended');

-- ── identity helpers (security definer: they read memberships without recursing into RLS) ──

create function app.jwt_role() returns text
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'sotto_role', '')
$$;

create function app.is_platform_owner() returns boolean
language sql stable set search_path = '' as $$
  select app.jwt_role() = 'platform_owner'
$$;

create function app.worker_company() returns uuid
language sql stable set search_path = '' as $$
  select case when app.jwt_role() = 'worker'
              then nullif(auth.jwt() -> 'app_metadata' ->> 'company_id', '')::uuid end
$$;

create function app.worker_call() returns uuid
language sql stable set search_path = '' as $$
  select case when app.jwt_role() = 'worker'
              then nullif(auth.jwt() -> 'app_metadata' ->> 'call_id', '')::uuid end
$$;

-- ── global tables ──

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  seat_limit int not null check (seat_limit > 0),
  monthly_minutes int not null check (monthly_minutes >= 0),
  trial_days int not null default 14 check (trial_days >= 0),
  created_at timestamptz not null default now()
);

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  -- Same value as id, so every table can be filtered by company_id the same way.
  company_id uuid generated always as (id) stored,
  name text not null check (length(name) between 1 and 200),
  plan_id uuid references public.plans (id),
  plan_state app.plan_state not null default 'trial',
  trial_ends_at timestamptz not null default (now() + interval '14 days'),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role app.member_role not null,
  team_id uuid,
  created_at timestamptz not null default now(),
  unique (company_id, user_id),
  foreign key (company_id, team_id) references public.teams (company_id, id)
);
create index memberships_user_idx on public.memberships (user_id);

create function app.has_role(target uuid, roles app.member_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.company_id = target and m.user_id = auth.uid() and m.role = any (roles)
  )
$$;

create function app.is_member(target uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m where m.company_id = target and m.user_id = auth.uid()
  )
$$;

-- A sales manager sees their own team's agents (R3 "own team").
create function app.manages(target uuid, agent uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mgr
    join public.memberships a on a.company_id = mgr.company_id and a.team_id = mgr.team_id
    where mgr.company_id = target and mgr.user_id = auth.uid() and mgr.role = 'sales_manager'
      and a.user_id = agent
  )
$$;

grant execute on all functions in schema app to authenticated;

-- ── tenant tables ──

create table public.devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  label text not null default '',
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.calls (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  agent_user_id uuid not null references auth.users (id),
  customer_ref text not null default '',
  status text not null default 'dialling'
    check (status in ('dialling', 'live', 'ended', 'failed')),
  end_reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  unique (company_id, id)
);

create function app.can_see_call(target uuid, agent uuid) returns boolean
language sql stable set search_path = '' as $$
  select agent = auth.uid()
      or app.has_role(target, array['company_admin']::app.member_role[])
      or app.manages(target, agent)
$$;

create table public.transcript_segments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  speaker text not null check (speaker in ('customer', 'agent')),
  text text not null,
  start_ms int not null check (start_ms >= 0),
  end_ms int not null check (end_ms >= start_ms),
  created_at timestamptz not null default now(),
  foreign key (company_id, call_id) references public.calls (company_id, id) on delete cascade
);

create table public.cards (
  id uuid primary key,
  company_id uuid not null,
  call_id uuid not null,
  type text not null check (type in ('answer', 'question', 'objection', 'warning', 'holding')),
  source text not null check (source in ('playbook', 'ai', 'backup', 'holding')),
  text text not null,
  playbook_ref text,
  feedback smallint check (feedback in (-1, 1)),
  created_at timestamptz not null default now(),
  foreign key (company_id, call_id) references public.calls (company_id, id) on delete cascade
);

create table public.card_timings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  card_id uuid not null,
  turn_kind text not null,
  source text not null,
  stt_final_ms int not null,
  lookup_ms int not null,
  first_token_ms int,
  first_delta_ms int not null,
  total_ms int not null,
  provider text,
  model text,
  fallback_reason text,
  created_at timestamptz not null default now(),
  foreign key (company_id, call_id) references public.calls (company_id, id) on delete cascade
);

create table public.playbook_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null check (kind in ('faq', 'objection', 'product', 'never_promise')),
  question text not null,
  short_answer text not null,
  details text not null default '',
  follow_up text not null default '',
  tags text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table public.escalations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  call_id uuid not null,
  question text not null,
  question_hash text not null,
  transcript_excerpt text not null default '',
  status text not null default 'open' check (status in ('open', 'answered', 'added')),
  answer text,
  created_at timestamptz not null default now(),
  -- One escalation per question per call (R2 "exactly one manager email").
  unique (call_id, question_hash),
  foreign key (company_id, call_id) references public.calls (company_id, id) on delete cascade
);

create table public.prompt_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  key text not null,
  version int not null check (version >= 1),
  scope text not null check (scope in ('company', 'team', 'campaign')),
  scope_id uuid,
  stage text not null,
  variables text[] not null default '{}',
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (company_id, key, scope, scope_id, version)
);

create table public.model_routes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  stage text not null,
  provider text not null,
  model text not null,
  base_url text,
  settings jsonb not null default '{}'::jsonb,
  backup_allowed boolean not null default true,
  created_at timestamptz not null default now(),
  unique (company_id, stage)
);

create table public.feature_flags (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  flag text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (company_id, flag)
);

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  actor_user_id uuid,
  action text not null,
  target_table text not null,
  target_id uuid,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create table public.outbox (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  kind text not null,
  idempotency_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'dead')),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table public.platform_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  key text not null,
  version int not null check (version >= 1),
  stage text not null,
  variables text[] not null default '{}',
  body text not null,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  unique (key, version)
);

create table public.platform_model_routes (
  id uuid primary key default gen_random_uuid(),
  stage text not null unique,
  provider text not null,
  model text not null,
  settings jsonb not null default '{}'::jsonb,
  first_token_ms int,
  created_at timestamptz not null default now()
);

-- ── RLS ──

alter table public.plans enable row level security;
alter table public.companies enable row level security;
alter table public.teams enable row level security;
alter table public.memberships enable row level security;
alter table public.devices enable row level security;
alter table public.calls enable row level security;
alter table public.transcript_segments enable row level security;
alter table public.cards enable row level security;
alter table public.card_timings enable row level security;
alter table public.playbook_entries enable row level security;
alter table public.escalations enable row level security;
alter table public.prompt_versions enable row level security;
alter table public.model_routes enable row level security;
alter table public.feature_flags enable row level security;
alter table public.audit_log enable row level security;
alter table public.outbox enable row level security;  -- no policies: service role only
alter table public.platform_prompt_versions enable row level security;
alter table public.platform_model_routes enable row level security;

-- Global tables: readable when signed in, writable by the platform owner.
create policy plans_read on public.plans for select to authenticated using (true);
create policy plans_owner on public.plans for all to authenticated
  using (app.is_platform_owner()) with check (app.is_platform_owner());
create policy ppv_read on public.platform_prompt_versions for select to authenticated using (true);
create policy ppv_owner on public.platform_prompt_versions for all to authenticated
  using (app.is_platform_owner()) with check (app.is_platform_owner());
create policy pmr_read on public.platform_model_routes for select to authenticated using (true);
create policy pmr_owner on public.platform_model_routes for all to authenticated
  using (app.is_platform_owner()) with check (app.is_platform_owner());

-- companies: members read; admins update settings; the platform owner creates and manages.
create policy companies_read on public.companies for select to authenticated
  using (app.is_member(id) or app.is_platform_owner() or id = app.worker_company());
create policy companies_admin_update on public.companies for update to authenticated
  using (app.has_role(id, array['company_admin']::app.member_role[]))
  with check (app.has_role(id, array['company_admin']::app.member_role[]));
create policy companies_owner on public.companies for all to authenticated
  using (app.is_platform_owner()) with check (app.is_platform_owner());

-- teams / memberships: members read; admins write (R3 "invite users, set roles").
create policy teams_read on public.teams for select to authenticated
  using (app.is_member(company_id));
create policy teams_admin on public.teams for all to authenticated
  using (app.has_role(company_id, array['company_admin']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin']::app.member_role[]));
create policy memberships_read on public.memberships for select to authenticated
  using (user_id = auth.uid()
         or app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[])
         or app.is_platform_owner());
create policy memberships_admin on public.memberships for all to authenticated
  using (app.has_role(company_id, array['company_admin']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin']::app.member_role[]));

-- devices: your own, in a company you belong to; admins can revoke any in their company.
create policy devices_own on public.devices for all to authenticated
  using (user_id = auth.uid() and app.is_member(company_id))
  with check (user_id = auth.uid() and app.is_member(company_id));
create policy devices_admin on public.devices for all to authenticated
  using (app.has_role(company_id, array['company_admin']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin']::app.member_role[]));

-- calls: the agent's own, the admin's company, the manager's team; the worker its one call.
create policy calls_read on public.calls for select to authenticated
  using (app.can_see_call(company_id, agent_user_id)
         or (company_id = app.worker_company() and id = app.worker_call()));
create policy calls_worker_update on public.calls for update to authenticated
  using (company_id = app.worker_company() and id = app.worker_call())
  with check (company_id = app.worker_company() and id = app.worker_call());

-- call children: read like the call; only the worker of that call writes them.
create policy segments_read on public.transcript_segments for select to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id and c.company_id = transcript_segments.company_id
                 and app.can_see_call(c.company_id, c.agent_user_id)));
create policy segments_worker on public.transcript_segments for insert to authenticated
  with check (company_id = app.worker_company() and call_id = app.worker_call());
create policy cards_read on public.cards for select to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id and c.company_id = cards.company_id
                 and app.can_see_call(c.company_id, c.agent_user_id)));
create policy cards_worker on public.cards for insert to authenticated
  with check (company_id = app.worker_company() and call_id = app.worker_call());
create policy cards_feedback on public.cards for update to authenticated
  using (exists (select 1 from public.calls c where c.id = call_id and c.company_id = cards.company_id
                 and c.agent_user_id = auth.uid()))
  with check (exists (select 1 from public.calls c where c.id = call_id and c.company_id = cards.company_id
                      and c.agent_user_id = auth.uid()));
create policy timings_read on public.card_timings for select to authenticated
  using (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[]));
create policy timings_worker on public.card_timings for insert to authenticated
  with check (company_id = app.worker_company() and call_id = app.worker_call());

-- playbook: everyone in the company and its worker read; admins and managers edit (R3).
create policy playbook_read on public.playbook_entries for select to authenticated
  using (app.is_member(company_id) or company_id = app.worker_company());
create policy playbook_edit on public.playbook_entries for all to authenticated
  using (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[]));

-- escalations: the worker files them for its call; admins and managers read and answer.
create policy escalations_staff on public.escalations for select to authenticated
  using (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[]));
create policy escalations_answer on public.escalations for update to authenticated
  using (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[]));
create policy escalations_worker on public.escalations for insert to authenticated
  with check (company_id = app.worker_company() and call_id = app.worker_call());

-- prompts, model routes, flags: admins edit; managers and the worker read (R6).
create policy prompts_read on public.prompt_versions for select to authenticated
  using (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[])
         or company_id = app.worker_company());
create policy prompts_admin on public.prompt_versions for all to authenticated
  using (app.has_role(company_id, array['company_admin']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin']::app.member_role[]));
create policy routes_read on public.model_routes for select to authenticated
  using (app.has_role(company_id, array['company_admin', 'sales_manager']::app.member_role[])
         or company_id = app.worker_company());
create policy routes_admin on public.model_routes for all to authenticated
  using (app.has_role(company_id, array['company_admin']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin']::app.member_role[]));
create policy flags_read on public.feature_flags for select to authenticated
  using (app.is_member(company_id) or company_id = app.worker_company());
create policy flags_admin on public.feature_flags for all to authenticated
  using (app.has_role(company_id, array['company_admin']::app.member_role[]))
  with check (app.has_role(company_id, array['company_admin']::app.member_role[]));

-- audit log: admins read; rows come only from the audit trigger below.
create policy audit_read on public.audit_log for select to authenticated
  using (app.has_role(company_id, array['company_admin']::app.member_role[]));

-- ── audit trail for admin actions (R3: role, playbook, prompt, model, plan changes) ──

create function app.audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  row_company uuid := coalesce((to_jsonb(new) ->> 'company_id')::uuid, (to_jsonb(old) ->> 'company_id')::uuid);
begin
  insert into public.audit_log (company_id, actor_user_id, action, target_table, target_id, before, after)
  values (row_company, auth.uid(), lower(tg_op), tg_table_name,
          coalesce((to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid),
          case when tg_op <> 'INSERT' then to_jsonb(old) end,
          case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end
$$;

create trigger audit_memberships after insert or update or delete on public.memberships
  for each row execute function app.audit();
create trigger audit_playbook after insert or update or delete on public.playbook_entries
  for each row execute function app.audit();
create trigger audit_prompts after insert or update or delete on public.prompt_versions
  for each row execute function app.audit();
create trigger audit_routes after insert or update or delete on public.model_routes
  for each row execute function app.audit();
create trigger audit_flags after insert or update or delete on public.feature_flags
  for each row execute function app.audit();
create trigger audit_companies after update on public.companies
  for each row execute function app.audit();

-- ── escalation → outbox (one manager email per escalation; idempotent, R2) ──

create function app.enqueue_escalation_email() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.outbox (company_id, kind, idempotency_key, payload)
  values (new.company_id, 'escalation_email', 'escalation:' || new.call_id || ':' || new.question_hash,
          jsonb_build_object('escalation_id', new.id, 'question', new.question))
  on conflict (idempotency_key) do nothing;
  return new;
end
$$;

create trigger escalation_email after insert on public.escalations
  for each row execute function app.enqueue_escalation_email();

grant select, insert, update, delete on all tables in schema public to authenticated;
