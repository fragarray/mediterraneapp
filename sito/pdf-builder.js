/*  sito/pdf-builder.js
 *  Generazione PDF del modulo di adesione singolo socio.
 *  Dipendenze (devono essere caricate prima):
 *    – jsPDF  (window.jspdf)
 *    – logo-data.js  (LOGO_BASE64)
 *  La funzione chiama showSnackbar() dal contesto globale della pagina.
 */

/**
 * Formatta una data ISO (yyyy-MM-dd) in gg/mm/aaaa.
 * @param {string|null} isoDate
 * @returns {string}
 */
function _pdfFmtBirth(isoDate) {
  if (!isoDate) return '–';
  const parts = isoDate.split('-');
  if (parts.length < 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function _pdfMemberFilename(member) {
  const safeName = (member.cognome || '') + '_' + (member.nome || '');
  const cleanName = safeName.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
  const timestamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').slice(0, 12);
  return 'modulo_' + (cleanName || 'socio') + '_' + timestamp + '.pdf';
}

/**
 * Crea il PDF del modulo di adesione per un singolo socio senza scaricarlo.
 * @param {Object} member – record socio (campi: nome, cognome, numero_tessera, ecc.)
 * @returns {Promise<{doc: Object, filename: string}>}
 */
async function createMemberPdfDocument(member) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const W = doc.internal.pageSize.getWidth();   // 595.28 pt
  const H = doc.internal.pageSize.getHeight();  // 841.89 pt
  const marginL = 22, marginT = 18, marginR = 22, marginB = 20;
  const usable = W - marginL - marginR;
  let y = marginT;

  // Logo embedded as base64 (loaded from logo-data.js)
  const logoImg = (typeof LOGO_BASE64 !== 'undefined') ? LOGO_BASE64 : null;

  // Header row: logo + text column
  const logoW = 92; // 92 pt
  const logoH = Math.round(logoW * 199 / 393); // maintain aspect ratio (393x199 px)
  const logoGap = 14;
  const headerTextX = logoImg ? marginL + logoW + logoGap : marginL;
  if (logoImg) {
    doc.addImage(logoImg, 'PNG', marginL, y, logoW, logoH);
  }

  doc.setFontSize(16);
  doc.setFont(undefined, 'bold');
  doc.text('JATA APS', headerTextX, y + 14);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  doc.text('Via Giacomo Leopardi 1/C - 73020 Cutrofiano (LE)', headerTextX, y + 14 + 3 + 11);
  doc.text('P.IVA / Cod. Fisc. 05190010750', headerTextX, y + 14 + 3 + 11 + 11);

  doc.setFontSize(18);
  doc.setFont(undefined, 'bold');
  doc.text('Modulo di adesione socio', headerTextX, y + 14 + 3 + 11 + 11 + 10 + 20);
  doc.setFontSize(9);
  doc.setFont(undefined, 'normal');
  const generatedAt = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  doc.text('Documento generato il ' + generatedAt, headerTextX, y + 14 + 3 + 11 + 11 + 10 + 20 + 4 + 11);

  y += Math.max(logoH, 94) + 12; // 12pt gap after header

  // Info cards in Wrap layout (width:255pt each, spacing:10, runSpacing:8)
  const registrationDate = member.created_at
    ? new Date(member.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : '-';
  const details = [
    ['Numero tessera',   member.numero_tessera || '-'],
    ['Data registrazione', registrationDate],
    ['Nome',             member.nome || '-'],
    ['Cognome',          member.cognome || '-'],
    ['Luogo di nascita', member.luogo_nascita || '-'],
    ['Data di nascita',  _pdfFmtBirth(member.data_nascita)],
    ['Residenza',        member.residenza || '-'],
    ['Comune',           member.comune || '-'],
    ['CAP',              member.cap || '-'],
    ['Telefono',         member.telefono || '-'],
    ['Email',            member.email || '-'],
  ];

  const cardW = 255;      // card width
  const cardSpacing = 10; // spacing between cards
  const cardRunSpacing = 8; // spacing between rows
  const cardPadH = 8;     // horizontal padding
  const cardPadV = 6;     // vertical padding
  const cardRadius = 6;   // corner radius
  const labelFontSize = 9;
  const valueFontSize = 9;
  const cardH = cardPadV + labelFontSize + 2 + valueFontSize + cardPadV;

  // Wrap: place cards left-to-right, break to next row when exceeding usable width
  let cx = marginL, cy = y;
  details.forEach(pair => {
    if (cx + cardW > W - marginR + 1) {
      cx = marginL;
      cy += cardH + cardRunSpacing;
    }
    doc.setFillColor(240, 240, 240); // PdfColors.grey100
    doc.roundedRect(cx, cy, cardW, cardH, cardRadius, cardRadius, 'F');
    doc.setFontSize(labelFontSize);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(0);
    doc.text(pair[0], cx + cardPadH, cy + cardPadV + labelFontSize * 0.75);
    doc.setFont(undefined, 'normal');
    doc.setFontSize(valueFontSize);
    doc.text(pair[1] || '-', cx + cardPadH, cy + cardPadV + labelFontSize + 2 + valueFontSize * 0.75);
    cx += cardW + cardSpacing;
  });

  y = cy + cardH + 14; // 14pt gap after cards

  // Signature row: "Firma del socio" left, signature box right
  const sigBoxW = 150; // signature box width
  const sigBoxH = 62;  // signature box height
  const sigBoxX = W - marginR - sigBoxW;
  const sigBoxY = y;

  doc.setFontSize(11);
  doc.setFont(undefined, 'bold');
  doc.setTextColor(0);
  doc.text('Firma del socio', marginL, y + sigBoxH - 4); // align bottom-left

  doc.setDrawColor(158, 158, 158); // grey400
  doc.roundedRect(sigBoxX, sigBoxY, sigBoxW, sigBoxH, 8, 8);

  // Try to embed signature image
  if (member.firma_url) {
    try {
      const sigRes = await fetch(member.firma_url);
      if (sigRes.ok) {
        const sigBlob = await sigRes.blob();
        const sigData = await new Promise(resolve => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.readAsDataURL(sigBlob);
        });
        doc.addImage(sigData, 'PNG', sigBoxX + 6, sigBoxY + 6, sigBoxW - 12, sigBoxH - 12);
      }
    } catch (_) {
      doc.setFontSize(8);
      doc.setTextColor(112); // grey700
      doc.text('Firma non disponibile', sigBoxX + sigBoxW / 2, sigBoxY + sigBoxH / 2, { align: 'center' });
    }
  } else {
    doc.setFontSize(8);
    doc.setTextColor(112);
    doc.text('Firma non disponibile', sigBoxX + sigBoxW / 2, sigBoxY + sigBoxH / 2, { align: 'center' });
  }

  // Privacy footer (at very bottom)
  const footerY = H - marginB;
  doc.setDrawColor(189, 189, 189); // grey300
  doc.line(marginL, footerY - 18, W - marginR, footerY - 18);
  doc.setFontSize(8);
  doc.setTextColor(112); // grey700
  doc.setFont(undefined, 'normal');
  doc.text(
    'Acconsento al trattamento dei miei dati personali ai sensi del REg. UE 679/2016 (GDPR), esclusivamente per finalità associative e di comunicazione interna.',
    W / 2, footerY - 4,
    { align: 'center', maxWidth: usable }
  );

  return { doc, filename: _pdfMemberFilename(member) };
}

/**
 * Genera e scarica il PDF del modulo di adesione per un singolo socio.
 * @param {Object} member – record socio (campi: nome, cognome, numero_tessera, ecc.)
 */
async function exportMemberPdf(member) {
  try {
    const { doc, filename } = await createMemberPdfDocument(member);
    doc.save(filename);
    showSnackbar('PDF generato.');
  } catch (e) {
    showSnackbar('Errore generazione PDF: ' + e.message, true);
  }
}

