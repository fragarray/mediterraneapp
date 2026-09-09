-- Officine Mobili: fix atomico assegnazione booking_code.
-- Eseguire dopo create_officinemobili.sql e add_booking_code.sql.
-- Non modifica tabelle Pizzica.

alter table public.officinemobili_prenotazioni
  add column if not exists booking_code text;

create unique index if not exists officinemobili_prenotazioni_booking_code_uidx
  on public.officinemobili_prenotazioni(booking_code)
  where booking_code is not null;

drop function if exists public.officinemobili_crea_prenotazione(uuid, uuid, text, text, text, text, integer, text, text, numeric);

drop function if exists public.officinemobili_crea_prenotazione(uuid, uuid, text, text, text, text, integer, text, text, text, numeric);

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
  p_booking_code text,
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
  if p_booking_code is null or p_booking_code !~ '^OM-[A-HJ-NP-Z2-9]{8}$' then
    raise exception 'CODICE_PRENOTAZIONE_NON_VALIDO';
  end if;

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
    (edizione_id, laboratorio_id, nome, cognome, email, telefono, num_posti, note, stato, payment_reference, booking_code, importo_pagato, payment_method, expires_at)
  values
    (p_edizione_id, p_laboratorio_id, left(trim(p_nome), 100), left(trim(p_cognome), 100), lower(left(trim(p_email), 200)), left(trim(coalesce(p_telefono, '')), 30), p_num_posti, nullif(left(trim(coalesce(p_note, '')), 500), ''), 'pending_payment', p_payment_reference, p_booking_code, p_importo, 'sumup', now() + interval '10 minutes')
  returning * into v_result;
  return v_result;
end;
$$;

revoke all on function public.officinemobili_crea_prenotazione(uuid, uuid, text, text, text, text, integer, text, text, text, numeric) from public;
grant execute on function public.officinemobili_crea_prenotazione(uuid, uuid, text, text, text, text, integer, text, text, text, numeric) to service_role;

notify pgrst, 'reload schema';
