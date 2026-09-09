-- Officine Mobili: schema isolato da Pizzica.
-- Eseguire tutto questo script nel SQL Editor di Supabase.

create extension if not exists pgcrypto;

create table if not exists public.officinemobili_edizioni (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  titolo text not null,
  data_inizio date not null,
  data_fine date not null,
  prezzo numeric(10,2) not null default 350.00 check (prezzo >= 0),
  prenotazioni_aperte boolean not null default true,
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  check (data_fine >= data_inizio)
);

create table if not exists public.officinemobili_laboratori (
  id uuid primary key default gen_random_uuid(),
  edizione_id uuid not null references public.officinemobili_edizioni(id) on delete cascade,
  slug text not null,
  nome text not null,
  descrizione text,
  capienza integer not null default 7 check (capienza > 0),
  attivo boolean not null default true,
  created_at timestamptz not null default now(),
  unique (edizione_id, slug),
  unique (edizione_id, nome)
);

-- Date informative del programma: non sono prenotabili singolarmente.
create table if not exists public.officinemobili_date (
  id uuid primary key default gen_random_uuid(),
  edizione_id uuid not null references public.officinemobili_edizioni(id) on delete cascade,
  data date not null,
  titolo text,
  note text,
  attiva boolean not null default true,
  created_at timestamptz not null default now(),
  unique (edizione_id, data)
);

create table if not exists public.officinemobili_prenotazioni (
  id uuid primary key default gen_random_uuid(),
  edizione_id uuid not null references public.officinemobili_edizioni(id) on delete restrict,
  laboratorio_id uuid not null references public.officinemobili_laboratori(id) on delete restrict,
  nome text not null,
  cognome text not null,
  email text not null,
  telefono text,
  num_posti integer not null default 1 check (num_posti between 1 and 7),
  note text,
  stato text not null default 'pending_payment' check (stato in ('pending_payment', 'confermata', 'cancellata')),
  payment_reference text unique,
  booking_code text unique check (booking_code is null or booking_code ~ '^OM-[A-HJ-NP-Z2-9]{8}$'),
  importo_pagato numeric(10,2) not null check (importo_pagato >= 0),
  payment_method text not null default 'sumup',
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists officinemobili_laboratori_edizione_idx
  on public.officinemobili_laboratori(edizione_id, attivo);
create index if not exists officinemobili_date_edizione_idx
  on public.officinemobili_date(edizione_id, data);
create index if not exists officinemobili_prenotazioni_laboratorio_idx
  on public.officinemobili_prenotazioni(laboratorio_id, stato);
create index if not exists officinemobili_prenotazioni_payment_idx
  on public.officinemobili_prenotazioni(payment_reference);

create or replace function public.officinemobili_touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists officinemobili_prenotazioni_updated_at on public.officinemobili_prenotazioni;
create trigger officinemobili_prenotazioni_updated_at
before update on public.officinemobili_prenotazioni
for each row execute function public.officinemobili_touch_updated_at();

-- Prenotazione atomica: una prenotazione vale per tutta l'edizione.
create or replace function public.officinemobili_crea_prenotazione(
  p_edizione_id uuid,
  p_laboratorio_id uuid,
  p_nome text,
  p_cognome text,
  p_email text,
  p_telefono text,
  p_num_posti integer,
  p_note text,
  p_payment_reference text,
  p_importo numeric
)
returns public.officinemobili_prenotazioni
language plpgsql
security definer
set search_path = public
as $$
declare
  v_edizione public.officinemobili_edizioni;
  v_laboratorio public.officinemobili_laboratori;
  v_prenotati integer;
  v_result public.officinemobili_prenotazioni;
begin
  select * into v_edizione
  from public.officinemobili_edizioni
  where id = p_edizione_id and attiva and prenotazioni_aperte
  for update;
  if not found then raise exception 'EDIZIONE_NON_DISPONIBILE'; end if;

  select * into v_laboratorio
  from public.officinemobili_laboratori
  where id = p_laboratorio_id and edizione_id = p_edizione_id and attivo
  for update;
  if not found then raise exception 'LABORATORIO_NON_DISPONIBILE'; end if;
  if p_num_posti < 1 or p_num_posti > v_laboratorio.capienza then raise exception 'NUMERO_POSTI_NON_VALIDO'; end if;

  select coalesce(sum(num_posti), 0)::integer into v_prenotati
  from public.officinemobili_prenotazioni
  where laboratorio_id = p_laboratorio_id
    and (stato = 'confermata' or (stato = 'pending_payment' and expires_at > now()));
  if v_prenotati + p_num_posti > v_laboratorio.capienza then raise exception 'POSTI_ESAURITI'; end if;

  insert into public.officinemobili_prenotazioni
    (edizione_id, laboratorio_id, nome, cognome, email, telefono, num_posti, note, stato, payment_reference, importo_pagato, payment_method, expires_at)
  values
    (p_edizione_id, p_laboratorio_id, left(trim(p_nome), 100), left(trim(p_cognome), 100), lower(left(trim(p_email), 200)), left(trim(coalesce(p_telefono, '')), 30), p_num_posti, nullif(left(trim(coalesce(p_note, '')), 500), ''), 'pending_payment', p_payment_reference, p_importo, 'sumup', now() + interval '10 minutes')
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.officinemobili_crea_prenotazione(uuid, uuid, text, text, text, text, integer, text, text, numeric) from public;
grant execute on function public.officinemobili_crea_prenotazione(uuid, uuid, text, text, text, text, integer, text, text, numeric) to service_role;

alter table public.officinemobili_edizioni enable row level security;
alter table public.officinemobili_laboratori enable row level security;
alter table public.officinemobili_date enable row level security;
alter table public.officinemobili_prenotazioni enable row level security;

drop policy if exists officinemobili_edizioni_public_read on public.officinemobili_edizioni;
create policy officinemobili_edizioni_public_read on public.officinemobili_edizioni
for select using (attiva = true);
drop policy if exists officinemobili_laboratori_public_read on public.officinemobili_laboratori;
create policy officinemobili_laboratori_public_read on public.officinemobili_laboratori
for select using (attivo = true);
drop policy if exists officinemobili_date_public_read on public.officinemobili_date;
create policy officinemobili_date_public_read on public.officinemobili_date
for select using (attiva = true);
drop policy if exists officinemobili_edizioni_auth_update on public.officinemobili_edizioni;
create policy officinemobili_edizioni_auth_update on public.officinemobili_edizioni
for update to authenticated using (true) with check (true);
drop policy if exists officinemobili_laboratori_auth_update on public.officinemobili_laboratori;
create policy officinemobili_laboratori_auth_update on public.officinemobili_laboratori
for update to authenticated using (true) with check (true);
drop policy if exists officinemobili_date_auth_insert on public.officinemobili_date;
create policy officinemobili_date_auth_insert on public.officinemobili_date
for insert to authenticated with check (true);
drop policy if exists officinemobili_date_auth_update on public.officinemobili_date;
create policy officinemobili_date_auth_update on public.officinemobili_date
for update to authenticated using (true) with check (true);
drop policy if exists officinemobili_date_auth_delete on public.officinemobili_date;
create policy officinemobili_date_auth_delete on public.officinemobili_date
for delete to authenticated using (true);
drop policy if exists officinemobili_prenotazioni_auth_read on public.officinemobili_prenotazioni;
create policy officinemobili_prenotazioni_auth_read on public.officinemobili_prenotazioni
for select to authenticated using (true);
drop policy if exists officinemobili_prenotazioni_auth_update on public.officinemobili_prenotazioni;
create policy officinemobili_prenotazioni_auth_update on public.officinemobili_prenotazioni
for update to authenticated using (true) with check (true);

insert into public.officinemobili_edizioni (slug, titolo, data_inizio, data_fine, prezzo)
values ('officine-mobili-2026', 'Officine Mobili', '2026-10-26', '2026-10-30', 350.00)
on conflict (slug) do nothing;

insert into public.officinemobili_laboratori (edizione_id, slug, nome, descrizione)
select e.id, v.slug, v.nome, v.descrizione
from public.officinemobili_edizioni e
cross join (values
  ('scrittura-cantautorale', 'Scrittura cantautoriale', 'Laboratorio di scrittura cantautorale.'),
  ('management', 'Management', 'Laboratorio dedicato al management.'),
  ('comunicazione-immagine', 'Comunicazione e immagine', 'Laboratorio di comunicazione e immagine.')
) as v(slug, nome, descrizione)
where e.slug = 'officine-mobili-2026'
on conflict (edizione_id, slug) do nothing;

-- Le date possono essere inserite/modificate dall'admin in base al programma definitivo.
