-- Membership number assignment at approval time.
-- Run this script in Supabase SQL editor.

-- Settings table used by the app (shared with theme settings).
create table if not exists public.app_settings (
  key text primary key,
  value text,
  updated_at timestamptz not null default timezone('utc', now())
);

-- Optional default start number. Change it when needed from the admin homepage.
insert into public.app_settings (key, value)
values ('membership_start_number', '1')
on conflict (key) do nothing;

create or replace function public.approve_member_with_membership_number(p_member_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  member_row public.soci%rowtype;
  start_number bigint;
  next_number bigint;
begin
  -- Serialize assignment to avoid overlapping numbers under concurrency.
  perform pg_advisory_xact_lock(hashtext('approve_member_with_membership_number'));

  select *
  into member_row
  from public.soci
  where id = p_member_id
  for update;

  if not found then
    raise exception 'Socio non trovato: %', p_member_id;
  end if;

  if member_row.stato = 'approved'
     and coalesce(trim(member_row.numero_tessera), '') <> '' then
    return trim(member_row.numero_tessera);
  end if;

  select coalesce(
    nullif(trim(value), '')::bigint,
    1
  )
  into start_number
  from public.app_settings
  where key = 'membership_start_number';

  if start_number is null or start_number < 1 then
    start_number := 1;
  end if;

  select greatest(
    start_number,
    coalesce(max(numero_tessera::bigint), 0) + 1
  )
  into next_number
  from public.soci
  where coalesce(trim(numero_tessera), '') ~ '^[0-9]+$';

  update public.soci
  set
    stato = 'approved',
    numero_tessera = next_number::text
  where id = p_member_id;

  return next_number::text;
end;
$$;

grant execute on function public.approve_member_with_membership_number(uuid) to authenticated, service_role;

-- Optional helper used for quick checks in SQL editor.
create or replace function public.peek_next_membership_number()
returns text
language sql
security definer
set search_path = public
as $$
  with start_value as (
    select coalesce(nullif(trim(value), '')::bigint, 1) as start_number
    from public.app_settings
    where key = 'membership_start_number'
  )
  select greatest(
    coalesce((select start_number from start_value), 1),
    coalesce(max(numero_tessera::bigint), 0) + 1
  )::text
  from public.soci
  where coalesce(trim(numero_tessera), '') ~ '^[0-9]+$';
$$;

grant execute on function public.peek_next_membership_number() to authenticated, service_role;
