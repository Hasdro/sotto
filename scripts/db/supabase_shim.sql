-- Minimal Supabase stand-ins for running migrations + pgTAP on a plain Postgres (scripts/db-test.sh).
-- Real Supabase already has all of this; never apply it to a Supabase database.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
grant usage on schema public to anon, authenticated, service_role;

create schema auth;
grant usage on schema auth to anon, authenticated, service_role;
create table auth.users (id uuid primary key, email text);

-- Same contract as Supabase: claims come from the request.jwt.claims setting.
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant execute on all functions in schema auth to anon, authenticated, service_role;

create extension if not exists pgtap;
