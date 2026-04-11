-- Supabase update for the new membership fields.
-- NOTE: the app currently uses `public.soci`.
-- If your table is actually named `public.utentte`, replace `public.soci` with `public.utentte` below.

alter table public.soci
  add column if not exists luogo_nascita text,
  add column if not exists data_nascita date,
  add column if not exists residenza text,
  add column if not exists comune text,
  add column if not exists cap text;

-- Backfill existing records to avoid null text values in the admin UI.
update public.soci
set
  luogo_nascita = coalesce(luogo_nascita, ''),
  residenza = coalesce(residenza, ''),
  comune = coalesce(comune, ''),
  cap = coalesce(cap, '')
where luogo_nascita is null
   or residenza is null
   or comune is null
   or cap is null;

-- Optional: defaults for future inserts.
alter table public.soci
  alter column luogo_nascita set default '',
  alter column residenza set default '',
  alter column comune set default '',
  alter column cap set default '';

-- Optional but useful for faster admin filtering.
create index if not exists idx_soci_luogo_nascita on public.soci (lower(luogo_nascita));
create index if not exists idx_soci_comune on public.soci (lower(comune));
create index if not exists idx_soci_cap on public.soci (cap);
create index if not exists idx_soci_data_nascita on public.soci (data_nascita);

-- Verification query.
select
  id,
  numero_tessera,
  nome,
  cognome,
  luogo_nascita,
  data_nascita,
  residenza,
  comune,
  cap,
  telefono,
  email
from public.soci
order by created_at desc
limit 20;
