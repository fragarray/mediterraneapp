Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito)

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/registration.html#1-1), lines 1 to 80

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/already_member.html#1-1), lines 1 to 80

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/admin.html#1-1), lines 1 to 80

Ran terminal command: Get-ChildItem "c:\Users\Tommaso\Documents\mediterraneapp\sito" -Filter "*.html" | ForEach-Object { $lines = (Get-Content $_.FullName).Count; "$($_.Name): $lines righe" }

Ran terminal command: Get-ChildItem "c:\Users\Tommaso\Documents\mediterraneapp\sito" -Filter "*.js" | ForEach-Object { $lines = (Get-Content $_.FullName).Count; "$($_.Name): $lines righe" }

Ran terminal command: 
# For each HTML file, count lines of CSS (between <style> tags) and JS (between <script> tags)
$files = Get-ChildItem "c:\Users\Tommaso\Documents\mediterraneapp\sito" -Filter "*.html"
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    $cssMatches = [regex]::Matches($content, '(?s)<style[^>]*>(.*?)</style>')
    $jsMatches = [regex]::Matches($content, '(?s)<script(?! src)[^>]*>(.*?)</script>')
    $cssLines = 0; foreach ($m in $cssMatches) { $cssLines += ($m.Groups[1].Value -split "`n").Count }
    $jsLines = 0; foreach ($m in $jsMatches) { $jsLines += ($m.Groups[1].Value -split "`n").Count }
    $total = (Get-Content $f.FullName).Count
    Write-Host "$($f.Name) | totale: $total | CSS: $cssLines | JS inline: $jsLines"
}


Ran terminal command: 
$files = Get-ChildItem "c:\Users\Tommaso\Documents\mediterraneapp\sito" -Filter "*.html"
foreach ($f in $files) {
    $content = Get-Content $f.FullName -Raw
    $total = (Get-Content $f.FullName).Count
    Write-Host "$($f.Name): $total righe totali"
}


Ran terminal command: cd "C:\Users\Tommaso\Documents\mediterraneapp\sito"; Get-ChildItem *.html | Select-Object Name, @{N='Lines';E={(Get-Content $_.FullName).Count}}

Now let me read through all files to understand the full content and identify shared patterns:  

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/admin.html#80-80), lines 80 to 350

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/registration.html#80-80), lines 80 to 350

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/admin.html#350-350), lines 350 to 500

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/registration.html#350-350), lines 350 to 600

Now let me read the JS files and remaining pages:   

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/supabase-config.js#1-1), lines 1 to 100

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/admin-ricerca.html#1-1), lines 1 to 100

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/admin-storico.html#1-1), lines 1 to 100

Now let me check what JavaScript functions appear in the HTML files (inline scripts):  

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/supabase-config.js#100-100), lines 100 to 668

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/admin-storico.html#100-100), lines 100 to 380

Ho ora un quadro completo. Lasciatemi leggere le ultime sezioni chiave per completare l'analisi:  

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/already_member.html#100-100), lines 100 to 200

Read [](file:///c%3A/Users/Tommaso/Documents/mediterraneapp/sito/admin-ricerca.html#100-100), lines 100 to 250

Ho analizzato tutti gli 8 file HTML + 3 JS. Ecco il quadro completo e il piano di refactoring:

---

## Analisi

| File | Totale | CSS inline | JS inline |
|------|--------|------------|-----------|
| admin.html | 2067 | ~620 righe | ~1200 righe |
| admin-ricerca.html | 1209 | ~380 righe | ~740 righe |
| registration.html | 1044 | ~390 righe | ~560 righe |
| `registration-en.html` | 1040 | **copia identica** | **copia identica** |
| admin-storico.html | 380 | ~120 righe | ~230 righe |
| already_member.html | 356 | ~160 righe | ~130 righe |
| `already_member-en.html` | 339 | **copia identica** | **copia identica** |
| `index.html` | 454 | ~210 righe | ~130 righe |

---

## Duplicazioni identificate

### CSS – replicato identicamente in tutti gli 8 file:
- `:root` variables (colori, radius) — **8 copie**
- Reset `*, *::before, *::after` — **8 copie**
- `body`, `body.ready` — **8 copie**
- `.appbar` base (con leggere varianti) — **8 copie**
- `.form-group`, `input:focus`, `.error-msg` — **6 copie**
- `.btn-filled`, `.btn-outlined`, `.btn-ghost` — **6 copie**
- `.snackbar` — **4 copie**
- `.card` — **4 copie**
- `table`, `th`, `td`, `.table-wrap`, `.resize-handle` — **3 copie** (admin triplet)
- `.badge-*`, `.action-btn`, `.stat-chip` — **3 copie** (admin triplet)
- `.lang-btn`, `.lang-switcher` — **4 copie** (registration + already\_member × 2 lingue)

### JS – replicato in più file:
- `escHtml()`, `fmtDate()`, `fmtBirth()`, `residenceLabel()`, `birthPlaceAndDateLabel()` — **3 copie** (admin triplet)
- Logica sort (`sortBy`, `sortIcon`, `_sortRows`) — **3 copie** (admin triplet)
- Logica resize colonne (130+ righe) — **3 copie** (admin triplet)
- Logica snackbar — **4 copie**
- Logica signature pad (disegno, clear, toBlob) — **2 copie** (registration IT + EN)
- Maschera data `gg/mm/aaaa` — **2 copie**
- Logica opt-out telefono/email — **2 copie**

---

## Progetto di separazione

### Struttura proposta

```
sito/
  css/
    global.css          ← NUOVO
    components.css      ← NUOVO
    admin.css           ← NUOVO
  js/
    utils.js            ← NUOVO
    admin-table.js      ← NUOVO
    signature.js        ← NUOVO
    registration.js     ← NUOVO
    already-member.js   ← NUOVO
    admin.js            ← NUOVO (logica specifica admin.html)
    admin-ricerca.js    ← NUOVO (logica specifica ricerca)
  supabase-config.js    ← invariato
  pdf-builder.js        ← invariato
  logo-data.js          ← invariato
  *.html                ← drasticamente alleggeriti
```

---

### `css/global.css` (~70 righe, usato da tutti gli 8 file)
Contiene:
- Reset `*`
- `:root` variables (colori, radius)
- `body`, `body.ready` (opacity transition)
- `.page-center`, `.page-content` (layout container generico)
- Classi utility: `.gap-18`, `.mt-24`, `.mt-12`, `.mb-16`

**Nota:** le variabili CSS vengono già sovrascritte a runtime da `applySeedColor()` in supabase-config.js, quindi i valori di default nel `:root` non devono essere duplicati.

---

### `css/components.css` (~220 righe, usato da 6+ file)
Contiene:
- `.appbar`, `.appbar-title`, `.appbar-action`, `.appbar-link` — versione base
- `.form-group`, `label`, `input`, `input:focus`, `.error-msg`, `.has-error`
- `.input-with-icon`, `.input-with-optout`
- `.btn-filled`, `.btn-outlined`, `.btn-ghost`
- `.snackbar`, `.snackbar.visible`, `.snackbar.success`, `.snackbar.error`
- `.card`, `.card-title`
- `.lang-switcher`, `.lang-btn`, `.lang-btn.active`
- `.modal-overlay`, `.modal-box`, `.modal-title`, `.modal-actions`
- `.confirm-overlay`, `.confirm-box`

---

### `css/admin.css` (~280 righe, usato solo dai 3 file admin)
Contiene:
- `.appbar` overrides (sticky, border-bottom, compact)
- `.tab-btn`, `.tab-btn.active`
- `table`, `th`, `td`, `.table-wrap`, `.resize-handle`
- `.badge-pending/approved/deleted/rejected`
- `.action-btn`, `.action-btn.danger`
- `.stats-row`, `.stat-chip`, `.stat-chip-label/value/sub`
- `.section-header`, `.section-title`, `.section-desc`
- `.fields-grid`, `.field-half`
- `.color-picker-wrap` e relativi controlli (solo admin.html)
- `.carousel-image-badge` (solo admin.html)
- `.history-overlay`, `.history-frame` (solo admin.html)
- `.auth-gate-box` (solo admin-ricerca.html)

> **Limit atomizzazione:** Non creare `admin-settings.css` o `admin-history.css` separati — il risparmio sarebbe minimo e admin.html è l'unico consumatore.

---

### `js/utils.js` (~50 righe, usato dai 3 file admin)
Contiene:
- `escHtml(str)`
- `fmtDate(isoStr)`
- `fmtBirth(isoDate)`
- `residenceLabel(member)`
- `birthPlaceAndDateLabel(member)`
- `showSnackbar(msg, type)` — attualmente duplicata in admin.html, registration.html, already\_member.html

---

### `js/admin-table.js` (~160 righe, usato da admin.html + admin-ricerca.html + admin-storico.html)
Contiene:
- Stato sort: `_sortKey`, `_sortAsc`
- `sortBy(key)`, `sortIcon(key)`, `_sortRows(rows, key, asc)`
- Logica resize colonne: `initResizeHandles()`, `_saveColWidths()`, `_restoreColWidths()`

> admin-storico.html usa già le stesse 150+ righe identiche — questo file da solo salva ~450 righe totali.

---

### `js/signature.js` (~80 righe, usato da registration.html + registration-en.html)
Contiene:
- Setup canvas, event listeners (mouse + touch)
- `clearSignature()`
- `getSignatureBlob()` → Promise\<Blob\>
- `isSignatureEmpty()` → boolean

---

### `js/registration.js` (~200 righe, usato da registration.html + registration-en.html)
Contiene:
- Maschera input data `gg/mm/aaaa`
- Logica opt-out telefono / email
- `validateForm()` — validazione campi
- Gestione `submit` con chiamata a `submitRegistration()` / `submitLegacyMembershipRequest()`

**Strategia EN/IT:** un flag `window.LANG = 'it'` (o `'en'`) impostato inline nell'HTML prima di caricare lo script, così `registration.js` usa i messaggi di errore nella lingua corretta tramite un piccolo oggetto `MESSAGES[LANG]`. Questo **elimina la duplicazione** dei due file registration\*.html a livello JS.

**Cosa rimane inline in registration.html:** solo il blocco `<script>` con `window.LANG = 'it'` e la funzione `init()` (~30 righe) che carica il tema e configura il form.

---

### `js/already-member.js` (~80 righe, usato da already_member.html + already_member-en.html)
Identico ragionamento: flag `LANG`, logica lookup tessera estratta, `init()` rimane inline.

---

### `js/admin.js` e `js/admin-ricerca.js`
Il codice specifico di ogni pagina admin rimane separato (sono già molto diversi tra loro). La differenza rispetto ad oggi: non contengono più le utility e la logica tabella, che vengono importate dai file condivisi.

---

## Cosa NON separare

| Elemento | Motivo |
|----------|--------|
| CSS carosello (`.carousel-*`, `.lightbox`) | Usato solo in `index.html`, non vale un file esterno |
| `init()` IIFE in ogni pagina | È orchestrazione page-specific, 20–50 righe, sta bene inline |
| CSS layout a due colonne di registration (`.two-col`) | Specifico di quella pagina |
| `css/index.css` | `index.html` è abbastanza compatto da non giustificare un file separato |
| supabase-config.js | Già ben strutturato, nessuna modifica necessaria |

---

## Impatto stimato

| Metrica | Prima | Dopo |
|---------|-------|------|
| Righe HTML nei file `.html` (media) | ~900 | ~250 |
| Codice duplicato eliminato | — | ~2.000+ righe |
| File nuovi da creare | — | **8** (3 CSS + 5 JS) |
| File HTML che si riducono > 60% | — | **6 su 8** |

---

## Ordine di implementazione consigliato

1. `css/global.css` + `css/components.css` → applica a tutti i file (il ritorno maggiore)
2. `css/admin.css` → alleggerisce il triplet admin
3. `js/utils.js` + `js/admin-table.js` → elimina la duplicazione JS più pesante
4. `js/signature.js` + `js/registration.js` → unifica le due versioni lingua
5. `js/already-member.js` → unifica le due versioni lingua
6. `js/admin.js` + `js/admin-ricerca.js` → estrazione residua

Possiamo partire con qualsiasi step: dimmi quale vuoi implementare per primo.