-- ============================================================
-- SCHEMA COMPLETO – mediterraneapp  (Supabase)
-- ============================================================
-- Esegui TUTTO questo file nell'SQL Editor di Supabase per
-- ricostruire il database da zero.
--
-- ⚠️  CANCELLA TUTTI I DATI ESISTENTI ⚠️
-- ============================================================


-- ============================================================
-- 0.  PULIZIA: Drop di tutto ciò che potrebbe esistere
-- ============================================================

-- Funzioni RPC
DROP FUNCTION IF EXISTS public.approve_member_with_membership_number(uuid);
DROP FUNCTION IF EXISTS public.approve_legacy_membership_request(uuid);

-- Tabelle (CASCADE rimuove policy, trigger, indici, ecc.)
DROP TABLE IF EXISTS public.legacy_membership_requests CASCADE;
DROP TABLE IF EXISTS public.soci                       CASCADE;
DROP TABLE IF EXISTS public.app_settings               CASCADE;


-- ============================================================
-- 1.  TABELLA: soci
-- ============================================================
CREATE TABLE public.soci (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_tessera  text        UNIQUE,          -- assegnato alla approvazione
  nome            text        NOT NULL,
  cognome         text        NOT NULL,
  luogo_nascita   text,
  data_nascita    date,
  residenza       text,
  comune          text,
  cap             text,
  email           text        NOT NULL,
  telefono        text,
  firma_url       text,                        -- URL pubblico nello Storage
  stato           text        NOT NULL DEFAULT 'pending'
                              CHECK (stato IN ('pending','approved','rejected','deleted')),
  privacy_accepted boolean    NOT NULL DEFAULT false,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);

-- Estensione trigram (accelera le query ILIKE)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Indici per le query più frequenti
CREATE INDEX idx_soci_stato      ON public.soci (stato);
CREATE INDEX idx_soci_created_at ON public.soci (created_at DESC);
CREATE INDEX idx_soci_email      ON public.soci (email);
CREATE INDEX idx_soci_cognome    ON public.soci USING gin (cognome gin_trgm_ops);


-- ============================================================
-- 2.  TABELLA: legacy_membership_requests
-- ============================================================
CREATE TABLE public.legacy_membership_requests (
  id                           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_tessera               text        NOT NULL,
  nome                         text        NOT NULL,
  cognome                      text        NOT NULL,
  luogo_nascita                text,
  data_nascita                 date,
  data_registrazione_tessera   date,        -- data sulla vecchia tessera cartacea
  residenza                    text,
  comune                       text,
  cap                          text,
  email                        text        NOT NULL,
  telefono                     text,
  firma_url                    text,
  stato                        text        NOT NULL DEFAULT 'pending'
                               CHECK (stato IN ('pending','approved','rejected')),
  privacy_accepted             boolean     NOT NULL DEFAULT false,
  created_at                   timestamptz NOT NULL DEFAULT now(),
  reviewed_at                  timestamptz
);

CREATE INDEX idx_legacy_stato      ON public.legacy_membership_requests (stato);
CREATE INDEX idx_legacy_created_at ON public.legacy_membership_requests (created_at DESC);


-- ============================================================
-- 3.  TABELLA: app_settings
-- ============================================================
CREATE TABLE public.app_settings (
  key        text        PRIMARY KEY,
  value      text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Valori iniziali
INSERT INTO public.app_settings (key, value) VALUES
  ('theme_seed_color',       '#FF2E7D32'),           -- verde Material (ARGB)
  ('instagram_profile_url',  ''),
  ('landing_carousel_config','{"image_urls":[],"widget_height":230,"visible_items":2,"autoplay_seconds":4}'),
  ('membership_start_number','1');                    -- primo numero tessera digitale


-- ============================================================
-- 4.  FUNZIONE RPC: approve_member_with_membership_number
--     Approva un socio pending e gli assegna il prossimo
--     numero tessera disponibile (≥ membership_start_number).
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_member_with_membership_number(
  p_member_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER          -- gira con i privilegi del proprietario (bypass RLS)
AS $$
DECLARE
  v_start  int;
  v_next   int;
  v_tessera text;
BEGIN
  -- Leggi il numero di partenza dalle impostazioni
  SELECT (value)::int INTO v_start
    FROM public.app_settings
   WHERE key = 'membership_start_number';

  IF v_start IS NULL OR v_start < 1 THEN
    RAISE EXCEPTION 'membership_start_number non configurato';
  END IF;

  -- Calcola il prossimo numero tessera libero
  SELECT COALESCE(MAX((numero_tessera)::int), v_start - 1) + 1
    INTO v_next
    FROM public.soci
   WHERE numero_tessera ~ '^\d+$'
     AND (numero_tessera)::int >= v_start;

  v_tessera := v_next::text;

  -- Aggiorna il socio
  UPDATE public.soci
     SET stato          = 'approved',
         numero_tessera = v_tessera,
         is_active      = true
   WHERE id    = p_member_id
     AND stato = 'pending';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Socio non trovato o già approvato (id=%)', p_member_id;
  END IF;

  RETURN v_tessera;
END;
$$;


-- ============================================================
-- 5.  FUNZIONE RPC: approve_legacy_membership_request
--     Approva una richiesta legacy: crea il record in soci
--     con il numero tessera indicato nella richiesta e marca
--     la richiesta come approved.
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_legacy_membership_request(
  p_request_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_req   record;
BEGIN
  -- Blocca la riga per evitare doppie approvazioni
  SELECT * INTO v_req
    FROM public.legacy_membership_requests
   WHERE id    = p_request_id
     AND stato = 'pending'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Richiesta non trovata o già gestita (id=%)', p_request_id;
  END IF;

  -- Verifica che il numero tessera non sia già occupato
  IF EXISTS (SELECT 1 FROM public.soci WHERE numero_tessera = v_req.numero_tessera) THEN
    RAISE EXCEPTION 'Il numero tessera % è già assegnato', v_req.numero_tessera;
  END IF;

  -- Crea il socio
  INSERT INTO public.soci (
    numero_tessera, nome, cognome, luogo_nascita, data_nascita,
    residenza, comune, cap, email, telefono, firma_url,
    stato, privacy_accepted, is_active, created_at
  ) VALUES (
    v_req.numero_tessera, v_req.nome, v_req.cognome, v_req.luogo_nascita,
    v_req.data_nascita, v_req.residenza, v_req.comune, v_req.cap,
    v_req.email, v_req.telefono, v_req.firma_url,
    'approved', v_req.privacy_accepted, true, v_req.created_at
  );

  -- Segna la richiesta come approvata
  UPDATE public.legacy_membership_requests
     SET stato       = 'approved',
         reviewed_at = now()
   WHERE id = p_request_id;

  RETURN v_req.numero_tessera;
END;
$$;


-- ============================================================
-- 6.  ROW LEVEL SECURITY (RLS)
-- ============================================================

-- 7a.  soci -------------------------------------------------------
ALTER TABLE public.soci ENABLE ROW LEVEL SECURITY;

-- Chiunque (anon + autenticato) può inserire un nuovo socio (registrazione)
CREATE POLICY "Registrazione pubblica"
  ON public.soci FOR INSERT
  TO anon, authenticated
  WITH CHECK (stato = 'pending');

-- Solo utenti autenticati (admin) possono leggere
CREATE POLICY "Admin legge soci"
  ON public.soci FOR SELECT
  TO authenticated
  USING (true);

-- Solo autenticati possono aggiornare (approvazione, modifica, archiviazione)
CREATE POLICY "Admin aggiorna soci"
  ON public.soci FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Nessuna policy DELETE: i record vengono archiviati (soft-delete), mai cancellati.

-- 7b.  legacy_membership_requests ----------------------------------
ALTER TABLE public.legacy_membership_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Registrazione pubblica legacy"
  ON public.legacy_membership_requests FOR INSERT
  TO anon, authenticated
  WITH CHECK (stato = 'pending');

-- Lettura: anon può leggere solo per verificare duplicati (SELECT id),
-- autenticati possono leggere tutto.
CREATE POLICY "Anon verifica duplicati legacy"
  ON public.legacy_membership_requests FOR SELECT
  TO anon
  USING (stato = 'pending');

CREATE POLICY "Admin legge legacy"
  ON public.legacy_membership_requests FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admin aggiorna legacy"
  ON public.legacy_membership_requests FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 7c.  app_settings -------------------------------------------------
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- Chiunque può leggere (serve alla landing page pubblica)
CREATE POLICY "Lettura pubblica settings"
  ON public.app_settings FOR SELECT
  TO anon, authenticated
  USING (true);

-- Solo autenticati possono scrivere/aggiornare
CREATE POLICY "Admin scrive settings"
  ON public.app_settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Admin aggiorna settings"
  ON public.app_settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);


-- ============================================================
-- 8.  ABILITAZIONE REALTIME
-- ============================================================
-- Le tabelle soci e legacy_membership_requests vanno aggiunte alla
-- pubblicazione Realtime di Supabase per le sottoscrizioni in admin.html.

ALTER PUBLICATION supabase_realtime ADD TABLE public.soci;
ALTER PUBLICATION supabase_realtime ADD TABLE public.legacy_membership_requests;


-- ============================================================
-- 9.  STORAGE: bucket "firme"
-- ============================================================
-- Il bucket va creato dalla Dashboard (Storage → New bucket):
--   Nome:    firme
--   Public:  Sì (serve per le URL pubbliche delle firme e del carosello)
--
-- Dopo la creazione, applica queste policy:

-- Rimuovi eventuali policy preesistenti sul bucket
DROP POLICY IF EXISTS "Upload firme pubblico"         ON storage.objects;
DROP POLICY IF EXISTS "Upload carosello solo admin"   ON storage.objects;
DROP POLICY IF EXISTS "Lettura storage solo admin"    ON storage.objects;
DROP POLICY IF EXISTS "Cancellazione storage solo admin" ON storage.objects;
-- Policy dalla vecchia migrazione (supabase-storage-rls.sql)
DROP POLICY IF EXISTS "Anon può caricare firme"       ON storage.objects;
DROP POLICY IF EXISTS "Admin può caricare immagini carosello" ON storage.objects;
DROP POLICY IF EXISTS "Solo admin può leggere via API" ON storage.objects;
DROP POLICY IF EXISTS "Solo admin può cancellare"     ON storage.objects;

-- 9a.  Chiunque può caricare firme nella root (NON in landing/)
CREATE POLICY "Upload firme pubblico"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    bucket_id = 'firme'
    AND name NOT LIKE 'landing/%'
  );

-- 9b.  Solo admin può caricare nella cartella landing/
CREATE POLICY "Upload carosello solo admin"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'firme'
    AND name LIKE 'landing/%'
  );

-- 9c.  Solo admin può listare/scaricare via API
CREATE POLICY "Lettura storage solo admin"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'firme');

-- 9d.  Solo admin può cancellare
CREATE POLICY "Cancellazione storage solo admin"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'firme');


-- ============================================================
-- 10.  GRANT: permessi per le funzioni RPC
-- ============================================================
-- Le funzioni SECURITY DEFINER girano come owner, ma devono
-- essere invocabili dal ruolo authenticated (admin login).
GRANT EXECUTE ON FUNCTION public.approve_member_with_membership_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_legacy_membership_request(uuid)     TO authenticated;


-- ============================================================
-- ✅  Schema pronto. Passaggi manuali rimanenti:
-- ============================================================
-- 1. Creare il bucket "firme" dalla Dashboard (Storage → New bucket → Public: Sì)
-- 2. Creare un utente admin dalla Dashboard (Authentication → Users → Add user)
-- 3. Se vuoi l'indice trigram su cognome, abilita pg_trgm (sezione 6)
-- 4. (Opzionale) Configurare i valori in app_settings dalla pagina admin
