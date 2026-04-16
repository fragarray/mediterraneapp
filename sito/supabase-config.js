/*  sito/supabase-config.js
 *  Configurazione Supabase condivisa per le pagine statiche.
 *  Usa le REST API di PostgREST (nessun SDK necessario).
 */

const SUPABASE_URL  = 'https://bfdxxlwacimbknamxnjn.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJmZHh4bHdhY2ltYmtuYW14bmpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU4NzU5MzEsImV4cCI6MjA5MTQ1MTkzMX0.ZqJfp2WdJBA51A235jZRNPjyz60K_LorALpE_FYRR1E';

const _HEADERS = {
  'apikey': SUPABASE_ANON,
  'Authorization': `Bearer ${SUPABASE_ANON}`,
};

/* ================================================================
   Lettura app_settings
   ================================================================ */

/**
 * Legge un singolo valore dalla tabella app_settings.
 * @param {string} key  – chiave (es. "theme_seed_color")
 * @returns {Promise<string|null>}
 */
async function getAppSetting(key) {
  const url = `${SUPABASE_URL}/rest/v1/app_settings?key=eq.${encodeURIComponent(key)}&select=value&limit=1`;
  try {
    const res = await fetch(url, { headers: _HEADERS });
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows.length) return null;
    return rows[0].value ?? null;
  } catch { return null; }
}

/* ---------- Chiavi utilizzate dall'app Flutter ---------- */
const SETTING_THEME_COLOR     = 'theme_seed_color';
const SETTING_INSTAGRAM_URL   = 'instagram_profile_url';
const SETTING_CAROUSEL_CONFIG = 'landing_carousel_config';
const SETTING_MEMBERSHIP_START = 'membership_start_number';

/* ================================================================
   Verifica numero tessera legacy
   ================================================================ */

/**
 * Controlla se un numero tessera è un numero attivo nella tabella soci.
 */
async function membershipNumberExists(membershipNumber) {
  // Cerca in soci QUALSIASI record con quel numero tessera (attivo o no)
  const url = `${SUPABASE_URL}/rest/v1/soci?numero_tessera=eq.${encodeURIComponent(membershipNumber)}&select=id&limit=1`;
  try {
    const res = await fetch(url, { headers: _HEADERS });
    if (!res.ok) {
      console.error('membershipNumberExists HTTP', res.status, await res.text().catch(() => ''));
      throw new Error('Errore nella verifica del numero tessera');
    }
    const rows = await res.json();
    return rows.length > 0;
  } catch (e) { throw e; }
}

/**
 * Controlla se esiste già una richiesta pending per questo numero tessera.
 */
async function pendingLegacyRequestExists(membershipNumber) {
  const url = `${SUPABASE_URL}/rest/v1/legacy_membership_requests?numero_tessera=eq.${encodeURIComponent(membershipNumber)}&stato=eq.pending&select=id&limit=1`;
  try {
    const res = await fetch(url, { headers: _HEADERS });
    if (!res.ok) throw new Error('Errore nella verifica richieste pending');
    const rows = await res.json();
    return rows.length > 0;
  } catch (e) { throw e; }
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
  const fileName = `${sanitized}_${Date.now()}.png`;

  const uploadUrl = `${SUPABASE_URL}/storage/v1/object/firme/${fileName}`;
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      ..._HEADERS,
      'Content-Type': 'image/png',
      'x-upsert': 'false',
    },
    body: blob,
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Upload firma fallito (${res.status}). ${detail}`);
  }

  return `${SUPABASE_URL}/storage/v1/object/public/firme/${fileName}`;
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

  const payload = {
    nome: data.nome,
    cognome: data.cognome,
    luogo_nascita: data.luogoNascita,
    data_nascita: data.dataNascita,   // yyyy-MM-dd
    residenza: data.residenza,
    comune: data.comune,
    cap: data.cap,
    email: data.email,
    telefono: data.telefono,
    firma_url: firmaUrl,
    stato: 'pending',
    privacy_accepted: data.privacyAccepted,
    created_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/soci`, {
    method: 'POST',
    headers: { ..._HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Errore inserimento socio (${res.status}). ${detail}`);
  }
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

  const payload = {
    numero_tessera: data.numeroTessera,
    nome: data.nome,
    cognome: data.cognome,
    luogo_nascita: data.luogoNascita,
    data_nascita: data.dataNascita,                       // yyyy-MM-dd
    data_registrazione_tessera: data.dataRegistrazioneTessera,  // yyyy-MM-dd
    residenza: data.residenza,
    comune: data.comune,
    cap: data.cap,
    email: data.email,
    telefono: data.telefono,
    firma_url: firmaUrl,
    stato: 'pending',
    privacy_accepted: data.privacyAccepted,
    created_at: new Date().toISOString(),
  };

  const res = await fetch(`${SUPABASE_URL}/rest/v1/legacy_membership_requests`, {
    method: 'POST',
    headers: { ..._HEADERS, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Errore inserimento richiesta legacy (${res.status}). ${detail}`);
  }
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
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{access_token:string, refresh_token:string, user:Object}>}
 */
async function signInAdmin(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    const msg = detail.error_description || detail.msg || detail.message || `Errore login (${res.status})`;
    throw new Error(msg);
  }
  return res.json();
}

/**
 * Effettua il logout admin invalidando il token.
 * @param {string} accessToken
 */
async function signOutAdmin(accessToken) {
  await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
    method: 'POST',
    headers: { 'apikey': SUPABASE_ANON, 'Authorization': `Bearer ${accessToken}` },
  }).catch(() => {});
}

/**
 * Restituisce gli header HTTP per le chiamate privilegiate admin.
 * @param {string} accessToken
 * @returns {Object}
 */
function getAdminHeaders(accessToken) {
  return {
    'apikey': SUPABASE_ANON,
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  };
}

/* ================================================================
   ADMIN: Lettura soci
   ================================================================ */

/**
 * Recupera i soci con stato=pending.
 * @param {string} accessToken
 * @returns {Promise<Array>}
 */
async function fetchPendingMembers(accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/soci?stato=eq.pending&order=created_at.desc`;
  const res = await fetch(url, { headers: getAdminHeaders(accessToken) });
  if (!res.ok) throw new Error(`fetchPendingMembers (${res.status})`);
  return res.json();
}

/**
 * Recupera i soci approvati, limitati agli ultimi N.
 * @param {string} accessToken
 * @param {number} [limit=30]
 * @returns {Promise<Array>}
 */
async function fetchApprovedMembers(accessToken, limit = 30) {
  const url = `${SUPABASE_URL}/rest/v1/soci?stato=eq.approved&order=created_at.desc&limit=${limit}`;
  const res = await fetch(url, { headers: getAdminHeaders(accessToken) });
  if (!res.ok) throw new Error(`fetchApprovedMembers (${res.status})`);
  return res.json();
}

/**
 * Recupera TUTTI i soci (usato dalla pagina di ricerca).
 * @param {string} accessToken
 * @returns {Promise<Array>}
 */
async function fetchAllMembers(accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/soci?order=created_at.desc`;
  const res = await fetch(url, { headers: getAdminHeaders(accessToken) });
  if (!res.ok) throw new Error(`fetchAllMembers (${res.status})`);
  return res.json();
}

/**
 * Recupera le richieste legacy con stato=pending.
 * @param {string} accessToken
 * @returns {Promise<Array>}
 */
async function fetchPendingLegacyRequests(accessToken) {
  const url = `${SUPABASE_URL}/rest/v1/legacy_membership_requests?stato=eq.pending&order=created_at.desc`;
  const res = await fetch(url, { headers: getAdminHeaders(accessToken) });
  if (!res.ok) throw new Error(`fetchPendingLegacyRequests (${res.status})`);
  return res.json();
}

/* ================================================================
   ADMIN: Azioni sui soci
   ================================================================ */

/**
 * Approva un socio e assegna il numero tessera via RPC.
 * @param {string} memberId
 * @param {string} accessToken
 * @returns {Promise<string>} numero tessera assegnato
 */
async function approveMember(memberId, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/approve_member_with_membership_number`, {
    method: 'POST',
    headers: getAdminHeaders(accessToken),
    body: JSON.stringify({ p_member_id: memberId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Approvazione fallita (${res.status}). ${detail}`);
  }
  const result = await res.json();
  if (typeof result === 'number' || typeof result === 'string') return String(result);
  return result?.toString() ?? '';
}

/**
 * Archivia (soft-delete) un socio.
 * @param {string} memberId
 * @param {string} accessToken
 */
async function deleteMemberSoft(memberId, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/soci?id=eq.${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    headers: { ...getAdminHeaders(accessToken), 'Prefer': 'return=minimal' },
    body: JSON.stringify({
      is_active: false,
      stato: 'deleted',
      deleted_at: new Date().toISOString(),
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Archiviazione fallita (${res.status}). ${detail}`);
  }
}

/**
 * Modifica i campi anagrafici di un socio.
 * @param {string} memberId
 * @param {Object} fields – sottoinsieme di campi da aggiornare
 * @param {string} accessToken
 */
async function updateMember(memberId, fields, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/soci?id=eq.${encodeURIComponent(memberId)}`, {
    method: 'PATCH',
    headers: { ...getAdminHeaders(accessToken), 'Prefer': 'return=minimal' },
    body: JSON.stringify(fields),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Aggiornamento socio fallito (${res.status}). ${detail}`);
  }
}

/* ================================================================
   ADMIN: Azioni sulle richieste legacy
   ================================================================ */

/**
 * Approva una richiesta legacy e la converte in un record soci via RPC.
 * @param {string} requestId
 * @param {string} accessToken
 * @returns {Promise<string>} numero tessera assegnato
 */
async function approveLegacyRequest(requestId, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/approve_legacy_membership_request`, {
    method: 'POST',
    headers: getAdminHeaders(accessToken),
    body: JSON.stringify({ p_request_id: requestId }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Approvazione legacy fallita (${res.status}). ${detail}`);
  }
  const result = await res.json();
  if (typeof result === 'number' || typeof result === 'string') return String(result);
  return result?.toString() ?? '';
}

/**
 * Rifiuta una richiesta legacy.
 * @param {string} requestId
 * @param {string} accessToken
 */
async function rejectLegacyRequest(requestId, accessToken) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/legacy_membership_requests?id=eq.${encodeURIComponent(requestId)}`,
    {
      method: 'PATCH',
      headers: { ...getAdminHeaders(accessToken), 'Prefer': 'return=minimal' },
      body: JSON.stringify({
        stato: 'rejected',
        reviewed_at: new Date().toISOString(),
      }),
    },
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Rifiuto legacy fallito (${res.status}). ${detail}`);
  }
}

/* ================================================================
   ADMIN: Impostazioni (app_settings)
   ================================================================ */

/**
 * Salva (upsert) un valore nelle app_settings.
 * @param {string} key
 * @param {string} value
 * @param {string} accessToken
 */
async function saveAppSetting(key, value, accessToken) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/app_settings`, {
    method: 'POST',
    headers: {
      ...getAdminHeaders(accessToken),
      'Prefer': 'resolution=merge-duplicates,return=minimal',
    },
    body: JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Salvataggio impostazione fallito (${res.status}). ${detail}`);
  }
}

/* ================================================================
   ADMIN: Upload immagine carosello (Storage)
   ================================================================ */

/**
 * Carica un'immagine nel bucket "firme", cartella "landing/".
 * @param {File} file  – file scelto dall'utente
 * @param {string} accessToken
 * @returns {Promise<string>} URL pubblico
 */
async function uploadCarouselImage(file, accessToken) {
  const safeName = file.name
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, '_')
    .replace(/_+/g, '_');
  const path = `landing/${Date.now()}-${safeName}`;

  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/firme/${path}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': file.type || 'image/jpeg',
      'x-upsert': 'true',
    },
    body: file,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Upload immagine carosello fallito (${res.status}). ${detail}`);
  }
  return `${SUPABASE_URL}/storage/v1/object/public/firme/${path}`;
}

/**
 * Elimina un'immagine del carosello dallo storage tramite il suo URL pubblico.
 * @param {string} publicUrl - URL pubblico dell'immagine
 * @param {string} accessToken - JWT token
 */
async function deleteCarouselImageByPublicUrl(publicUrl, accessToken) {
  const prefix = `${SUPABASE_URL}/storage/v1/object/public/firme/`;
  if (!publicUrl.startsWith(prefix)) return;
  const objectPath = publicUrl.slice(prefix.length);
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/firme/${objectPath}`, {
    method: 'DELETE',
    headers: {
      'apikey': SUPABASE_ANON,
      'Authorization': `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`Eliminazione immagine fallita (${res.status}). ${detail}`);
  }
}
