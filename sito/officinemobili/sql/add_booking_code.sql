-- Officine Mobili: codice breve per verificare e recuperare una prenotazione.
-- Eseguire dopo create_officinemobili.sql.

alter table public.officinemobili_prenotazioni
  add column if not exists booking_code text;

create unique index if not exists officinemobili_prenotazioni_booking_code_uidx
  on public.officinemobili_prenotazioni(booking_code)
  where booking_code is not null;

alter table public.officinemobili_prenotazioni
  drop constraint if exists officinemobili_booking_code_format;

alter table public.officinemobili_prenotazioni
  add constraint officinemobili_booking_code_format
  check (booking_code is null or booking_code ~ '^OM-[A-HJ-NP-Z2-9]{8}$');

-- Richiede a PostgREST di rileggere la struttura appena aggiornata.
notify pgrst, 'reload schema';
