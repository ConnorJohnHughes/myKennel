-- Additive migration for the LIVE shared kennel. Preserves litters, puppies, weights, codes, and memberships.
begin;
create table if not exists public.heat_dogs (
  id uuid primary key default gen_random_uuid(),
  name text not null check(length(btrim(name)) between 1 and 100),
  version integer not null default 1,
  created_at timestamptz not null default now()
);
create unique index if not exists heat_dog_name on public.heat_dogs(lower(btrim(name)));
create table if not exists public.heat_cycles (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.heat_dogs(id),
  detected date not null check(detected<=current_date),
  version integer not null default 1,
  created_at timestamptz not null default now(),
  unique(dog_id,detected)
);
alter table public.heat_dogs enable row level security;
alter table public.heat_cycles enable row level security;
drop policy if exists "Members read heat dogs" on public.heat_dogs;
create policy "Members read heat dogs" on public.heat_dogs for select to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid())));
drop policy if exists "Members add heat dogs" on public.heat_dogs;
create policy "Members add heat dogs" on public.heat_dogs for insert to authenticated with check(exists(select 1 from public.staff where user_id=(select auth.uid())));
drop policy if exists "Members edit heat dogs" on public.heat_dogs;
create policy "Members edit heat dogs" on public.heat_dogs for update to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid()))) with check(exists(select 1 from public.staff where user_id=(select auth.uid())));
drop policy if exists "Members read heat dates" on public.heat_cycles;
create policy "Members read heat dates" on public.heat_cycles for select to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid())));
drop policy if exists "Members add heat dates" on public.heat_cycles;
create policy "Members add heat dates" on public.heat_cycles for insert to authenticated with check(exists(select 1 from public.staff where user_id=(select auth.uid())));
drop policy if exists "Members edit heat dates" on public.heat_cycles;
create policy "Members edit heat dates" on public.heat_cycles for update to authenticated using(exists(select 1 from public.staff where user_id=(select auth.uid()))) with check(exists(select 1 from public.staff where user_id=(select auth.uid())));
revoke all on public.heat_dogs,public.heat_cycles from anon,authenticated;
grant select,insert on public.heat_dogs,public.heat_cycles to authenticated;
grant update(name) on public.heat_dogs to authenticated;
grant update(detected) on public.heat_cycles to authenticated;
drop trigger if exists bump_heat_dog_version on public.heat_dogs;
create trigger bump_heat_dog_version before update on public.heat_dogs for each row execute function public.bump_record_version();
drop trigger if exists bump_heat_cycle_version on public.heat_cycles;
create trigger bump_heat_cycle_version before update on public.heat_cycles for each row execute function public.bump_record_version();
create or replace function public.add_heat_dog(dog_name text,detected_date date) returns uuid language plpgsql set search_path='' as $$
declare result uuid;
begin
  insert into public.heat_dogs(name) values(btrim(dog_name)) returning id into result;
  insert into public.heat_cycles(dog_id,detected) values(result,detected_date);
  return result;
end;
$$;
revoke all on function public.add_heat_dog(text,date) from public,anon;
grant execute on function public.add_heat_dog(text,date) to authenticated;

do $$
declare target text;
begin
  foreach target in array array['heat_dogs','heat_cycles'] loop
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename=target) then
      execute format('alter publication supabase_realtime add table public.%I',target);
    end if;
  end loop;
end;
$$;

create table if not exists mykennel_private.heat_push_settings (
  singleton boolean primary key default true check(singleton), enabled boolean not null default false, public_key text
);
revoke all on mykennel_private.heat_push_settings from public,anon,authenticated;
create table if not exists public.heat_push_subscriptions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  endpoint text not null unique check(endpoint ~ '^https://(fcm[.]googleapis[.]com|updates[.]push[.]services[.]mozilla[.]com|web[.]push[.]apple[.]com|[a-z0-9-]+[.]notify[.]windows[.]com)/'),
  p256dh text not null check(p256dh ~ '^[A-Za-z0-9_-]{80,100}={0,2}$'),
  auth text not null check(auth ~ '^[A-Za-z0-9_-]{20,30}={0,2}$'),
  timezone text not null, enabled boolean not null default true, created_at timestamptz not null default now()
);
alter table public.heat_push_subscriptions enable row level security;
drop policy if exists "Own heat reminder devices" on public.heat_push_subscriptions;
create policy "Own heat reminder devices" on public.heat_push_subscriptions for select to authenticated using(user_id=(select auth.uid()) and exists(select 1 from public.staff where user_id=(select auth.uid())));
revoke all on public.heat_push_subscriptions from public,anon,authenticated;
grant select on public.heat_push_subscriptions to authenticated;
create or replace function public.set_heat_push_config(vapid_public_key text,ready boolean) returns void language plpgsql security definer set search_path='' as $$
begin
  if vapid_public_key !~ '^[A-Za-z0-9_-]{87}$' or vapid_public_key is null then raise exception 'Invalid VAPID public key'; end if;
  insert into mykennel_private.heat_push_settings(singleton,public_key,enabled) values(true,vapid_public_key,ready)
  on conflict(singleton) do update set public_key=excluded.public_key,enabled=excluded.enabled;
end;
$$;
revoke all on function public.set_heat_push_config(text,boolean) from public,anon,authenticated;
create or replace function public.get_heat_push_config() returns jsonb language plpgsql security definer set search_path='' as $$
begin
  if not exists(select 1 from public.staff where user_id=(select auth.uid())) then raise exception 'Kennel access required';end if;
  return coalesce((select jsonb_build_object('ready',enabled,'publicKey',public_key) from mykennel_private.heat_push_settings where singleton),'{"ready":false}'::jsonb);
end;
$$;
revoke all on function public.get_heat_push_config() from public,anon;
grant execute on function public.get_heat_push_config() to authenticated;
create or replace function public.register_heat_push(push_endpoint text,push_p256dh text,push_auth text,device_timezone text) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not exists(select 1 from public.staff where user_id=(select auth.uid())) then raise exception 'Kennel access required';end if;
  if not exists(select 1 from pg_timezone_names where name=device_timezone) then raise exception 'Invalid device timezone';end if;
  if not exists(select 1 from mykennel_private.heat_push_settings where enabled) then raise exception 'Phone reminders are not configured yet';end if;
  insert into public.heat_push_subscriptions(user_id,endpoint,p256dh,auth,timezone) values((select auth.uid()),push_endpoint,push_p256dh,push_auth,device_timezone)
  on conflict(endpoint) do update set user_id=excluded.user_id,timezone=excluded.timezone,enabled=true
    where heat_push_subscriptions.p256dh=excluded.p256dh and heat_push_subscriptions.auth=excluded.auth
  returning id into result;
  if result is null then raise exception 'Device subscription could not be verified';end if;
  return result;
end;
$$;
revoke all on function public.register_heat_push(text,text,text,text) from public,anon;
grant execute on function public.register_heat_push(text,text,text,text) to authenticated;
create or replace function public.disable_heat_push(push_endpoint text) returns void language sql security definer set search_path='' as $$
  update public.heat_push_subscriptions set enabled=false where endpoint=push_endpoint and user_id=(select auth.uid());
$$;
revoke all on function public.disable_heat_push(text) from public,anon;
grant execute on function public.disable_heat_push(text) to authenticated;

create table if not exists mykennel_private.heat_push_deliveries (
  subscription_id uuid not null references public.heat_push_subscriptions(id), cycle_id uuid not null references public.heat_cycles(id),
  cycle_version integer not null, due_date date not null, lease uuid not null default gen_random_uuid(),
  claimed_at timestamptz not null default now(), sent_at timestamptz,
  primary key(subscription_id,cycle_id,cycle_version,due_date)
);
revoke all on mykennel_private.heat_push_deliveries from public,anon,authenticated;
create or replace function public.heat_push_dispatch_data() returns jsonb language sql security definer set search_path='' as $$
  select jsonb_build_object('ready',coalesce((select enabled from mykennel_private.heat_push_settings where singleton),false),
    'dogs',coalesce((select jsonb_agg(d) from public.heat_dogs d),'[]'::jsonb),
    'cycles',coalesce((select jsonb_agg(c) from (select distinct on(dog_id) * from public.heat_cycles order by dog_id,detected desc)c),'[]'::jsonb),
    'subscriptions',coalesce((select jsonb_agg(s) from public.heat_push_subscriptions s where enabled and exists(select 1 from public.staff m where m.user_id=s.user_id)),'[]'::jsonb));
$$;
create or replace function public.claim_heat_push(device_id uuid,heat_id uuid,heat_version integer,reminder_date date) returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid;
begin
  if not exists(select 1 from public.heat_push_subscriptions s join public.staff m on m.user_id=s.user_id where s.id=device_id and s.enabled) then return null;end if;
  if not exists(select 1 from public.heat_cycles c where c.id=heat_id and c.version=heat_version and not exists(select 1 from public.heat_cycles newer where newer.dog_id=c.dog_id and newer.detected>c.detected)) then return null;end if;
  insert into mykennel_private.heat_push_deliveries(subscription_id,cycle_id,cycle_version,due_date) values(device_id,heat_id,heat_version,reminder_date)
  on conflict(subscription_id,cycle_id,cycle_version,due_date) do update set lease=gen_random_uuid(),claimed_at=now()
    where heat_push_deliveries.sent_at is null and heat_push_deliveries.claimed_at<now()-interval '10 minutes'
  returning lease into result;
  return result;
end;
$$;
create or replace function public.finish_heat_push(delivery_lease uuid,delivered boolean,expired boolean default false) returns void language plpgsql security definer set search_path='' as $$
begin
  if expired then update public.heat_push_subscriptions set enabled=false where id in(select subscription_id from mykennel_private.heat_push_deliveries where lease=delivery_lease);end if;
  if delivered or expired then update mykennel_private.heat_push_deliveries set sent_at=now() where lease=delivery_lease;
  else update mykennel_private.heat_push_deliveries set claimed_at=now()-interval '11 minutes' where lease=delivery_lease and sent_at is null;end if;
end;
$$;
revoke all on function public.heat_push_dispatch_data() from public,anon,authenticated;
revoke all on function public.claim_heat_push(uuid,uuid,integer,date) from public,anon,authenticated;
revoke all on function public.finish_heat_push(uuid,boolean,boolean) from public,anon,authenticated;
grant execute on function public.heat_push_dispatch_data(),public.claim_heat_push(uuid,uuid,integer,date),public.finish_heat_push(uuid,boolean,boolean) to service_role;
commit;
