-- Run once in a new Supabase project's SQL editor. Staff have read/add/edit access.
begin;
create table public.staff (
  user_id uuid primary key references auth.users(id) on delete cascade
);
alter table public.staff enable row level security;
create policy "Staff can see their own membership" on public.staff
  for select to authenticated using (user_id = (select auth.uid()));

create table public.litters (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 100),
  mother text not null check (length(btrim(mother)) between 1 and 100),
  father text not null check (length(btrim(father)) between 1 and 100),
  born date not null check (born <= current_date),
  created_at timestamptz not null default now()
);
create table public.puppies (
  id uuid primary key default gen_random_uuid(),
  litter_id uuid not null references public.litters(id),
  name text not null check (length(btrim(name)) between 1 and 100),
  created_at timestamptz not null default now()
);
create unique index puppy_identifier_per_litter on public.puppies(litter_id, lower(btrim(name)));
create table public.weights (
  id uuid primary key default gen_random_uuid(),
  puppy_id uuid not null references public.puppies(id),
  date date not null check (date <= current_date),
  grams numeric(12,3) not null check (grams > 0 and grams <= 100000),
  created_at timestamptz not null default now(),
  unique (puppy_id, date)
);
create or replace function public.validate_weigh_in_birth() returns trigger language plpgsql
  set search_path = '' as $$
declare
  birth_date date;
begin
  -- Serialize weigh-ins and birth-date corrections for the same litter.
  select l.born into birth_date from public.litters l
    join public.puppies p on p.litter_id = l.id where p.id = new.puppy_id
    for update of l;
  if new.date < birth_date then
    raise exception 'A weigh-in cannot be before the litter birth date';
  end if;
  return new;
end;
$$;
create trigger check_weigh_in_birth before insert or update on public.weights
  for each row execute function public.validate_weigh_in_birth();

alter table public.litters enable row level security;
alter table public.puppies enable row level security;
alter table public.weights enable row level security;
create policy "Staff read litters" on public.litters for select to authenticated
  using (exists (select 1 from public.staff where user_id = (select auth.uid())));
create policy "Staff add litters" on public.litters for insert to authenticated
  with check (exists (select 1 from public.staff where user_id = (select auth.uid())));
create policy "Staff read puppies" on public.puppies for select to authenticated
  using (exists (select 1 from public.staff where user_id = (select auth.uid())));
create policy "Staff add puppies" on public.puppies for insert to authenticated
  with check (exists (select 1 from public.staff where user_id = (select auth.uid())));
create policy "Staff read weights" on public.weights for select to authenticated
  using (exists (select 1 from public.staff where user_id = (select auth.uid())));
create policy "Staff add weights" on public.weights for insert to authenticated
  with check (exists (select 1 from public.staff where user_id = (select auth.uid())));
revoke all on public.staff, public.litters, public.puppies, public.weights from anon, authenticated;
grant select on public.staff to authenticated;
grant select, insert on public.litters, public.puppies, public.weights to authenticated;

-- Staff corrections (also supplied separately for existing projects).
create or replace function public.validate_litter_birth_edit() returns trigger language plpgsql
  set search_path = '' as $$
begin
  if exists (select 1 from public.weights w join public.puppies p on p.id=w.puppy_id
    where p.litter_id=new.id and w.date < new.born) then
    raise exception 'Birth date cannot be after an existing weigh-in. Correct the weigh-in first.';
  end if;
  return new;
end;
$$;
drop trigger if exists check_litter_birth_edit on public.litters;
create trigger check_litter_birth_edit before update of born on public.litters
  for each row execute function public.validate_litter_birth_edit();

drop policy if exists "Staff edit litters" on public.litters;
create policy "Staff edit litters" on public.litters for update to authenticated
  using (exists (select 1 from public.staff where user_id = (select auth.uid())))
  with check (exists (select 1 from public.staff where user_id = (select auth.uid())));
drop policy if exists "Staff edit puppies" on public.puppies;
create policy "Staff edit puppies" on public.puppies for update to authenticated
  using (exists (select 1 from public.staff where user_id = (select auth.uid())))
  with check (exists (select 1 from public.staff where user_id = (select auth.uid())));
drop policy if exists "Staff edit weights" on public.weights;
create policy "Staff edit weights" on public.weights for update to authenticated
  using (exists (select 1 from public.staff where user_id = (select auth.uid())))
  with check (exists (select 1 from public.staff where user_id = (select auth.uid())));
-- Only editable fields: clients cannot change IDs, relationships, or staff membership.
grant update (name,mother,father,born) on public.litters to authenticated;
grant update (name) on public.puppies to authenticated;
grant update (date,grams) on public.weights to authenticated;
commit;
