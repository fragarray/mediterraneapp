/*  sito/supabase-config.js
 *  Configurazione Supabase condivisa per le pagine statiche.
 *  Usa il client ufficiale @supabase/supabase-js (v2).
 *  Richiede che supabase.min.js sia caricato prima di questo file.
 */

const SUPABASE_URL  = 'https://bfdxxlwacimbknamxnjn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZHh4bHdhY2ltYmtuYW14bmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzU5MzEsImV4cCI6MjA5MTQ1MTkzMX0.ZqJfp2WdJBA51A235jZRNPjyz60K_LorALpE_FYRR1E';

// Client condiviso — riassegna il globale `supabase` (già dichiarato dall'UMD)
// da namespace SDK → istanza client.  Usa sessionStorage per far scadere la sessione alla chiusura del tab.
// eslint-disable-next-line no-global-assign
supabase = supabase.createClient(SUPABASE_URL, SUPABASE_ANON, {
  auth: {
    storage: sessionStorage,
    autoRefreshToken: true,
    persistSession: true,
  },
});

/* ================================================================
   Lettura app_settings
   ================================================================ */

/**
 * Legge un singolo valore dalla tabella app_settings.
 * @param {string} key  – chiave (es. "theme_seed_color")
 * @returns {Promise<string|null>}
 */
async function getAppSetting(key) {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .limit(1)
      .maybeSingle();
    if (error) return null;
    return data?.value ?? null;
  } catch { return null; }
}

/* ---------- Chiavi utilizzate dall'app Flutter ---------- */
const SETTING_THEME_COLOR      = 'theme_seed_color';
const SETTING_INSTAGRAM_URL    = 'instagram_profile_url';
const SETTING_CAROUSEL_CONFIG  = 'landing_carousel_config';
const SETTING_MEMBERSHIP_START = 'membership_start_number';

/* ================================================================
   Verifica numero tessera legacy
   ================================================================ */

/**
 * Controlla se un numero tessera è già presente nella tabella soci.
 */
async function membershipNumberExists(membershipNumber) {
  const { data, error } = await supabase
    .from('soci')
    .select('id')
    .eq('numero_tessera', membershipNumber)
    .limit(1);
  if (error) throw new Error('Errore nella verifica del numero tessera');
  return data.length > 0;
}

/**
 * Controlla se esiste già una richiesta pending per questo numero tessera.
 */
async function pendingLegacyRequestExists(membershipNumber) {
  const { data, error } = await supabase
    .from('legacy_membership_requests')
    .select('id')
    .eq('numero_tessera', membershipNumber)
    .eq('stato', 'pending')
    .limit(1);
  if (error) throw new Error('Errore nella verifica richieste pending');
  return data.length > 0;
}

/**
 * Verifica se un numero tessera può essere digitalizzato.
 * Restituisce { ok: true } oppure { ok: false, reason: '...' }
 */
async function canRequestLegacyMembershipNumber(membershipNumber) {
  const startRaw = await getAppSetting(SETTING_MEMBERSHIP_START);
  const startNumber = parseInt(startRaw, 10);
  if (!startNumber || startNumber <= 1)
    return { ok: false, reason: 'Il sistema di digitalizzazione non è ancora configurato.' };

  if (membershipNumber >= startNumber)
    return { ok: false, reason: 'Questo numero tessera non risulta tra le tessere cartacee emesse.' };

  const exists = await membershipNumberExists(membershipNumber.toString());
  if (exists)
    return { ok: false, reason: `La tessera n° ${membershipNumber} è già stata digitalizzata. La digitalizzazione non è necessaria.` };

  const hasPending = await pendingLegacyRequestExists(membershipNumber.toString());
  if (hasPending)
    return { ok: false, reason: `Esiste già una richiesta di digitalizzazione in attesa per la tessera n° ${membershipNumber}.` };

  return { ok: true };
}

/* ================================================================
   Upload firma (Storage)
   ================================================================ */

/**
 * Carica la firma PNG nel bucket "firme" di Supabase Storage.
 * @param {Blob} blob  – blob PNG della firma
 * @param {string} email – email del socio (usata nel nome file)
 * @returns {Promise<string>} URL pubblico del file caricato
 */
async function uploadSignature(blob, email) {
  const sanitized = email.toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
  const fileName = `${sanitized}_${crypto.randomUUID()}.png`;

  const { error } = await supabase.storage
    .from('firme')
    .upload(fileName, blob, { contentType: 'image/png', upsert: false });

  if (error) throw new Error(`Upload firma fallito. ${error.message}`);

  const { data } = supabase.storage.from('firme').getPublicUrl(fileName);
  return data.publicUrl;
}

/* ================================================================
   Submit registrazione normale (tabella soci)
   ================================================================ */

/**
 * Invia una registrazione normale alla tabella soci.
 * @param {Object} data – campi del form
 * @param {Blob} signatureBlob – firma PNG
 */
async function submitRegistration(data, signatureBlob) {
  const firmaUrl = await uploadSignature(signatureBlob, data.email);

  const { error } = await supabase.from('soci').insert({
    nome: data.nome,
    cognome: data.cognome,
    luogo_nascita: data.luogoNascita,
    data_nascita: data.dataNascita,
    residenza: data.residenza,
    comune: data.comune,
    cap: data.cap,
    email: data.email,
    telefono: data.telefono,
    firma_url: firmaUrl,
    stato: 'pending',
    privacy_accepted: data.privacyAccepted,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Errore inserimento socio. ${error.message}`);
}

/* ================================================================
   Submit richiesta legacy (tabella legacy_membership_requests)
   ================================================================ */

/**
 * Invia una richiesta di recupero vecchia tessera.
 * @param {Object} data – campi del form (include numeroTessera e dataRegistrazioneTessera)
 * @param {Blob} signatureBlob – firma PNG
 */
async function submitLegacyMembershipRequest(data, signatureBlob) {
  const firmaUrl = await uploadSignature(signatureBlob, data.email);

  const { error } = await supabase.from('legacy_membership_requests').insert({
    numero_tessera: data.numeroTessera,
    nome: data.nome,
    cognome: data.cognome,
    luogo_nascita: data.luogoNascita,
    data_nascita: data.dataNascita,
    data_registrazione_tessera: data.dataRegistrazioneTessera,
    residenza: data.residenza,
    comune: data.comune,
    cap: data.cap,
    email: data.email,
    telefono: data.telefono,
    firma_url: firmaUrl,
    stato: 'pending',
    privacy_accepted: data.privacyAccepted,
    created_at: new Date().toISOString(),
  });

  if (error) throw new Error(`Errore inserimento richiesta legacy. ${error.message}`);
}

/* ================================================================
   Utility colore
   ================================================================ */

/**
 * Converte hex (#AARRGGBB o #RRGGBB) in "r, g, b" per CSS.
 */
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  let r, g, b;
  if (h.length === 8) {          // AARRGGBB (formato Flutter/ARGB)
    r = parseInt(h.substring(2, 4), 16);
    g = parseInt(h.substring(4, 6), 16);
    b = parseInt(h.substring(6, 8), 16);
  } else {                       // RRGGBB
    r = parseInt(h.substring(0, 2), 16);
    g = parseInt(h.substring(2, 4), 16);
    b = parseInt(h.substring(4, 6), 16);
  }
  return { r, g, b };
}

/**
 * Applica il colore seed a tutte le custom properties CSS.
 */
function applySeedColor(hex) {
  if (!hex) return;
  const { r, g, b } = hexToRgb(hex);
  const root = document.documentElement.style;
  root.setProperty('--seed', `rgb(${r},${g},${b})`);
  root.setProperty('--seed-light', `rgba(${r},${g},${b},0.05)`);
  root.setProperty('--seed-10', `rgba(${r},${g},${b},0.10)`);
}

/**
 * Converte una data gg/mm/aaaa in yyyy-MM-dd per Supabase.
 */
function dateToIso(ddmmyyyy) {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmyyyy);
  if (!m) return null;
  return `${m[3]}-${m[2]}-${m[1]}`;
}

/* ================================================================
   ADMIN: Autenticazione
   ================================================================ */

/**
 * Effettua il login admin tramite email/password.
 * La sessione viene gestita automaticamente dall'SDK.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{session: Object, user: Object}>}
 */
async function signInAdmin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(error.message || 'Errore login');
  return data;
}

/**
 * Effettua il logout admin e invalida la sessione corrente.
 */
async function signOutAdmin() {
  await supabase.auth.signOut();
}

/* ================================================================
   ADMIN: Lettura soci
   ================================================================ */

/**
 * Recupera i soci con stato=pending.
 * @returns {Promise<Array>}
 */
async function fetchPendingMembers() {
  const { data, error } = await supabase
    .from('soci')
    .select('*')
    .eq('stato', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`fetchPendingMembers: ${error.message}`);
  return data;
}

/**
 * Recupera i soci approvati, limitati agli ultimi N.
 * @param {number} [limit=30]
 * @returns {Promise<Array>}
 */
async function fetchApprovedMembers(limit = 30) {
  const { data, error } = await supabase
    .from('soci')
    .select('*')
    .eq('stato', 'approved')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(`fetchApprovedMembers: ${error.message}`);
  return data;
}

/**
 * Recupera soci con filtri server-side, paginazione e conteggio totale.
 * @param {Object} [opts]
 * @param {Object} [opts.filters]        - Campi filtro (vedi sotto)
 * @param {string} [opts.filters.stato]
 * @param {string} [opts.filters.nome]
 * @param {string} [opts.filters.cognome]
 * @param {string} [opts.filters.luogoNascita]
 * @param {string} [opts.filters.dataNascita]  - Accetta gg/mm/aaaa o parziale
 * @param {string} [opts.filters.residenza]
 * @param {string} [opts.filters.comune]
 * @param {string} [opts.filters.cap]
 * @param {string} [opts.filters.email]
 * @param {string} [opts.filters.telefono]
 * @param {string} [opts.filters.dateFrom]     - yyyy-MM-dd
 * @param {string} [opts.filters.dateTo]       - yyyy-MM-dd
 * @param {string} [opts.filters.general]      - Ricerca su più colonne via OR
 * @param {number} [opts.page=0]               - Pagina 0-based
 * @param {number} [opts.pageSize=50]          - Righe per pagina; 0 = nessun limite
 * @returns {Promise<{data: Array, count: number}>}
 */
async function fetchAllMembers({ filters = {}, page = 0, pageSize = 50 } = {}) {
  let q = supabase.from('soci').select('*', { count: 'exact' });

  if (filters.stato)        q = q.eq('stato', filters.stato);
  if (filters.nome)         q = q.ilike('nome', `%${filters.nome}%`);
  if (filters.cognome)      q = q.ilike('cognome', `%${filters.cognome}%`);
  if (filters.luogoNascita) q = q.ilike('luogo_nascita', `%${filters.luogoNascita}%`);
  if (filters.residenza)    q = q.ilike('residenza', `%${filters.residenza}%`);
  if (filters.comune)       q = q.ilike('comune', `%${filters.comune}%`);
  if (filters.cap)          q = q.ilike('cap', `%${filters.cap}%`);
  if (filters.email)        q = q.ilike('email', `%${filters.email}%`);
  if (filters.telefono)     q = q.ilike('telefono', `%${filters.telefono}%`);
  if (filters.dateFrom)     q = q.gte('created_at', filters.dateFrom);
  if (filters.dateTo)       q = q.lte('created_at', filters.dateTo + 'T23:59:59.999Z');

  if (filters.dataNascita) {
    // Converte gg/mm/aaaa → aaaa-mm-gg per la colonna date; accetta anche parziali
    const parts = filters.dataNascita.split('/');
    let s = filters.dataNascita;
    if (parts.length === 3 && parts[2])
      s = `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    else if (parts.length === 2 && parts[1])
      s = `${parts[1]}-${parts[0].padStart(2, '0')}`;
    q = q.ilike('data_nascita', `%${s}%`);
  }

  if (filters.general) {
    const g = `%${filters.general}%`;
    q = q.or(
      [
        `nome.ilike.${g}`,
        `cognome.ilike.${g}`,
        `email.ilike.${g}`,
        `telefono.ilike.${g}`,
        `residenza.ilike.${g}`,
        `comune.ilike.${g}`,
        `cap.ilike.${g}`,
        `stato.ilike.${g}`,
        `luogo_nascita.ilike.${g}`,
      ].join(',')
    );
  }

  q = q.order('created_at', { ascending: false });
  if (pageSize > 0) q = q.range(page * pageSize, (page + 1) * pageSize - 1);

  const { data, error, count } = await q;
  if (error) throw new Error(`fetchAllMembers: ${error.message}`);
  return { data: data ?? [], count: count ?? 0 };
}

/**
 * Recupera le richieste legacy con stato=pending.
 * @returns {Promise<Array>}
 */
async function fetchPendingLegacyRequests() {
  const { data, error } = await supabase
    .from('legacy_membership_requests')
    .select('*')
    .eq('stato', 'pending')
    .order('created_at', { ascending: false });
  if (error) throw new Error(`fetchPendingLegacyRequests: ${error.message}`);
  return data;
}

/* ================================================================
   ADMIN: Azioni sui soci
   ================================================================ */

/**
 * Approva un socio e assegna il numero tessera via RPC.
 * @param {string} memberId
 * @returns {Promise<string>} numero tessera assegnato
 */
async function approveMember(memberId) {
  const { data, error } = await supabase.rpc('approve_member_with_membership_number', {
    p_member_id: memberId,
  });
  if (error) throw new Error(`Approvazione fallita. ${error.message}`);
  return String(data ?? '');
}

/**
 * Archivia (soft-delete) un socio.
 * @param {string} memberId
 */
async function deleteMemberSoft(memberId) {
  const { error } = await supabase
    .from('soci')
    .update({
      is_active: false,
      stato: 'deleted',
      deleted_at: new Date().toISOString(),
    })
    .eq('id', memberId);
  if (error) throw new Error(`Archiviazione fallita. ${error.message}`);
}

/**
 * Modifica i campi anagrafici di un socio.
 * @param {string} memberId
 * @param {Object} fields – sottoinsieme di campi da aggiornare
 */
async function updateMember(memberId, fields) {
  const { error } = await supabase
    .from('soci')
    .update(fields)
    .eq('id', memberId);
  if (error) throw new Error(`Aggiornamento socio fallito. ${error.message}`);
}

/* ================================================================
   ADMIN: Azioni sulle richieste legacy
   ================================================================ */

/**
 * Approva una richiesta legacy e la converte in un record soci via RPC.
 * @param {string} requestId
 * @returns {Promise<string>} numero tessera assegnato
 */
async function approveLegacyRequest(requestId) {
  const { data, error } = await supabase.rpc('approve_legacy_membership_request', {
    p_request_id: requestId,
  });
  if (error) throw new Error(`Approvazione legacy fallita. ${error.message}`);
  return String(data ?? '');
}

/**
 * Rifiuta una richiesta legacy.
 * @param {string} requestId
 */
async function rejectLegacyRequest(requestId) {
  const { error } = await supabase
    .from('legacy_membership_requests')
    .update({
      stato: 'rejected',
      reviewed_at: new Date().toISOString(),
    })
    .eq('id', requestId);
  if (error) throw new Error(`Rifiuto legacy fallito. ${error.message}`);
}

/* ================================================================
   ADMIN: Impostazioni (app_settings)
   ================================================================ */

/**
 * Salva (upsert) un valore nelle app_settings.
 * @param {string} key
 * @param {string} value
 */
async function saveAppSetting(key, value) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
  if (error) throw new Error(`Salvataggio impostazione fallito. ${error.message}`);
}

/* ================================================================
   ADMIN: Upload immagine carosello (Storage)
   ================================================================ */

/**
 * Carica un'immagine nel bucket "firme", cartella "landing/".
 * @param {File} file  – file scelto dall'utente
 * @returns {Promise<string>} URL pubblico
 */
async function uploadCarouselImage(file) {
  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  const path = `landing/${crypto.randomUUID()}-${safeName}`;

  const { error } = await supabase.storage
    .from('firme')
    .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: true });

  if (error) throw new Error(`Upload immagine carosello fallito. ${error.message}`);

  const { data } = supabase.storage.from('firme').getPublicUrl(path);
  return data.publicUrl;
}

/**
 * Elimina un'immagine del carosello dallo storage tramite il suo URL pubblico.
 * @param {string} publicUrl - URL pubblico dell'immagine
 */
async function deleteCarouselImageByPublicUrl(publicUrl) {
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/firme/`;
  if (!publicUrl.startsWith(prefix)) return;
  const objectPath = publicUrl.slice(prefix.length);
  const { error } = await supabase.storage.from('firme').remove([objectPath]);
  if (error) throw new Error(`Eliminazione immagine fallita. ${error.message}`);
}
