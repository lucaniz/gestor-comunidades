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
  // Cada comunidad tiene el reparto "general" (coeficiente de la escritura, campo coef) y puede tener
  // repartos especiales (escalera, garaje, ascensor…) con su propio coeficiente por piso en coefs[id].
  // Un piso con coeficiente 0 o vacío en un reparto está exento de él.
  const coefOf = (u, rid) => (!rid || rid === 'general') ? num(u.coef) : num((u.coefs || {})[rid]);
  // Importe × coeficiente ÷ suma de coeficientes; los céntimos de redondeo van al piso de mayor coeficiente.
  function splitByCoef(units, total, rid) {
    const us = units.filter(u => coefOf(u, rid) > 0);
    const sc = us.reduce((a, u) => a + coefOf(u, rid), 0);
    if (!sc || !(total > 0)) return [];
    const rows = us.map(u => ({ u, imp: r2(total * coefOf(u, rid) / sc) }));
    const diff = r2(total - sum(rows.map(r => r.imp)));
    if (diff) { const big = rows.reduce((a, b) => coefOf(b.u, rid) > coefOf(a.u, rid) ? b : a); big.imp = r2(big.imp + diff); }
    return rows;
  }
  // Cuota de un periodo según el presupuesto por partidas: cada partida se reparte con su reparto.
  // Devuelve [{u, imp, desglose:{rid: importe}}] solo para pisos con importe > 0.
  function cuotaPresupuesto(units, partidas, periodos) {
    const porReparto = {};
    for (const p of partidas || []) { const rid = p.reparto || 'general'; porReparto[rid] = (porReparto[rid] || 0) + num(p.importe); }
    const acc = new Map();
    for (const [rid, anual] of Object.entries(porReparto)) {
      for (const { u, imp } of splitByCoef(units, r2(anual / (periodos || 1)), rid)) {
        const a = acc.get(u) || { u, imp: 0, desglose: {} };
        a.imp = r2(a.imp + imp); a.desglose[rid] = r2((a.desglose[rid] || 0) + imp); acc.set(u, a);
      }
    }
    return units.map(u => acc.get(u)).filter(Boolean);
  }

  /* ---------- Extracto bancario Norma 43 (AEB, cuaderno 43) ---------- */
  // Registro 11: cabecera de cuenta. 22: movimiento. 23: concepto complementario. 33: final de cuenta. 88: fin de fichero.
  function parseNorma43(text) {
    const cuentas = []; let cur = null, last = null;
    const fecha = s => `20${s.slice(0, 2)}-${s.slice(2, 4)}-${s.slice(4, 6)}`;
    const imp = s => (+s) / 100;
    for (const raw of String(text).split(/\r?\n/)) {
      const l = raw.replace(/\s+$/, ''); if (l.length < 2) continue;
      const t = l.slice(0, 2);
      if (t === '11') {
        cur = { banco: l.slice(2, 6), oficina: l.slice(6, 10), cuenta: l.slice(10, 20), desde: fecha(l.slice(20, 26)), hasta: fecha(l.slice(26, 32)),
          saldoInicial: (l[32] === '1' ? -1 : 1) * imp(l.slice(33, 47)), divisa: l.slice(47, 50), titular: l.slice(51, 77).trim(), movimientos: [] };
        cuentas.push(cur);
      } else if (t === '22' && cur) {
        last = { fecha: fecha(l.slice(10, 16)), fechaValor: fecha(l.slice(16, 22)), conceptoComun: l.slice(22, 24), conceptoPropio: l.slice(24, 27),
          importe: (l[27] === '1' ? -1 : 1) * imp(l.slice(28, 42)), documento: l.slice(42, 52).trim(), ref1: l.slice(52, 64).trim(), ref2: l.slice(64, 80).trim(), concepto: '' };
        cur.movimientos.push(last);
      } else if (t === '23' && last) {
        last.concepto = (last.concepto + ' ' + l.slice(4, 42).trim() + ' ' + l.slice(42, 80).trim()).replace(/\s+/g, ' ').trim();
      } else if (t === '33' && cur) {
        cur.saldoFinal = (l[58] === '1' ? -1 : 1) * imp(l.slice(59, 73));
      }
    }
    for (const c of cuentas) for (const m of c.movimientos) if (!m.concepto) m.concepto = [m.ref1, m.ref2].filter(Boolean).join(' ');
    return cuentas;
  }

  /* ---------- Devoluciones SEPA (pain.002) ---------- */
  const MOTIVOS_DEVOLUCION = {
    AC01: 'IBAN incorrecto', AC04: 'Cuenta cancelada', AC06: 'Cuenta bloqueada', AC13: 'Cuenta de consumidor no válida',
    AG01: 'Operación no permitida en esta cuenta', AG02: 'Código de operación no válido', AM04: 'Fondos insuficientes', AM05: 'Duplicado',
    BE05: 'Acreedor no identificado', CNOR: 'Banco del acreedor no localizable', DNOR: 'Banco del deudor no localizable',
    FF01: 'Formato no válido', MD01: 'Sin mandato', MD02: 'Faltan datos del mandato', MD06: 'Devolución solicitada por el titular',
    MD07: 'Titular fallecido', MS02: 'Rechazado por el titular', MS03: 'Motivo no especificado', RC01: 'BIC incorrecto',
    RR01: 'Faltan datos del deudor', RR02: 'Falta nombre o dirección del deudor', RR03: 'Falta nombre o dirección del acreedor',
    RR04: 'Motivo regulatorio', SL01: 'Servicio específico del banco', DUPL: 'Pago duplicado'
  };
  // Devuelve [{e2e, estado, motivo, motivoTexto, importe}] a partir del XML (usa el DOMParser que se le pase).
  function parsePain002(xml, DOMParserImpl) {
    const P = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!P) throw new Error('DOMParser no disponible');
    const doc = new P().parseFromString(xml, 'application/xml');
    const all = (el, name) => Array.from(el.getElementsByTagNameNS ? el.getElementsByTagNameNS('*', name) : el.getElementsByTagName(name));
    const first = (el, name) => all(el, name)[0];
    const out = [];
    for (const tx of all(doc, 'TxInfAndSts')) {
      const e2e = (first(tx, 'OrgnlEndToEndId') || {}).textContent || '';
      const estado = (first(tx, 'TxSts') || {}).textContent || 'RJCT';
      const rsn = first(tx, 'Rsn'); const cd = rsn ? ((first(rsn, 'Cd') || first(rsn, 'Prtry') || {}).textContent || '') : '';
      const amt = first(tx, 'InstdAmt');
      out.push({ e2e: e2e.trim(), estado: estado.trim(), motivo: cd.trim(), motivoTexto: MOTIVOS_DEVOLUCION[cd.trim()] || cd.trim() || 'Sin motivo', importe: amt ? num(amt.textContent) : null });
    }
    return out;
  }
  const e2eRecibo = id => sepaId('R' + id);

  /* ---------- Conciliación bancaria ---------- */
  const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  // Puntuación de parecido entre el concepto bancario y un nombre (0..1): palabras de 3+ letras en común.
  function parecido(concepto, nombre) {
    const a = new Set(norm(concepto).split(' ').filter(w => w.length >= 3));
    const b = norm(nombre).split(' ').filter(w => w.length >= 3);
    if (!b.length) return 0;
    return b.filter(w => a.has(w)).length / b.length;
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

  return { num, r2, sum, pad, today, addDays, daysBetween, fd, fdLong, ibanClean, mod97, ibanValid, ibanFmt, creditorId, sepaTxt, sepaId, buildPain008, coefOf, splitByCoef, cuotaPresupuesto, parseNorma43, parsePain002, MOTIVOS_DEVOLUCION, e2eRecibo, norm, parecido, parseCSV, csvCell, toCSV };
});
