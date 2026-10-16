-- For an existing project that already ran schema.sql. Safe to rerun.
begin;
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
