-- Queue for members who already have a paper membership number.
-- Run this script in Supabase SQL editor.

create table if not exists public.legacy_membership_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  data_registrazione_tessera date,
  reviewed_at timestamptz,
  approved_member_id uuid references public.soci (id),
  numero_tessera text not null,
  nome text not null,
  cognome text not null,
  luogo_nascita text,
  data_nascita date,
  residenza text,
  comune text,
  cap text,
  email text not null,
  telefono text not null,
  firma_url text,
  privacy_accepted boolean not null default false,
  stato text not null default 'pending'
);

alter table public.legacy_membership_requests
  add column if not exists data_registrazione_tessera date;

create index if not exists idx_legacy_requests_status
  on public.legacy_membership_requests (stato, created_at desc);

create index if not exists idx_legacy_requests_membership
  on public.legacy_membership_requests (numero_tessera);

create or replace function public.approve_legacy_membership_request(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  request_row public.legacy_membership_requests%rowtype;
  existing_member_id uuid;
begin
  select *
  into request_row
  from public.legacy_membership_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Richiesta legacy non trovata: %', p_request_id;
  end if;

  if request_row.stato = 'approved' then
    return trim(request_row.numero_tessera);
  end if;

  if request_row.stato <> 'pending' then
    raise exception 'La richiesta non e in stato pending.';
  end if;

  -- Lock by membership number to avoid duplicates under concurrency.
  perform pg_advisory_xact_lock(hashtext('legacy_membership_' || trim(request_row.numero_tessera)));

  select id
  into existing_member_id
  from public.soci
  where numero_tessera = trim(request_row.numero_tessera)
    and is_active = true
  limit 1;

  if existing_member_id is not null then
    raise exception 'Numero tessera gia presente tra i soci attivi.';
  end if;

  insert into public.soci (
    created_at,
    numero_tessera,
    nome,
    cognome,
    luogo_nascita,
    data_nascita,
    residenza,
    comune,
    cap,
    email,
    telefono,
    firma_url,
    stato,
    privacy_accepted,
    is_active
  )
  values (
    coalesce(
      request_row.data_registrazione_tessera::timestamp at time zone 'UTC',
      timezone('utc', now())
    ),
    trim(request_row.numero_tessera),
    request_row.nome,
    request_row.cognome,
    coalesce(request_row.luogo_nascita, ''),
    request_row.data_nascita,
    coalesce(request_row.residenza, ''),
    coalesce(request_row.comune, ''),
    coalesce(request_row.cap, ''),
    request_row.email,
    request_row.telefono,
    coalesce(request_row.firma_url, ''),
    'approved',
    request_row.privacy_accepted,
    true
  )
  returning id into existing_member_id;

  update public.legacy_membership_requests
  set
    stato = 'approved',
    reviewed_at = timezone('utc', now()),
    approved_member_id = existing_member_id
  where id = p_request_id;

  return trim(request_row.numero_tessera);
end;
$$;

grant execute on function public.approve_legacy_membership_request(uuid) to authenticated, service_role;
