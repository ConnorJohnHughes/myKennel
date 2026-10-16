-- Apply after schema.sql (or the earlier staff-edit migration in an existing project).
-- Preserves existing records and memberships. Safe to rerun.
begin;
create schema if not exists mykennel_private;
revoke all on schema mykennel_private from public, anon, authenticated;
create table if not exists mykennel_private.access_settings (
  singleton boolean primary key default true check (singleton),
  code_hash text not null
);
revoke all on mykennel_private.access_settings from public, anon, authenticated;

create or replace function public.set_kennel_access_code(access_code text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if access_code is null or length(btrim(access_code)) < 24 then
    raise exception 'Use a random kennel code at least 24 characters long';
  end if;
  insert into mykennel_private.access_settings(singleton,code_hash)
    values (true,encode(sha256(convert_to(btrim(access_code),'UTF8')),'hex'))
    on conflict(singleton) do update set code_hash=excluded.code_hash;
end;
$$;
revoke all on function public.set_kennel_access_code(text) from public, anon, authenticated;

create or replace function public.join_kennel(access_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  expected_hash text;
begin
  if (select auth.uid()) is null then raise exception 'Connect this device first'; end if;
  select code_hash into expected_hash from mykennel_private.access_settings where singleton=true;
  if expected_hash is null then raise exception 'The kennel code has not been configured in Supabase yet'; end if;
  if access_code is null or length(btrim(access_code)) < 24
    or encode(sha256(convert_to(btrim(access_code),'UTF8')),'hex') <> expected_hash then
    raise exception 'That kennel code is incorrect';
  end if;
  insert into public.staff(user_id) values ((select auth.uid())) on conflict(user_id) do nothing;
end;
$$;
revoke all on function public.join_kennel(text) from public, anon, authenticated;
grant execute on function public.join_kennel(text) to authenticated;

alter table public.litters add column if not exists version integer not null default 1;
alter table public.puppies add column if not exists version integer not null default 1;
alter table public.weights add column if not exists version integer not null default 1;
create or replace function public.bump_record_version() returns trigger language plpgsql
  set search_path = '' as $$
begin
  new.version := old.version+1;
  return new;
end;
$$;
drop trigger if exists bump_litter_version on public.litters;
create trigger bump_litter_version before update on public.litters
  for each row execute function public.bump_record_version();
drop trigger if exists bump_puppy_version on public.puppies;
create trigger bump_puppy_version before update on public.puppies
  for each row execute function public.bump_record_version();
drop trigger if exists bump_weight_version on public.weights;
create trigger bump_weight_version before update on public.weights
  for each row execute function public.bump_record_version();

-- Supabase Realtime uses these tables with the existing membership/RLS rules.
do $$
declare
  target_table text;
begin
  if not exists(select 1 from pg_publication where pubname='supabase_realtime') then
    create publication supabase_realtime;
  end if;
  foreach target_table in array array['litters','puppies','weights','staff'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename=target_table) then
      execute format('alter publication supabase_realtime add table public.%I',target_table);
    end if;
  end loop;
end;
$$;
commit;
