/*
 * Gestor de Comunidades — lógica pura (sin interfaz).
 * Funciona en el navegador (window.GC) y en Node (require) para los tests.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GC = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ---------- números y fechas ---------- */
  // Acepta "1.234,56", "1234.56", "12,5 €", "10 %".
  const num = v => {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    let s = String(v ?? '').trim().replace(/\s|€|%/g, '');
    if (!s) return 0;
    if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
    const n = parseFloat(s);
    return isFinite(n) ? n : 0;
  };
  const r2 = n => Math.round((n + Number.EPSILON) * 100) / 100;
  const sum = a => r2(a.reduce((x, y) => x + (+y || 0), 0));
  const pad = n => String(n).padStart(2, '0');
  function today() { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
  function addDays(iso, n) { const [y, m, d] = iso.split('-').map(Number); const t = new Date(y, m - 1, d + n); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}`; }
  function daysBetween(a, b) { const p = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((p(b) - p(a)) / 864e5); }
  const fd = iso => { if (!iso) return ''; const [y, m, d] = String(iso).split('-'); return d ? `${d}/${m}/${y}` : iso; };
  function fdLong(iso) { if (!iso) return '___'; const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); }

  /* ---------- IBAN e identificador de acreedor SEPA ---------- */
  const ibanClean = s => String(s || '').replace(/[\s-]+/g, '').toUpperCase();
  // ISO 7064 MOD 97-10 sobre una cadena alfanumérica (A=10 … Z=35).
  function mod97(str) { let r = 0; for (const ch of str) { const v = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch; for (const d of v) r = (r * 10 + (+d)) % 97; } return r; }
  function ibanValid(s) {
    const i = ibanClean(s);
    if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(i)) return false;
    if (i.startsWith('ES') && i.length !== 24) return false;
    return mod97(i.slice(4) + i.slice(0, 4)) === 1;
  }
  const ibanFmt = s => ibanClean(s).replace(/(.{4})/g, '$1 ').trim();
  // Identificador de acreedor (AT-02): ES + 2 dígitos de control + sufijo (3) + NIF.
  // Los dígitos de control se calculan sobre NIF + "ES00", sin el sufijo.
  function creditorId(nif, suf) {
    const n = String(nif || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (!n) return '';
    const chk = 98 - mod97(n + 'ES00');
    return 'ES' + pad(chk) + String(suf || '000').toUpperCase().replace(/[^A-Z0-9]/g, '').padEnd(3, '0').slice(0, 3) + n;
  }

  /* ---------- Fichero SEPA pain.008.001.02 (adeudos CORE) ---------- */
  // Juego de caracteres SEPA: letras sin tilde, dígitos y / - ? : ( ) . , ' + espacio.
  function sepaTxt(s, max) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9\/\-?:().,'+ ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
  const xe = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&apos;');
  const sepaId = s => String(s).replace(/[^A-Za-z0-9\-]/g, '').slice(0, 35);
  function buildPain008({ msgId, creDtTm, cdtrNm, cdtrIban, cdtrBic, cdtrId, fecha, items }) {
    const ctrl = sum(items.map(i => i.importe)).toFixed(2);
    const agt = bic => bic ? `<FinInstnId><BIC>${xe(bic)}</BIC></FinInstnId>` : '<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>';
    const tx = items.map(i => `
      <DrctDbtTxInf>
        <PmtId><EndToEndId>${xe(sepaId(i.e2e))}</EndToEndId></PmtId>
        <InstdAmt Ccy="EUR">${(+i.importe).toFixed(2)}</InstdAmt>
        <DrctDbtTx><MndtRltdInf><MndtId>${xe(sepaTxt(i.mandato, 35))}</MndtId><DtOfSgntr>${xe(i.mandatoFecha)}</DtOfSgntr></MndtRltdInf></DrctDbtTx>
        <DbtrAgt>${agt('')}</DbtrAgt>
        <Dbtr><Nm>${xe(sepaTxt(i.nombre, 70))}</Nm></Dbtr>
        <DbtrAcct><Id><IBAN>${xe(ibanClean(i.iban))}</IBAN></Id></DbtrAcct>
        <RmtInf><Ustrd>${xe(sepaTxt(i.concepto, 140))}</Ustrd></RmtInf>
      </DrctDbtTxInf>`).join('');
    return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.008.001.02" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrDrctDbtInitn>
    <GrpHdr>
      <MsgId>${xe(sepaId(msgId))}</MsgId>
      <CreDtTm>${xe(creDtTm)}</CreDtTm>
      <NbOfTxs>${items.length}</NbOfTxs>
      <CtrlSum>${ctrl}</CtrlSum>
      <InitgPty><Nm>${xe(sepaTxt(cdtrNm, 70))}</Nm><Id><OrgId><Othr><Id>${xe(cdtrId)}</Id></Othr></OrgId></Id></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${xe(sepaId(msgId + '-1'))}</PmtInfId>
      <PmtMtd>DD</PmtMtd>
      <BtchBookg>true</BtchBookg>
      <NbOfTxs>${items.length}</NbOfTxs>
      <CtrlSum>${ctrl}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl><LclInstrm><Cd>CORE</Cd></LclInstrm><SeqTp>RCUR</SeqTp></PmtTpInf>
      <ReqdColltnDt>${xe(fecha)}</ReqdColltnDt>
      <Cdtr><Nm>${xe(sepaTxt(cdtrNm, 70))}</Nm></Cdtr>
      <CdtrAcct><Id><IBAN>${xe(ibanClean(cdtrIban))}</IBAN></Id></CdtrAcct>
      <CdtrAgt>${agt(cdtrBic)}</CdtrAgt>
      <ChrgBr>SLEV</ChrgBr>
      <CdtrSchmeId><Id><PrvtId><Othr><Id>${xe(cdtrId)}</Id><SchmeNm><Prtry>SEPA</Prtry></SchmeNm></Othr></PrvtId></Id></CdtrSchmeId>${tx}
    </PmtInf>
  </CstmrDrctDbtInitn>
</Document>
`;
  }

  /* ---------- Reparto por coeficiente ---------- */
  // Importe × coeficiente ÷ suma de coeficientes; los céntimos de redondeo van al piso de mayor coeficiente.
  function splitByCoef(units, total) {
    const us = units.filter(u => num(u.coef) > 0);
    const sc = us.reduce((a, u) => a + num(u.coef), 0);
    if (!sc || !(total > 0)) return [];
    const rows = us.map(u => ({ u, imp: r2(total * num(u.coef) / sc) }));
    const diff = r2(total - sum(rows.map(r => r.imp)));
    if (diff) { const big = rows.reduce((a, b) => num(b.u.coef) > num(a.u.coef) ? b : a); big.imp = r2(big.imp + diff); }
    return rows;
  }

  /* ---------- CSV (separador ; o , detectado) ---------- */
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/)[0] || '';
    const del = (first.split(';').length >= first.split(',').length) ? ';' : ',';
    const rows = []; let row = [], f = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += c; }
      else if (c === '"') q = true;
      else if (c === del) { row.push(f); f = ''; }
      else if (c === '\n') { row.push(f); rows.push(row); row = []; f = ''; }
      else if (c !== '\r') f += c;
    }
    if (f !== '' || row.length) { row.push(f); rows.push(row); }
    return rows.filter(r => r.some(x => x.trim() !== ''));
  }
  const csvCell = v => { const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? ''); return /[;"\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  const toCSV = (head, rows) => '﻿' + [head, ...rows].map(r => r.map(csvCell).join(';')).join('\r\n');

  return { num, r2, sum, pad, today, addDays, daysBetween, fd, fdLong, ibanClean, mod97, ibanValid, ibanFmt, creditorId, sepaTxt, sepaId, buildPain008, splitByCoef, parseCSV, csvCell, toCSV };
});
