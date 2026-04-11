-- Remove the codice fiscale column from the membership table.
-- NOTE: the Flutter app currently uses `public.soci`.
-- If your actual table is `public.utentte`, replace `public.soci` below.

alter table public.soci
  drop column if exists codice_fiscale;

-- Optional verification
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
