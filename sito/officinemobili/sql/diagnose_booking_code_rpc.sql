-- Diagnostica da eseguire nel SQL Editor Supabase.
-- Il primo risultato deve mostrare 11 argomenti e p_booking_code.
select
  p.oid::regprocedure as funzione,
  pg_get_function_identity_arguments(p.oid) as firma,
  p.proargnames as nomi_parametri,
  has_function_privilege('service_role', p.oid, 'EXECUTE') as service_role_puo_eseguire
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'officinemobili_crea_prenotazione';

-- Verifica colonna e struttura utilizzate dalla RPC.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public'
  and table_name = 'officinemobili_prenotazioni'
  and column_name in ('booking_code', 'payment_reference', 'importo_pagato')
order by ordinal_position;

-- Deve restituire 0 righe se non ci sono duplicati.
select booking_code, count(*)
from public.officinemobili_prenotazioni
where booking_code is not null
group by booking_code
having count(*) > 1;
