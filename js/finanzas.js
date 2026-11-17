/*
 * Gestor de Comunidades — finanzas:
 *   presupuesto por partidas y repartos especiales, otros ingresos, cuentas anuales,
 *   banco (Norma 43, CSV, devoluciones SEPA y conciliación), honorarios del despacho e impuestos.
 * Se apoya en las funciones globales de app.js (S, ui, store, modal, render…).
 */
'use strict';

/* ================= registro de colecciones, vistas y formularios ================= */
COLS.push('ingresos', 'movimientos', 'facturas');
['ingresos', 'movimientos', 'facturas'].forEach(c => { S[c] = []; });
Object.assign(NOUN, { ingresos: 'ingreso', movimientos: 'movimiento', facturas: 'factura' });
(function () {
  const at = (key, ...items) => VIEWS.splice(VIEWS.findIndex(v => v[0] === key) + 1, 0, ...items);
  at('propietarios', ['presupuesto', 'Presupuesto y repartos']);
  at('gastos', ['ingresos', 'Otros ingresos'], ['banco', 'Banco'], ['cuentas', 'Cuentas anuales']);
  at('proveedores', ['honorarios', 'Honorarios'], ['impuestos', 'Impuestos']);
  VIEWS.find(v => v[0] === 'gastos')[1] = 'Gastos';
})();

const CATS_INGRESO = ['Alquileres', 'Intereses', 'Subvenciones', 'Indemnizaciones de seguros', 'Otros'];
(function () {
  const pos = (arr, k) => arr.findIndex(f => f.k === k) + 1;
  const g = SCHEMA.gastos;
  g.splice(pos(g, 'categoria'), 0, { k: 'partidaId', l: 'Partida del presupuesto', t: 'partida' });
  g.splice(pos(g, 'importe'), 0,
    { k: 'baseImponible', l: 'Base imponible (€, sin IVA)', t: 'number', hint: 'Necesaria si hay retención' },
    { k: 'retencion', l: 'Retención IRPF practicada (€)', t: 'number', hint: 'Facturas de profesionales personas físicas (modelo 111)' });
  const c = SCHEMA.comunidades.find(f => f.k === 'presupuestoAnual');
  c.hint = 'Si defines partidas en "Presupuesto y repartos", se usa la suma de las partidas';
  SCHEMA.despacho.push(
    { k: 'iban', l: 'IBAN para cobrar tus honorarios', t: 'iban' },
    { k: 'serieFactura', l: 'Serie de facturas', def: 'A' },
    { k: 'ivaPct', l: 'IVA de tus facturas (%)', t: 'number', def: 21 },
    { k: 'retencionPct', l: 'Retención IRPF que te practican (%)', t: 'number', def: 15, hint: '15 % general, 7 % los primeros años de actividad, 0 si facturas como sociedad' });
})();
SCHEMA.ingresos = [
  { k: 'cid', l: 'Comunidad', t: 'cid', req: 1 }, { k: 'fecha', l: 'Fecha', t: 'date', def: '@today', req: 1 },
  { k: 'categoria', l: 'Tipo de ingreso', t: 'select', o: CATS_INGRESO, def: 'Alquileres' }, { k: 'importe', l: 'Importe (€)', t: 'number', req: 1 },
  { k: 'concepto', l: 'Concepto', req: 1, full: 1, hint: 'Ej.: Alquiler piso portería, noviembre' },
  { k: 'pagador', l: 'Pagador / inquilino' }, { k: 'pagadorNif', l: 'NIF del pagador' },
  { k: 'retencion', l: 'Retención soportada (€)', t: 'number', hint: 'Si el inquilino es una empresa, retiene el 19 % del alquiler' },
  { k: 'cobrado', l: 'Cobrado', t: 'check', def: true }, { k: 'notas', l: 'Notas', t: 'textarea' }];
SCHEMA.movimientos = [
  { k: 'cid', l: 'Comunidad', t: 'cid', req: 1 }, { k: 'fecha', l: 'Fecha', t: 'date', req: 1 },
  { k: 'importe', l: 'Importe (€, negativo si es un cargo)', t: 'number', req: 1 }, { k: 'concepto', l: 'Concepto', full: 1 }, { k: 'notas', l: 'Notas', t: 'textarea' }];
SCHEMA.facturas = [
  { k: 'cid', l: 'Comunidad', t: 'cid', req: 1 }, { k: 'numero', l: 'Número', req: 1 }, { k: 'fecha', l: 'Fecha', t: 'date', req: 1 },
  { k: 'concepto', l: 'Concepto', req: 1, full: 1 }, { k: 'base', l: 'Base imponible (€)', t: 'number', req: 1 },
  { k: 'ivaPct', l: 'IVA (%)', t: 'number', def: 21 }, { k: 'retPct', l: 'Retención IRPF (%)', t: 'number', def: 15 },
  { k: 'cobrada', l: 'Cobrada', t: 'check' }, { k: 'fechaCobro', l: 'Fecha de cobro', t: 'date' }];
BEFORE_SAVE.facturas = o => { o.iva = r2(num(o.base) * num(o.ivaPct) / 100); o.retencion = r2(num(o.base) * num(o.retPct) / 100); o.total = r2(num(o.base) + o.iva - o.retencion); };

const repartosDe = k => [{ id: 'general', nombre: 'General' }, ...((k && k.repartos) || [])];
const repartoNombre = (k, rid) => (repartosDe(k).find(r => r.id === rid) || { nombre: rid || 'General' }).nombre;
FIELD_TYPES.partida = (f, v, data, id) => { const k = com(data.cid); const ps = (k && k.partidas) || [];
  return `<select id="${id}"><option value="">${ps.length ? '— Sin partida —' : '— La comunidad no tiene partidas —'}</option>${ps.map(p => `<option value="${esc(p.id)}" ${p.id === v ? 'selected' : ''}>${esc(p.nombre)}</option>`).join('')}</select>`; };
FIELD_TYPES.partida.dep = true;
const newKey = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const yearsOf = (dates, extra) => [...new Set(dates.filter(Boolean).map(d => String(d).slice(0, 4)).concat(extra || []))].filter(y => /^\d{4}$/.test(y)).sort().reverse();
const curYear = () => String(new Date().getFullYear());
const signo = n => `<span style="color:var(${n < 0 ? '--bad' : '--ok'});font-weight:600">${eur(n)}</span>`;

/* ================= presupuesto, repartos y coeficientes ================= */
ui.coefDraft = {};
function vPresupuesto() {
  if (ui.cid === 'all' || !com(ui.cid)) return head('Presupuesto y repartos', 'Partidas del presupuesto, repartos especiales (escalera, garaje, ascensor…) y coeficientes de cada piso.') + needCom('ver su presupuesto');
  const k = com(ui.cid), us = unitsOf(k.id), reps = repartosDe(k), ps = k.partidas || [], per = PPY[k.periodicidad] || 4;
  const coefVal = (u, rid) => { const d = ui.coefDraft[u.id + '|' + rid]; return d !== undefined ? d : (rid === 'general' ? u.coef : (u.coefs || {})[rid]); };
  const cuotas = ps.length ? cuotaPresupuesto(us.map(u => ({ ...u, coefs: { ...(u.coefs || {}) } })), ps, per) : splitByCoef(us, r2(presupuestoDe(k) / per)).map(x => ({ ...x, desglose: { general: x.imp } }));
  const usados = [...new Set(ps.map(p => p.reparto || 'general'))];
  const dirty = Object.keys(ui.coefDraft).length;
  return `${head('Presupuesto y repartos', `${esc(k.nombre)} · cuotas ${esc(k.periodicidad || 'trimestral')}es. Cada partida se reparte entre los pisos según el coeficiente de su reparto; un piso con coeficiente 0 está exento.`, `<button class="btn" data-act="docPresupuesto">Documento para la junta</button><button class="btn pri" data-act="partida">Añadir partida</button>`)}
  <div class="cols"><div class="card"><div class="vh"><h2>Partidas del presupuesto anual</h2>${ps.length ? '' : `<button class="btn sm" data-act="partidasDeGastos">Crear desde los gastos de ${Number(D.y) - 1}</button>`}</div>
    ${ps.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Partida</th><th>Reparto</th><th class="r">Importe anual</th><th></th></tr></thead><tbody>${ps.map(p => `<tr><td>${esc(p.nombre)}${p.categoria ? `<div class="sub">Gastos de «${esc(p.categoria)}»</div>` : ''}</td><td>${esc(repartoNombre(k, p.reparto))}</td><td class="r">${eur(p.importe)}</td><td class="ra"><button class="btn sm" data-act="partida" data-id="${esc(p.id)}">Editar</button> <button class="btn sm danger" data-act="partidaDel" data-id="${esc(p.id)}" aria-label="Borrar partida">×</button></td></tr>`).join('')}</tbody><tfoot><tr><td colspan="2">Total presupuesto</td><td class="r">${eur(presupuestoDe(k))}</td><td></td></tr></tfoot></table></div>`
      : `<p class="sub" style="margin:0">Sin partidas: las cuotas reparten el presupuesto global de ${eur(k.presupuestoAnual)} con el coeficiente general. Añade partidas para presupuestar por conceptos y repartir cada una con su reparto.</p>`}
  </div>
  <div class="card"><div class="vh"><h2>Repartos</h2><button class="btn sm" data-act="reparto">Nuevo reparto</button></div>
    <div class="list">${reps.map(r => { const n = us.filter(u => num(coefOf(u, r.id)) > 0).length, sc = r2(us.reduce((a, u) => a + num(coefOf(u, r.id)), 0) * 10000) / 10000;
      return `<div class="it"><span><b>${esc(r.nombre)}</b><div class="sub">${n} de ${us.length} pisos · suma ${esc(PCT.format(sc))}${r.id === 'general' ? ' % (escritura)' : ''}${usados.includes(r.id) ? '' : ' · sin partidas'}</div></span>${r.id === 'general' ? '' : `<span class="acts"><button class="btn sm" data-act="reparto" data-id="${esc(r.id)}">Renombrar</button><button class="btn sm danger" data-act="repartoDel" data-id="${esc(r.id)}" aria-label="Borrar reparto">×</button></span>`}</div>`; }).join('')}</div>
    <p class="sub" style="margin:0">Ejemplos: «Escalera B», «Garaje», «Ascensor (excepto bajos)», «Locales». Los coeficientes de cada reparto no tienen que sumar 100: se reparte en proporción.</p></div></div>
  <div class="card"><div class="vh"><h2>Coeficientes por reparto</h2><span class="acts">${dirty ? `<span class="pill warn">${dirty} cambios sin guardar</span><button class="btn sm" data-act="coefDescartar">Descartar</button>` : ''}<button class="btn sm pri" data-act="coefGuardar" ${dirty ? '' : 'disabled'}>Guardar coeficientes</button></span></div>
    ${us.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Piso</th><th>Propietario/a</th>${reps.map(r => `<th class="r">${esc(r.nombre)}${r.id === 'general' ? '' : `<div><button class="btn link" data-act="coefCopiar" data-id="${esc(r.id)}" style="font-size:12px;text-transform:none;letter-spacing:0">copiar general</button> · <button class="btn link" data-act="coefIgual" data-id="${esc(r.id)}" style="font-size:12px;text-transform:none;letter-spacing:0">iguales</button></div>`}</th>`).join('')}</tr></thead><tbody>
      ${us.map(u => `<tr><td class="nw"><b>${esc(u.ref)}</b></td><td class="sub">${esc(u.propietario)}</td>${reps.map(r => `<td class="r"><input class="coef" data-uid="${esc(u.id)}" data-rid="${esc(r.id)}" type="text" inputmode="decimal" aria-label="Coeficiente ${esc(r.nombre)} de ${esc(u.ref)}" value="${esc(String(coefVal(u, r.id) ?? '').replace('.', ','))}" style="width:90px;text-align:right"></td>`).join('')}</tr>`).join('')}
    </tbody><tfoot><tr><td colspan="2">Suma</td>${reps.map(r => `<td class="r">${esc(PCT.format(us.reduce((a, u) => a + num(coefVal(u, r.id)), 0)))}</td>`).join('')}</tr></tfoot></table></div>` : '<p class="sub" style="margin:0">Añade primero los pisos en Propietarios.</p>'}</div>
  <div class="card"><h2>Cuota de cada piso por periodo (${per} al año)</h2>
    ${cuotas.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Piso</th><th>Propietario/a</th>${(ps.length ? usados : ['general']).map(rid => `<th class="r">${esc(repartoNombre(k, rid))}</th>`).join('')}<th class="r">Cuota</th><th class="r">Al año</th></tr></thead><tbody>
      ${cuotas.map(c => `<tr><td class="nw">${esc(c.u.ref)}</td><td class="sub">${esc(c.u.propietario)}</td>${(ps.length ? usados : ['general']).map(rid => `<td class="r">${c.desglose[rid] ? eur(c.desglose[rid]) : '—'}</td>`).join('')}<td class="r"><b>${eur(c.imp)}</b></td><td class="r">${eur(c.imp * per)}</td></tr>`).join('')}
    </tbody><tfoot><tr><td colspan="${2 + (ps.length ? usados.length : 1)}">Total por periodo</td><td class="r">${eur(sum(cuotas.map(c => c.imp)))}</td><td class="r">${eur(sum(cuotas.map(c => c.imp)) * per)}</td></tr></tfoot></table></div>` : '<p class="sub" style="margin:0">Sin presupuesto o sin coeficientes todavía.</p>'}</div>`;
}
document.addEventListener('input', e => {
  if (e.target.classList && e.target.classList.contains('coef')) {
    const key = e.target.dataset.uid + '|' + e.target.dataset.rid; ui.coefDraft[key] = e.target.value;
    const bar = document.querySelector('[data-act="coefGuardar"]'); if (bar) bar.disabled = false;
  }
});
document.addEventListener('change', e => { if (e.target.classList && e.target.classList.contains('coef')) render(); });

async function saveComunidad(k, patch) { await retry(() => store.update('comunidades', k.id, patch)); }
Object.assign(ACTS, {
  partida: d => {
    const k = com(ui.cid); if (!k) return; const p = (k.partidas || []).find(x => x.id === d.id) || {};
    modal(p.id ? 'Editar partida' : 'Nueva partida', `<div class="fg">
      <label class="full" for="p_n">Partida *<input id="p_n" type="text" value="${esc(p.nombre || '')}" placeholder="Ej.: Limpieza, Ascensor, Seguro, Agua…"></label>
      <label for="p_r">Se reparte con<select id="p_r">${repartosDe(k).map(r => `<option value="${esc(r.id)}" ${r.id === (p.reparto || 'general') ? 'selected' : ''}>${esc(r.nombre)}</option>`).join('')}</select></label>
      <label for="p_i">Importe anual (€) *<input id="p_i" type="text" inputmode="decimal" value="${p.importe != null ? esc(String(p.importe).replace('.', ',')) : ''}"></label>
      <label class="full" for="p_c">Gastos que se imputan a esta partida<select id="p_c"><option value="">— Solo los que la elijan expresamente —</option>${CATS.map(c => `<option ${c === p.categoria ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select><small>Los gastos de esta categoría sin partida asignada se cuentan aquí en las cuentas anuales</small></label></div>`,
      [{ l: 'Cancelar' }, { l: 'Guardar', pri: 1, fn: async (b, setErr) => {
        const nombre = $('#p_n', b).value.trim(), importe = num($('#p_i', b).value); if (!nombre) return setErr('Indica el nombre de la partida.'), false;
        const np = { id: p.id || newKey('p'), nombre, reparto: $('#p_r', b).value, importe, categoria: $('#p_c', b).value };
        const list = (k.partidas || []).filter(x => x.id !== np.id); const i = (k.partidas || []).findIndex(x => x.id === np.id);
        list.splice(i < 0 ? list.length : i, 0, np); await saveComunidad(k, { partidas: list }); toast('Partida guardada'); } }]);
  },
  partidaDel: async d => { const k = com(ui.cid); if (!k || !await confirmBox('¿Borrar esta partida del presupuesto?', 'Borrar', true)) return; await saveComunidad(k, { partidas: (k.partidas || []).filter(p => p.id !== d.id) }); },
  partidasDeGastos: async () => {
    const k = com(ui.cid); const y = String(Number(D.y) - 1); const acc = {};
    S.gastos.filter(g => g.cid === k.id && String(g.fecha).startsWith(y)).forEach(g => { const c = g.categoria || 'Otros'; acc[c] = (acc[c] || 0) + num(g.importe); });
    const ps = Object.entries(acc).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ id: newKey('p'), nombre: c, reparto: 'general', importe: Math.ceil(v / 10) * 10, categoria: c }));
    if (!ps.length) return toast(`No hay gastos de ${y} en esta comunidad.`);
    await saveComunidad(k, { partidas: ps }); toast(`${ps.length} partidas creadas a partir de los gastos de ${y} (redondeadas). Revísalas.`);
  },
  reparto: d => {
    const k = com(ui.cid); if (!k) return; const r = (k.repartos || []).find(x => x.id === d.id) || {};
    modal(r.id ? 'Renombrar reparto' : 'Nuevo reparto', `<div class="fg"><label class="full" for="r_n">Nombre *<input id="r_n" type="text" value="${esc(r.nombre || '')}" placeholder="Ej.: Garaje"></label></div>${r.id ? '' : '<p class="sub" style="margin:0">Después, en la tabla de coeficientes, pon el coeficiente de cada piso en este reparto (0 = exento). Puedes copiar el general como punto de partida.</p>'}`,
      [{ l: 'Cancelar' }, { l: 'Guardar', pri: 1, fn: async (b, setErr) => { const nombre = $('#r_n', b).value.trim(); if (!nombre) return setErr('Indica un nombre.'), false;
        const list = (k.repartos || []).filter(x => x.id !== r.id); list.push({ id: r.id || newKey('r'), nombre });
        await saveComunidad(k, { repartos: list }); } }]);
  },
  repartoDel: async d => { const k = com(ui.cid); if (!k) return;
    if ((k.partidas || []).some(p => p.reparto === d.id)) return toast('Hay partidas que usan este reparto: cámbialas primero.');
    if (!await confirmBox('¿Borrar este reparto? Los coeficientes de los pisos en este reparto dejarán de usarse.', 'Borrar', true)) return;
    await saveComunidad(k, { repartos: (k.repartos || []).filter(r => r.id !== d.id) }); },
  coefCopiar: d => { unitsOf(ui.cid).forEach(u => { ui.coefDraft[u.id + '|' + d.id] = String(num(u.coef)).replace('.', ','); }); render(); },
  coefIgual: d => { const us = unitsOf(ui.cid); const v = r2(10000 / us.length) / 100; us.forEach(u => { ui.coefDraft[u.id + '|' + d.id] = String(v).replace('.', ','); }); render(); },
  coefDescartar: () => { ui.coefDraft = {}; render(); },
  coefGuardar: async () => {
    const byUnit = {}; for (const [key, v] of Object.entries(ui.coefDraft)) { const [uid, rid] = key.split('|'); (byUnit[uid] = byUnit[uid] || {})[rid] = num(v); }
    try { for (const [uid, m] of Object.entries(byUnit)) { const u = find('unidades', uid); if (!u) continue;
        const patch = { coefs: { ...(u.coefs || {}) } }; for (const [rid, v] of Object.entries(m)) { if (rid === 'general') patch.coef = v; else patch.coefs[rid] = v; }
        await retry(() => store.update('unidades', uid, patch)); }
      ui.coefDraft = {}; toast('Coeficientes guardados'); render(); } catch (e) { toast(errMsg(e)); }
  },
  docPresupuesto: () => { const k = com(ui.cid); if (k) openDoc(docPresupuesto(k), `presupuesto_${slug(k.nombre)}.html`); }
});
function docPresupuesto(k) {
  const us = unitsOf(k.id), ps = k.partidas || [], per = PPY[k.periodicidad] || 4;
  const cuotas = ps.length ? cuotaPresupuesto(us, ps, per) : splitByCoef(us, r2(presupuestoDe(k) / per)).map(x => ({ ...x, desglose: {} }));
  const anioAnt = String(Number(D.y) - 1);
  const realAnt = p => sum(S.gastos.filter(g => g.cid === k.id && String(g.fecha).startsWith(anioAnt) && (g.partidaId === p.id || (!g.partidaId && p.categoria && g.categoria === p.categoria))).map(g => g.importe));
  return docPage('Presupuesto ' + k.nombre, `${comHead(k)}<h1>PROPUESTA DE PRESUPUESTO ORDINARIO</h1>
  <h2>Partidas</h2><table><tr><th>Partida</th><th>Reparto</th><th class="r">Gasto ${anioAnt}</th><th class="r">Presupuesto</th></tr>
  ${ps.length ? ps.map(p => `<tr><td>${esc(p.nombre)}</td><td>${esc(repartoNombre(k, p.reparto))}</td><td class="r">${eur(realAnt(p))}</td><td class="r">${eur(p.importe)}</td></tr>`).join('') : `<tr><td colspan="3">Presupuesto global</td><td class="r">${eur(presupuestoDe(k))}</td></tr>`}
  <tr><td colspan="3"><b>TOTAL</b></td><td class="r"><b>${eur(presupuestoDe(k))}</b></td></tr></table>
  <p>Fondo de reserva: ${esc(PCT.format(num(k.fondoReservaPct)))} % del presupuesto, ${eur(presupuestoDe(k) * num(k.fondoReservaPct) / 100)} (mínimo legal 10 %, art. 9.1.f LPH).</p>
  <h2>Cuota ${esc(k.periodicidad || 'trimestral')} por piso</h2><table><tr><th>Piso</th><th>Propietario/a</th><th class="r">Cuota</th><th class="r">Anual</th></tr>
  ${cuotas.map(c => `<tr><td>${esc(c.u.ref)}</td><td>${esc(c.u.propietario)}</td><td class="r">${eur(c.imp)}</td><td class="r">${eur(c.imp * per)}</td></tr>`).join('')}</table>
  <p class="nota">Documento preparado por ${esc(adminName())} para su aprobación en Junta General.</p>`);
}

/* ================= generación de recibos (presupuesto por partidas o reparto) ================= */
function genRecibos2() {
  const html = `<div class="fg">
    <label for="g_cid">Comunidad *<select id="g_cid">${comOpts(ui.cid !== 'all' ? ui.cid : '')}</select></label>
    <label for="g_tipo">Tipo<select id="g_tipo"><option value="ordinaria">Cuota ordinaria (presupuesto)</option><option value="derrama">Derrama</option><option value="otro">Otro cargo</option></select></label>
    <label for="g_rep">Reparto<select id="g_rep"></select><small id="g_rep_h"></small></label>
    <label for="g_per">Periodo *<input id="g_per" type="text"><small>Ej.: 2026-T4, 2026-11</small></label>
    <label for="g_tot">Importe total a repartir (€) *<input id="g_tot" type="text" inputmode="decimal"><small id="g_hint"></small></label>
    <label for="g_con">Concepto que verá el propietario *<input id="g_con" type="text"></label>
    <label for="g_emi">Fecha de emisión<input id="g_emi" type="date" value="${today()}"></label>
    <label for="g_ven">Vencimiento<input id="g_ven" type="date" value="${addDays(today(), 10)}"></label>
  </div><div id="g_prev"></div>`;
  let rows = [], modo = 'reparto';
  const m = modal('Generar recibos', html, [{ l: 'Cancelar' }, { l: 'Crear recibos', pri: 1, fn: async (b, setErr) => {
    const cid = $('#g_cid', b).value, per = $('#g_per', b).value.trim(), con = $('#g_con', b).value.trim();
    if (!cid) return setErr('Elige la comunidad.'), false; if (!per || !con) return setErr('Indica el periodo y el concepto.'), false;
    if (!rows.length) return setErr('No hay importe o pisos con coeficiente para repartir.'), false;
    const dup = S.recibos.filter(r => r.cid === cid && r.periodo === per && r.concepto === con).length;
    if (dup && !b.dataset.dupOk) { b.dataset.dupOk = '1'; setErr(`Ya existen ${dup} recibos con este periodo y concepto. Pulsa otra vez "Crear recibos" para crearlos igualmente.`); return false; }
    const tipo = $('#g_tipo', b).value, emi = $('#g_emi', b).value, ven = $('#g_ven', b).value, rid = modo === 'reparto' ? $('#g_rep', b).value : '';
    let i = 0;
    for (const r of rows) { i++; setErr(`Creando ${i} de ${rows.length}…`, true);
      await retry(() => store.add('recibos', { cid, uid: r.u.id, periodo: per, concepto: con, tipo, reparto: rid || 'presupuesto', desglose: r.desglose || null, importe: r.imp, emision: emi, vencimiento: ven, estado: 'pendiente', fechaCobro: '', creado: new Date().toISOString() })); }
    toast(`${rows.length} recibos creados`); ui.recPeriodo = per; ui.recEstado = 'abiertos'; if (ui.cid !== cid) { ui.cid = cid; lsSet('cid', cid); }
    if (ui.view !== 'recibos') location.hash = '#recibos'; else render();
  } }], { wide: 1 });
  const b = m.body, touched = {};
  const preview = () => {
    const k = com($('#g_cid', b).value); delete b.dataset.dupOk; if (!k) { $('#g_prev', b).innerHTML = ''; rows = []; return; }
    const us = unitsOf(k.id), tipo = $('#g_tipo', b).value, per = PPY[k.periodicidad] || 4;
    modo = tipo === 'ordinaria' && (k.partidas || []).length ? 'presupuesto' : 'reparto';
    $('#g_rep', b).disabled = modo === 'presupuesto'; $('#g_tot', b).disabled = modo === 'presupuesto';
    let cols;
    if (modo === 'presupuesto') { rows = cuotaPresupuesto(us, k.partidas, per); $('#g_tot', b).value = String(sum(rows.map(r => r.imp))).replace('.', ',');
      cols = [...new Set(k.partidas.map(p => p.reparto || 'general'))]; $('#g_hint', b).textContent = `Suma de las partidas ÷ ${per}`; $('#g_rep_h', b).textContent = 'Cada partida usa su propio reparto'; }
    else { const rid = $('#g_rep', b).value || 'general'; rows = splitByCoef(us, num($('#g_tot', b).value), rid).map(r => ({ ...r, desglose: { [rid]: r.imp } })); cols = [rid]; $('#g_rep_h', b).textContent = ''; }
    const exentos = us.filter(u => !rows.some(r => r.u === u));
    $('#g_prev', b).innerHTML = !us.length ? '<p class="notice">Esta comunidad no tiene pisos dados de alta.</p>' : `${exentos.length ? `<p class="sub" style="margin:0">Exentos en este reparto: ${exentos.map(u => esc(u.ref)).join(', ')}</p>` : ''}<div class="prev"><table class="tbl"><thead><tr><th>Piso</th><th>Propietario/a</th>${cols.map(rid => `<th class="r">${esc(repartoNombre(k, rid))}</th>`).join('')}<th class="r">Importe</th></tr></thead><tbody>${rows.map(r => `<tr><td>${esc(r.u.ref)}</td><td>${esc(r.u.propietario)}</td>${cols.map(rid => `<td class="r">${r.desglose && r.desglose[rid] ? eur(r.desglose[rid]) : '—'}</td>`).join('')}<td class="r">${eur(r.imp)}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="${2 + cols.length}">${rows.length} recibos</td><td class="r">${eur(sum(rows.map(r => r.imp)))}</td></tr></tfoot></table></div>`;
  };
  const fill = () => {
    const k = com($('#g_cid', b).value), tipo = $('#g_tipo', b).value;
    $('#g_rep', b).innerHTML = k ? repartosDe(k).map(r => `<option value="${esc(r.id)}">${esc(r.nombre)}</option>`).join('') : '';
    if (k) { if (!touched.per) $('#g_per', b).value = suggestPeriod(k.periodicidad); const p = $('#g_per', b).value;
      if (!touched.con) $('#g_con', b).value = ({ ordinaria: 'Cuota ordinaria ', derrama: 'Derrama ', otro: '' })[tipo] + p;
      if (!touched.tot) $('#g_tot', b).value = tipo === 'ordinaria' ? String(r2(presupuestoDe(k) / (PPY[k.periodicidad] || 4))).replace('.', ',') : '';
      $('#g_hint', b).textContent = tipo === 'ordinaria' ? `Presupuesto ${eur(presupuestoDe(k))} ÷ ${PPY[k.periodicidad] || 4}` : 'Importe total aprobado en junta'; }
    preview();
  };
  $('#g_cid', b).addEventListener('change', fill);
  $('#g_tipo', b).addEventListener('change', () => { touched.tot = false; touched.con = false; fill(); });
  $('#g_rep', b).addEventListener('change', preview);
  $('#g_per', b).addEventListener('input', () => { touched.per = true; if (!touched.con) { const t = $('#g_tipo', b).value; $('#g_con', b).value = ({ ordinaria: 'Cuota ordinaria ', derrama: 'Derrama ', otro: '' })[t] + $('#g_per', b).value; } delete b.dataset.dupOk; });
  $('#g_con', b).addEventListener('input', () => { touched.con = true; delete b.dataset.dupOk; });
  $('#g_tot', b).addEventListener('input', () => { touched.tot = true; preview(); });
  fill();
}
ACTS.genRecibos = () => genRecibos2();

/* ================= otros ingresos ================= */
function vIngresos() {
  let is = S.ingresos.filter(inCid); const anios = yearsOf(is.map(i => i.fecha), [curYear()]);
  if (!ui.ingAnio) ui.ingAnio = curYear(); if (ui.ingAnio !== 'todos') is = is.filter(i => String(i.fecha).startsWith(ui.ingAnio));
  is.sort((a, b) => String(b.fecha).localeCompare(a.fecha)); const all = ui.cid === 'all';
  return `${head('Otros ingresos', 'Ingresos de la comunidad distintos de las cuotas: alquiler de la portería o de la azotea, intereses, subvenciones, indemnizaciones del seguro.', '<button class="btn pri" data-act="new" data-col="ingresos">Añadir ingreso</button>')}
  <div class="filters"><label class="sub" for="fIa">Año</label><select id="fIa" data-filter="ingAnio">${anios.map(a => `<option ${ui.ingAnio === a ? 'selected' : ''}>${a}</option>`).join('')}<option value="todos" ${ui.ingAnio === 'todos' ? 'selected' : ''}>Todos</option></select></div>
  <div class="tiles">${tile('Total', eur(sum(is.map(i => i.importe))), is.length + ' apuntes')}${tile('Retenciones soportadas', eur(sum(is.map(i => i.retencion))), 'para el modelo 184')}${tile('Pendiente de cobro', eur(sum(is.filter(i => i.cobrado === false).map(i => i.importe))))}</div>
  <div class="tw"><table class="tbl"><thead><tr><th>Fecha</th>${all ? '<th>Comunidad</th>' : ''}<th>Concepto</th><th>Tipo</th><th>Pagador</th><th class="r">Importe</th><th>Cobro</th><th></th></tr></thead><tbody>
  ${is.length ? is.map(i => `<tr><td class="nw">${esc(fd(i.fecha))}</td>${all ? `<td class="sub">${esc(comName(i.cid))}</td>` : ''}<td>${esc(i.concepto)}</td><td class="sub">${esc(i.categoria)}</td><td class="sub">${esc(i.pagador || '')}</td><td class="r">${eur(i.importe)}${num(i.retencion) ? `<div class="sub">ret. ${eur(i.retencion)}</div>` : ''}</td><td><button class="btn sm" data-act="ingCobrado" data-id="${esc(i.id)}">${i.cobrado === false ? '<span class="pill warn">Pendiente</span>' : '<span class="pill ok">Cobrado</span>'}</button></td><td class="ra"><button class="btn sm" data-act="edit" data-col="ingresos" data-id="${esc(i.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="ingresos" data-id="${esc(i.id)}" aria-label="Borrar ingreso">×</button></td></tr>`).join('') : `<tr><td colspan="8" class="empty">No hay ingresos en este periodo.</td></tr>`}
  </tbody></table></div>`;
}
ACTS.ingCobrado = async d => { const i = find('ingresos', d.id); if (i) try { await retry(() => store.update('ingresos', i.id, { cobrado: i.cobrado === false })); } catch (e) { toast(errMsg(e)); } };

/* ================= cuentas anuales ================= */
function calcCuentas(k, y) {
  const ini = `${y}-01-01`, fin = `${y}-12-31`; const desde = k.saldoFecha && k.saldoFecha > ini ? k.saldoFecha : ini;
  const enRango = (f, a, b) => f && f >= a && f <= b;
  const antes = f => f && (!k.saldoFecha || f >= k.saldoFecha) && f < desde;
  const rec = S.recibos.filter(r => r.cid === k.id), gas = S.gastos.filter(g => g.cid === k.id), ing = S.ingresos.filter(i => i.cid === k.id);
  const saldoIni = r2(num(k.saldoInicial) + sum(rec.filter(r => r.estado === 'cobrado' && antes(r.fechaCobro)).map(r => r.importe)) + sum(ing.filter(i => i.cobrado !== false && antes(i.fecha)).map(i => i.importe)) - sum(gas.filter(g => g.pagado && antes(g.fecha)).map(g => g.importe)));
  const cobOrd = sum(rec.filter(r => r.estado === 'cobrado' && enRango(r.fechaCobro, desde, fin) && r.tipo !== 'derrama').map(r => r.importe));
  const cobDer = sum(rec.filter(r => r.estado === 'cobrado' && enRango(r.fechaCobro, desde, fin) && r.tipo === 'derrama').map(r => r.importe));
  const otros = {}; ing.filter(i => i.cobrado !== false && enRango(i.fecha, desde, fin)).forEach(i => { otros[i.categoria || 'Otros'] = (otros[i.categoria || 'Otros'] || 0) + num(i.importe); });
  const pagos = sum(gas.filter(g => g.pagado && enRango(g.fecha, desde, fin)).map(g => g.importe));
  const saldoFin = r2(saldoIni + cobOrd + cobDer + sum(Object.values(otros)) - pagos);
  // Gastos del ejercicio por partida (por fecha de factura, pagados o no)
  const gy = gas.filter(g => enRango(g.fecha, ini, fin)); const ps = k.partidas || [];
  const partidaDe = g => ps.find(p => p.id === g.partidaId) || (!g.partidaId ? ps.find(p => p.categoria && p.categoria === g.categoria) : null);
  const porPartida = ps.map(p => ({ nombre: p.nombre, presupuesto: num(p.importe), real: sum(gy.filter(g => partidaDe(g) === p).map(g => g.importe)) }));
  const sinPartida = {}; gy.filter(g => !partidaDe(g)).forEach(g => { const c = g.categoria || 'Otros'; sinPartida[c] = (sinPartida[c] || 0) + num(g.importe); });
  const emitido = sum(rec.filter(r => enRango(r.emision, ini, fin)).map(r => r.importe));
  const deudaFin = unitsOf(k.id).map(u => ({ u, d: sum(rec.filter(r => r.uid === u.id && r.emision <= fin && (r.estado !== 'cobrado' || (r.fechaCobro && r.fechaCobro > fin))).map(r => r.importe)) })).filter(x => x.d > 0);
  const pendPago = sum(gas.filter(g => !g.pagado && g.fecha <= fin).map(g => g.importe));
  const cargosFondo = sum(gy.filter(g => g.fondoReserva).map(g => g.importe));
  return { y, desde, fin, saldoIni, cobOrd, cobDer, otros, pagos, saldoFin, porPartida, sinPartida, emitido, deudaFin, pendPago, cargosFondo, gastosTotal: sum(gy.map(g => g.importe)), fondoMin: r2(presupuestoDe(k) * num(k.fondoReservaPct) / 100) };
}
function vCuentas() {
  if (ui.cid === 'all' || !com(ui.cid)) return head('Cuentas anuales', 'Liquidación del ejercicio para presentar en la junta ordinaria.') + needCom('preparar sus cuentas');
  const k = com(ui.cid); const anios = yearsOf(S.recibos.filter(r => r.cid === k.id).map(r => r.emision).concat(S.gastos.filter(g => g.cid === k.id).map(g => g.fecha)), [curYear()]);
  if (!ui.ctaAnio || !anios.includes(ui.ctaAnio)) ui.ctaAnio = anios[0];
  const c = calcCuentas(k, ui.ctaAnio); const desv = (p, r) => p ? Math.round((r - p) / p * 100) : null;
  return `${head('Cuentas anuales', `${esc(k.nombre)} · ejercicio ${esc(c.y)}${c.desde !== c.y + '-01-01' ? ` (desde ${esc(fd(c.desde))}, fecha del saldo inicial)` : ''}.`, `<select id="fCa" data-filter="ctaAnio" aria-label="Ejercicio">${anios.map(a => `<option ${a === ui.ctaAnio ? 'selected' : ''}>${a}</option>`).join('')}</select><button class="btn" data-act="docEstadoProp">Estado por propietario</button><button class="btn pri" data-act="docCuentas">Documento para la junta</button>`)}
  <div class="tiles">${tile('Saldo inicial', eur(c.saldoIni), esc(fd(c.desde)))}${tile('Cobros', eur(c.cobOrd + c.cobDer + sum(Object.values(c.otros))), 'cuotas, derramas y otros')}${tile('Pagos', eur(c.pagos))}${tile('Saldo final', eur(c.saldoFin), esc(fd(c.fin)), c.saldoFin < 0 ? 'bad' : '')}${tile('Deuda de propietarios', eur(sum(c.deudaFin.map(x => x.d))), `a ${esc(fd(c.fin))}`, c.deudaFin.length ? 'warn' : '')}</div>
  <div class="cols"><div class="card"><h2>Gastos por partida</h2><div class="tw"><table class="tbl"><thead><tr><th>Partida</th><th class="r">Presupuesto</th><th class="r">Real</th><th class="r">Desviación</th></tr></thead><tbody>
    ${c.porPartida.map(p => { const d = desv(p.presupuesto, p.real); return `<tr><td>${esc(p.nombre)}</td><td class="r">${eur(p.presupuesto)}</td><td class="r">${eur(p.real)}</td><td class="r">${d === null ? '—' : `<span class="pill ${d > 10 ? 'bad' : d > 0 ? 'warn' : 'ok'}">${d > 0 ? '+' : ''}${d} %</span>`}</td></tr>`; }).join('')}
    ${Object.entries(c.sinPartida).map(([cat, v]) => `<tr><td>${esc(cat)} <span class="sub">(sin partida)</span></td><td class="r">—</td><td class="r">${eur(v)}</td><td class="r">—</td></tr>`).join('')}
    </tbody><tfoot><tr><td>Total</td><td class="r">${eur(presupuestoDe(k))}</td><td class="r">${eur(c.gastosTotal)}</td><td></td></tr></tfoot></table></div></div>
  <div class="stack"><div class="card"><h2>Tesorería</h2><dl class="kv">
    <dt>Saldo inicial</dt><dd>${eur(c.saldoIni)}</dd><dt>+ Cuotas ordinarias</dt><dd>${eur(c.cobOrd)}</dd><dt>+ Derramas</dt><dd>${eur(c.cobDer)}</dd>
    ${Object.entries(c.otros).map(([cat, v]) => `<dt>+ ${esc(cat)}</dt><dd>${eur(v)}</dd>`).join('')}<dt>− Pagos</dt><dd>${eur(c.pagos)}</dd><dt><b>Saldo final</b></dt><dd><b>${eur(c.saldoFin)}</b></dd></dl>
    <p class="sub" style="margin:0">Compáralo con el saldo del extracto bancario a ${esc(fd(c.fin))}. Si no coincide, revisa en Banco los movimientos sin conciliar.</p></div>
    <div class="card"><h2>Fondo de reserva</h2><dl class="kv"><dt>Mínimo legal</dt><dd>${eur(c.fondoMin)} (${esc(PCT.format(num(k.fondoReservaPct)))} %)</dd><dt>Gastos cargados al fondo</dt><dd>${eur(c.cargosFondo)}</dd></dl></div>
    <div class="card"><h2>Pendientes a ${esc(fd(c.fin))}</h2><dl class="kv"><dt>Cuotas emitidas en el año</dt><dd>${eur(c.emitido)}</dd><dt>Deuda de propietarios</dt><dd>${eur(sum(c.deudaFin.map(x => x.d)))}</dd><dt>Facturas sin pagar</dt><dd>${eur(c.pendPago)}</dd></dl></div></div></div>`;
}
function docCuentas(k, y) {
  const c = calcCuentas(k, y);
  return docPage(`Cuentas ${y} ${k.nombre}`, `${comHead(k)}<h1>LIQUIDACIÓN DEL EJERCICIO ${esc(y)}</h1>
  <p>Periodo: del ${esc(fd(c.desde))} al ${esc(fd(c.fin))}.</p>
  <h2>1. Estado de tesorería</h2><table><tr><td>Saldo inicial</td><td class="r">${eur(c.saldoIni)}</td></tr><tr><td>Cuotas ordinarias cobradas</td><td class="r">${eur(c.cobOrd)}</td></tr><tr><td>Derramas cobradas</td><td class="r">${eur(c.cobDer)}</td></tr>
  ${Object.entries(c.otros).map(([cat, v]) => `<tr><td>${esc(cat)}</td><td class="r">${eur(v)}</td></tr>`).join('')}<tr><td>Pagos realizados</td><td class="r">−${eur(c.pagos)}</td></tr><tr><td><b>Saldo final</b></td><td class="r"><b>${eur(c.saldoFin)}</b></td></tr></table>
  <h2>2. Gastos del ejercicio comparados con el presupuesto</h2><table><tr><th>Partida</th><th class="r">Presupuesto</th><th class="r">Real</th><th class="r">Diferencia</th></tr>
  ${c.porPartida.map(p => `<tr><td>${esc(p.nombre)}</td><td class="r">${eur(p.presupuesto)}</td><td class="r">${eur(p.real)}</td><td class="r">${eur(p.real - p.presupuesto)}</td></tr>`).join('')}
  ${Object.entries(c.sinPartida).map(([cat, v]) => `<tr><td>${esc(cat)}</td><td class="r">—</td><td class="r">${eur(v)}</td><td class="r">—</td></tr>`).join('')}
  <tr><td><b>Total</b></td><td class="r"><b>${eur(presupuestoDe(k))}</b></td><td class="r"><b>${eur(c.gastosTotal)}</b></td><td class="r"><b>${eur(c.gastosTotal - presupuestoDe(k))}</b></td></tr></table>
  <h2>3. Deudas de propietarios a ${esc(fd(c.fin))}</h2>${c.deudaFin.length ? `<table><tr><th>Piso</th><th>Propietario/a</th><th class="r">Deuda</th></tr>${c.deudaFin.map(x => `<tr><td>${esc(x.u.ref)}</td><td>${esc(x.u.propietario)}</td><td class="r">${eur(x.d)}</td></tr>`).join('')}</table>` : '<p>No hay deudas pendientes.</p>'}
  <h2>4. Fondo de reserva</h2><p>Importe mínimo legal: ${eur(c.fondoMin)}. Gastos cargados al fondo durante el ejercicio: ${eur(c.cargosFondo)}.</p>
  <p>Facturas pendientes de pago a ${esc(fd(c.fin))}: ${eur(c.pendPago)}.</p>
  <div class="firmas"><div>VºBº El/La Presidente/a<br>${esc(k.presidente || '')}</div><div>El Secretario-Administrador<br>${esc(adminName())}</div></div>`);
}
function docEstadoProp(k, y) {
  const ini = `${y}-01-01`, fin = `${y}-12-31`;
  const rows = unitsOf(k.id).map(u => { const rs = S.recibos.filter(r => r.uid === u.id && r.emision >= ini && r.emision <= fin);
    return { u, emitido: sum(rs.map(r => r.importe)), cobrado: sum(rs.filter(r => r.estado === 'cobrado').map(r => r.importe)), pendiente: sum(S.recibos.filter(r => r.uid === u.id && r.estado !== 'cobrado').map(r => r.importe)) }; });
  return docPage(`Estado por propietario ${y}`, `${comHead(k)}<h1>ESTADO DE CUENTAS POR PROPIETARIO · ${esc(y)}</h1>
  <table><tr><th>Piso</th><th>Propietario/a</th><th class="r">Coef. %</th><th class="r">Emitido ${esc(y)}</th><th class="r">Cobrado</th><th class="r">Pendiente hoy</th></tr>
  ${rows.map(x => `<tr><td>${esc(x.u.ref)}</td><td>${esc(x.u.propietario)}</td><td class="r">${esc(PCT.format(num(x.u.coef)))}</td><td class="r">${eur(x.emitido)}</td><td class="r">${eur(x.cobrado)}</td><td class="r">${eur(x.pendiente)}</td></tr>`).join('')}
  <tr><td colspan="3"><b>TOTAL</b></td><td class="r"><b>${eur(sum(rows.map(x => x.emitido)))}</b></td><td class="r"><b>${eur(sum(rows.map(x => x.cobrado)))}</b></td><td class="r"><b>${eur(sum(rows.map(x => x.pendiente)))}</b></td></tr></table>`);
}
Object.assign(ACTS, {
  docCuentas: () => { const k = com(ui.cid); if (k) openDoc(docCuentas(k, ui.ctaAnio), `cuentas_${ui.ctaAnio}_${slug(k.nombre)}.html`); },
  docEstadoProp: () => { const k = com(ui.cid); if (k) openDoc(docEstadoProp(k, ui.ctaAnio), `estado_propietarios_${ui.ctaAnio}_${slug(k.nombre)}.html`); }
});

/* ================= banco ================= */
function hashStr(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(36); }
function movId(cid, m) { return 'm' + hashStr([cid, m.fecha, m.importe.toFixed(2), m.concepto, m.documento || '', m.ref1 || '', m.ref2 || '', m.n || 0].join('|')); }
function comunidadPorCuenta(banco, oficina, cuenta) {
  return S.comunidades.find(k => { const i = ibanClean(k.iban); return i.length === 24 && i.slice(4, 8) === banco && i.slice(8, 12) === oficina && i.slice(14) === cuenta; });
}
// Propuestas de conciliación para un movimiento: [{tipo, ids, label, score}]
function sugerencias(m) {
  const out = [], imp = r2(num(m.importe)), abs = Math.abs(imp), near = (f, dias) => f && Math.abs(daysBetween(f, m.fecha)) <= dias;
  if (imp > 0) {
    const porRemesa = {}; S.recibos.filter(r => r.cid === m.cid && r.remesa).forEach(r => { (porRemesa[r.remesa] = porRemesa[r.remesa] || []).push(r); });
    for (const [id, rs] of Object.entries(porRemesa)) if (Math.abs(sum(rs.map(r => r.importe)) - imp) < 0.005 && rs.some(r => !r.fechaCobro || near(r.fechaCobro, 15))) out.push({ tipo: 'remesa', ids: rs.map(r => r.id), label: `Remesa ${id} (${rs.length} recibos)`, score: 1 });
    S.recibos.filter(r => r.cid === m.cid && r.estado !== 'cobrado' && Math.abs(num(r.importe) - imp) < 0.005).forEach(r => { const u = find('unidades', r.uid) || {};
      out.push({ tipo: 'recibo', ids: [r.id], label: `Recibo ${u.ref || ''} · ${u.propietario || ''} · ${r.periodo}`, score: 0.5 + parecido(m.concepto, u.propietario) / 2 }); });
    S.ingresos.filter(i => i.cid === m.cid && i.cobrado === false && Math.abs(num(i.importe) - imp) < 0.005).forEach(i => out.push({ tipo: 'ingreso', ids: [i.id], label: `Ingreso: ${i.concepto}`, score: 0.6 }));
  } else if (imp < 0) {
    S.gastos.filter(g => g.cid === m.cid && !g.pagado && Math.abs(num(g.importe) - abs) < 0.005).forEach(g => { const p = find('proveedores', g.provId) || {};
      out.push({ tipo: 'gasto', ids: [g.id], label: `Gasto: ${p.nombre ? p.nombre + ' · ' : ''}${g.concepto}`, score: 0.5 + parecido(m.concepto, p.nombre) / 2 }); });
    if (/DEVOL|RETROC|IMPAG|RECHAZ/i.test(m.concepto)) S.recibos.filter(r => r.cid === m.cid && r.estado === 'cobrado' && Math.abs(num(r.importe) - abs) < 0.005).forEach(r => { const u = find('unidades', r.uid) || {};
      out.push({ tipo: 'devolucion', ids: [r.id], label: `Devolución del recibo ${u.ref || ''} · ${u.propietario || ''} · ${r.periodo}`, score: 0.55 + parecido(m.concepto, u.propietario) / 2 }); });
  }
  return out.sort((a, b) => b.score - a.score);
}
async function aplicarConciliacion(m, s) {
  for (const id of s.ids) {
    // Una remesa se abona entera; las devoluciones llegan después como cargos aparte, así que no se tocan los recibos ya devueltos.
    if (s.tipo === 'remesa') { const r = find('recibos', id); if (r && r.estado === 'pendiente') await retry(() => store.update('recibos', id, { estado: 'cobrado', fechaCobro: m.fecha })); }
    if (s.tipo === 'recibo') { const r = find('recibos', id); if (r && r.estado !== 'cobrado') await retry(() => store.update('recibos', id, { estado: 'cobrado', fechaCobro: m.fecha })); }
    if (s.tipo === 'devolucion') await retry(() => store.update('recibos', id, { estado: 'devuelto', fechaCobro: '', motivoDevolucion: 'Devolución en extracto ' + fd(m.fecha) }));
    if (s.tipo === 'gasto') await retry(() => store.update('gastos', id, { pagado: true, fechaPago: m.fecha }));
    if (s.tipo === 'ingreso') await retry(() => store.update('ingresos', id, { cobrado: true }));
  }
  await retry(() => store.update('movimientos', m.id, { conciliado: { tipo: s.tipo, ids: s.ids, label: s.label } }));
}
function vBanco() {
  let ms = S.movimientos.filter(inCid); const all = ui.cid === 'all';
  if (!ui.bcoFiltro) ui.bcoFiltro = 'pendientes';
  const pend = ms.filter(m => !m.conciliado);
  if (ui.bcoFiltro === 'pendientes') ms = pend;
  ms.sort((a, b) => String(b.fecha).localeCompare(a.fecha) || (b.n || 0) - (a.n || 0));
  const shown = ms.slice(0, 400);
  return `${head('Banco', 'Importa el extracto de la cuenta de cada comunidad (Norma 43 o CSV) y las devoluciones de recibos. La aplicación propone con qué recibo, remesa o factura cuadra cada movimiento.', `<button class="btn" data-act="impDevol">Devoluciones SEPA</button><button class="btn" data-act="impCSV">Extracto CSV</button><button class="btn pri" data-act="impN43">Extracto Norma 43</button>`)}
  <div class="filters"><label class="sub" for="fBc">Mostrar</label><select id="fBc" data-filter="bcoFiltro"><option value="pendientes" ${ui.bcoFiltro === 'pendientes' ? 'selected' : ''}>Sin conciliar (${pend.length})</option><option value="todos" ${ui.bcoFiltro === 'todos' ? 'selected' : ''}>Todos</option></select>
  ${pend.length ? `<button class="btn" data-act="autoConciliar">Conciliar automáticamente las coincidencias claras</button>` : ''}</div>
  <div class="tw"><table class="tbl"><thead><tr><th>Fecha</th>${all ? '<th>Comunidad</th>' : ''}<th>Concepto</th><th class="r">Importe</th><th>Conciliación</th><th></th></tr></thead><tbody>
  ${shown.length ? shown.map(m => { const sg = m.conciliado ? [] : sugerencias(m);
    return `<tr><td class="nw">${esc(fd(m.fecha))}</td>${all ? `<td class="sub">${esc(comName(m.cid))}</td>` : ''}<td>${esc(m.concepto || '—')}</td><td class="r">${signo(num(m.importe))}</td>
      <td>${m.conciliado ? `<span class="pill ok">${esc(m.conciliado.label || m.conciliado.tipo)}</span>` : sg.length ? `<span class="sub">¿${esc(sg[0].label)}?</span>` : '<span class="pill mut">Sin propuesta</span>'}</td>
      <td class="ra">${m.conciliado ? `<button class="btn sm" data-act="desconciliar" data-id="${esc(m.id)}">Deshacer</button>` : `${sg.length ? `<button class="btn sm pri" data-act="conciliar" data-id="${esc(m.id)}" data-i="0">Aceptar</button> ` : ''}<button class="btn sm" data-act="conciliarManual" data-id="${esc(m.id)}">Elegir…</button>`} <button class="btn sm danger" data-act="del" data-col="movimientos" data-id="${esc(m.id)}" aria-label="Borrar movimiento">×</button></td></tr>`; }).join('') : `<tr><td colspan="6" class="empty">${S.movimientos.filter(inCid).length ? 'Todo conciliado.' : 'Todavía no has importado movimientos. Descarga el extracto en formato Norma 43 (cuaderno 43) desde la banca online de la comunidad.'}</td></tr>`}
  </tbody></table></div>${ms.length > shown.length ? `<p class="sub">Se muestran los ${shown.length} más recientes.</p>` : ''}`;
}
async function guardarMovimientos(cid, movs, setErr) {
  let nuevos = 0, i = 0;
  for (const m of movs) { i++; const id = movId(cid, m); if (find('movimientos', id)) continue; nuevos++;
    if (setErr) setErr(`Guardando ${i} de ${movs.length}…`, true);
    await retry(() => store.set('movimientos', id, { cid, fecha: m.fecha, importe: r2(m.importe), concepto: m.concepto || '', documento: m.documento || '', ref1: m.ref1 || '', ref2: m.ref2 || '', n: m.n || 0, origen: m.origen, conciliado: null })); }
  return nuevos;
}
Object.assign(ACTS, {
  impN43: () => {
    let cuentas = [];
    const m = modal('Importar extracto Norma 43', `<div class="fg"><label class="full" for="n_f">Archivo del banco (Norma 43, cuaderno 43, .txt / .n43 / .aeb)<input id="n_f" type="file" accept=".txt,.n43,.aeb,.csb,.q43,text/plain"></label></div><div id="n_prev"></div>`,
      [{ l: 'Cancelar' }, { l: 'Importar', pri: 1, fn: async (b, setErr) => {
        if (!cuentas.length) return setErr('Elige un archivo.'), false; let tot = 0;
        for (const [i, c] of cuentas.entries()) { const cid = $('#n_c' + i, b).value; if (!cid) continue; tot += await guardarMovimientos(cid, c.movimientos.map((x, n) => ({ ...x, n, origen: 'n43' })), setErr); }
        toast(`${tot} movimientos nuevos importados`); location.hash = '#banco'; render(); } }], { wide: 1 });
    $('#n_f', m.body).addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return;
      const buf = await f.arrayBuffer(); let txt = new TextDecoder('utf-8', { fatal: false }).decode(buf); if (txt.includes('�')) txt = new TextDecoder('latin1').decode(buf);
      cuentas = parseNorma43(txt);
      if (!cuentas.length) { m.setErr('No parece un fichero Norma 43: no hay registro de cabecera de cuenta (11).'); return; } m.setErr('');
      $('#n_prev', m.body).innerHTML = cuentas.map((c, i) => { const k = comunidadPorCuenta(c.banco, c.oficina, c.cuenta) || (ui.cid !== 'all' ? com(ui.cid) : null);
        return `<div class="card"><b>Cuenta ${esc(c.banco)} ${esc(c.oficina)} ** ${esc(c.cuenta)}</b> <span class="sub">${esc(c.titular)} · del ${esc(fd(c.desde))} al ${esc(fd(c.hasta))} · ${c.movimientos.length} movimientos · saldo inicial ${eur(c.saldoInicial)}${c.saldoFinal != null ? ', final ' + eur(c.saldoFinal) : ''}</span>
          <label class="sub" for="n_c${i}" style="display:flex;gap:8px;align-items:center">Comunidad<select id="n_c${i}" style="width:auto">${comOpts(k ? k.id : '')}</select></label></div>`; }).join(''); });
  },
  impCSV: () => {
    let rows = [];
    const m = modal('Importar extracto en CSV', `<div class="fg"><label for="c_cid">Comunidad *<select id="c_cid">${comOpts(ui.cid !== 'all' ? ui.cid : '')}</select></label><label for="c_f">Archivo CSV exportado del banco<input id="c_f" type="file" accept=".csv,.txt,text/csv"></label></div><div id="c_map"></div>`,
      [{ l: 'Cancelar' }, { l: 'Importar', pri: 1, fn: async (b, setErr) => {
        const cid = $('#c_cid', b).value; if (!cid) return setErr('Elige la comunidad.'), false; if (!rows.length) return setErr('Elige el archivo.'), false;
        const h = +$('#c_h', b).value, cf = +$('#c_fe', b).value, cc = +$('#c_co', b).value, ci = +$('#c_im', b).value, cg = +$('#c_ca', b).value, ca = +$('#c_ab', b).value;
        const fecha = s => { s = String(s || '').trim(); let m2 = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/); if (m2) { const y = m2[3].length === 2 ? '20' + m2[3] : m2[3]; return `${y}-${pad(m2[2])}-${pad(m2[1])}`; } m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/); return m2 ? m2[0] : ''; };
        const movs = rows.slice(h + 1).map((r, n) => { let imp = ci >= 0 ? num(r[ci]) : (num(r[ca]) - Math.abs(num(r[cg]))); return { fecha: fecha(r[cf]), concepto: String(r[cc] || '').trim(), importe: imp, n, origen: 'csv' }; }).filter(x => x.fecha && x.importe);
        if (!movs.length) return setErr('No se han reconocido movimientos: revisa qué columna es cada cosa.'), false;
        const n = await guardarMovimientos(cid, movs, setErr); toast(`${n} movimientos nuevos importados`); location.hash = '#banco'; render(); } }], { wide: 1 });
    $('#c_f', m.body).addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return;
      const buf = await f.arrayBuffer(); let txt = new TextDecoder('utf-8').decode(buf); if (txt.includes('�')) txt = new TextDecoder('latin1').decode(buf);
      rows = parseCSV(txt); const hi = Math.max(0, rows.findIndex(r => r.some(c => /fecha/i.test(c)))); const H = rows[hi] || [];
      const guess = re => H.findIndex(c => re.test(norm(c)));
      const opts = (sel, none) => `${none ? '<option value="-1">— Ninguna —</option>' : ''}${H.map((c, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${esc(c || 'Columna ' + (i + 1))}</option>`).join('')}`;
      const fe = guess(/^FECHA( OPERACION| CONTABLE)?$/) >= 0 ? guess(/^FECHA( OPERACION| CONTABLE)?$/) : guess(/FECHA/), co = guess(/CONCEPTO|DESCRIPCION|MOVIMIENTO|DETALLE/), im = guess(/^IMPORTE|CANTIDAD/), ca = guess(/^CARGO|DEBE/), ab = guess(/^ABONO|HABER/);
      $('#c_map', m.body).innerHTML = `<div class="fg"><label for="c_h">Fila de títulos<select id="c_h">${rows.slice(0, 15).map((r, i) => `<option value="${i}" ${i === hi ? 'selected' : ''}>${i + 1}: ${esc(r.join(' | ').slice(0, 60))}</option>`).join('')}</select></label>
        <label for="c_fe">Fecha<select id="c_fe">${opts(fe)}</select></label><label for="c_co">Concepto<select id="c_co">${opts(co)}</select></label>
        <label for="c_im">Importe (con signo)<select id="c_im">${opts(im, 1)}</select></label><label for="c_ca">o columna de cargos<select id="c_ca">${opts(ca, 1)}</select></label><label for="c_ab">y columna de abonos<select id="c_ab">${opts(ab, 1)}</select></label></div>
        <p class="sub" style="margin:0">${rows.length - hi - 1} filas de datos. Si el banco usa una sola columna de importe, elige solo esa.</p>`; });
  },
  impDevol: () => {
    let res = [];
    const m = modal('Importar devoluciones de recibos (SEPA)', `<div class="fg"><label class="full" for="d_f">Fichero de devoluciones del banco (XML pain.002)<input id="d_f" type="file" accept=".xml,text/xml,application/xml"></label></div><div id="d_prev"></div><p class="sub" style="margin:0">Se buscan los recibos por la referencia con la que salieron en la remesa. Los encontrados pasan a «Devuelto» con el motivo.</p>`,
      [{ l: 'Cancelar' }, { l: 'Marcar como devueltos', pri: 1, fn: async (b, setErr) => {
        const ok = res.filter(x => x.r && x.estado === 'RJCT'); if (!ok.length) return setErr('No hay recibos que marcar.'), false; let i = 0;
        for (const x of ok) { i++; setErr(`Marcando ${i} de ${ok.length}…`, true); await retry(() => store.update('recibos', x.r.id, { estado: 'devuelto', fechaCobro: '', motivoDevolucion: `${x.motivo} ${x.motivoTexto}`.trim() })); }
        toast(`${ok.length} recibos marcados como devueltos`); } }], { wide: 1 });
    $('#d_f', m.body).addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return;
      try { res = parsePain002(await f.text()); } catch (err) { m.setErr('No se ha podido leer el XML.'); return; }
      if (!res.length) { m.setErr('El fichero no contiene operaciones (TxInfAndSts).'); return; } m.setErr('');
      res.forEach(x => { x.r = S.recibos.find(r => r.e2e === x.e2e || e2eRecibo(r.id) === x.e2e); });
      $('#d_prev', m.body).innerHTML = `<div class="prev"><table class="tbl"><thead><tr><th>Referencia</th><th>Recibo</th><th>Motivo</th></tr></thead><tbody>${res.map(x => { const u = x.r && find('unidades', x.r.uid);
        return `<tr><td class="sub">${esc(x.e2e)}</td><td>${x.r ? esc(`${comName(x.r.cid)} · ${u ? u.ref + ' ' + u.propietario : ''} · ${x.r.periodo} · ${eur(x.r.importe)}`) : '<span class="pill mut">No encontrado</span>'}</td><td>${x.estado === 'RJCT' ? `<span class="pill bad">${esc(x.motivo)} ${esc(x.motivoTexto)}</span>` : esc(x.estado)}</td></tr>`; }).join('')}</tbody></table></div>`; });
  },
  conciliar: async d => { const mv = find('movimientos', d.id); if (!mv) return; const s = sugerencias(mv)[+d.i || 0]; if (!s) return; try { await aplicarConciliacion(mv, s); toast('Conciliado'); } catch (e) { toast(errMsg(e)); } },
  desconciliar: async d => { try { await retry(() => store.update('movimientos', d.id, { conciliado: null })); toast('Conciliación deshecha (los recibos y gastos conservan su estado)'); } catch (e) { toast(errMsg(e)); } },
  autoConciliar: async () => {
    const ms = S.movimientos.filter(inCid).filter(m => !m.conciliado); const usados = new Set(); let n = 0;
    try { for (const m of ms) { const sg = sugerencias(m).filter(s => !s.ids.some(id => usados.has(id)));
        const best = sg[0]; if (!best || best.score < 0.75 || (sg[1] && sg[1].score === best.score)) continue;
        best.ids.forEach(id => usados.add(id)); await aplicarConciliacion(m, best); n++; }
      toast(n ? `${n} movimientos conciliados. Revisa el resto a mano.` : 'No hay coincidencias claras: concilia a mano con «Elegir…».'); } catch (e) { toast(errMsg(e)); }
  },
  conciliarManual: d => {
    const mv = find('movimientos', d.id); if (!mv) return; const imp = num(mv.importe), sg = sugerencias(mv);
    const recibos = S.recibos.filter(r => r.cid === mv.cid && (imp > 0 ? r.estado !== 'cobrado' : r.estado === 'cobrado')).sort((a, b) => String(b.periodo).localeCompare(a.periodo)).slice(0, 300);
    const gastos = S.gastos.filter(g => g.cid === mv.cid && !g.pagado);
    const opciones = [...sg.map((s, i) => ({ v: 's' + i, l: '★ ' + s.label })),
      ...(imp > 0 ? recibos.map(r => { const u = find('unidades', r.uid) || {}; return { v: 'r' + r.id, l: `Recibo ${u.ref || ''} · ${u.propietario || ''} · ${r.periodo} · ${eur(r.importe)}` }; }) : []),
      ...(imp < 0 ? gastos.map(g => ({ v: 'g' + g.id, l: `Gasto ${fd(g.fecha)} · ${g.concepto} · ${eur(g.importe)}` })) : []),
      ...(imp < 0 ? recibos.map(r => { const u = find('unidades', r.uid) || {}; return { v: 'd' + r.id, l: `Devolución: ${u.ref || ''} · ${u.propietario || ''} · ${r.periodo} · ${eur(r.importe)}` }; }) : [])];
    modal('Conciliar movimiento', `<p style="margin:0"><b>${esc(fd(mv.fecha))}</b> · ${esc(mv.concepto || '')} · ${signo(imp)}</p>
      <div class="fg"><label class="full" for="cm_s">Corresponde a<select id="cm_s"><option value="">— Elige —</option>${opciones.map(o => `<option value="${esc(o.v)}">${esc(o.l)}</option>`).join('')}<option value="nuevo">${imp < 0 ? 'Registrar como gasto nuevo (comisión, recibo de luz…)' : 'Registrar como ingreso nuevo'}</option><option value="nada">Marcar como revisado, sin apunte</option></select></label>
      <label for="cm_cat">Categoría (si es nuevo)<select id="cm_cat">${(imp < 0 ? CATS : CATS_INGRESO).map(c => `<option ${c === (imp < 0 ? 'Bancarios' : 'Otros') ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select></label></div>`,
      [{ l: 'Cancelar' }, { l: 'Conciliar', pri: 1, fn: async (b, setErr) => {
        const v = $('#cm_s', b).value; if (!v) return setErr('Elige con qué se corresponde.'), false;
        let s;
        if (v[0] === 's' && sg[+v.slice(1)]) s = sg[+v.slice(1)];
        else if (v[0] === 'r') { const r = find('recibos', v.slice(1)), u = find('unidades', r.uid) || {}; s = { tipo: 'recibo', ids: [r.id], label: `Recibo ${u.ref || ''} · ${r.periodo}` }; }
        else if (v[0] === 'g') { const g = find('gastos', v.slice(1)); s = { tipo: 'gasto', ids: [g.id], label: `Gasto: ${g.concepto}` }; }
        else if (v[0] === 'd') { const r = find('recibos', v.slice(1)), u = find('unidades', r.uid) || {}; s = { tipo: 'devolucion', ids: [r.id], label: `Devolución ${u.ref || ''} · ${r.periodo}` }; }
        else if (v === 'nuevo') { const cat = $('#cm_cat', b).value;
          if (imp < 0) { const id = await retry(() => store.add('gastos', { cid: mv.cid, fecha: mv.fecha, provId: '', categoria: cat, partidaId: '', concepto: mv.concepto || cat, importe: Math.abs(imp), pagado: true, fondoReserva: false, notas: 'Creado desde el extracto', creado: new Date().toISOString() })); s = { tipo: 'gasto', ids: [], label: `Gasto nuevo: ${cat}` }; void id; }
          else { await retry(() => store.add('ingresos', { cid: mv.cid, fecha: mv.fecha, categoria: cat, concepto: mv.concepto || cat, importe: imp, cobrado: true, creado: new Date().toISOString() })); s = { tipo: 'ingreso', ids: [], label: `Ingreso nuevo: ${cat}` }; } }
        else if (v === 'nada') s = { tipo: 'revisado', ids: [], label: 'Revisado, sin apunte' };
        await aplicarConciliacion(mv, s); toast('Conciliado'); } }], { wide: 1 });
  }
});

/* ================= honorarios del despacho ================= */
function despachoProveedor() { const nif = String(S.config.nif || '').toUpperCase(); return S.proveedores.find(p => nif && String(p.cif || '').toUpperCase() === nif); }
function vHonorarios() {
  let fs = S.facturas.filter(inCid); const anios = yearsOf(fs.map(f => f.fecha), [curYear()]);
  if (!ui.honAnio) ui.honAnio = curYear(); fs = fs.filter(f => String(f.fecha).startsWith(ui.honAnio));
  fs.sort((a, b) => String(b.numero).localeCompare(String(a.numero), 'es', { numeric: true }));
  const t = Math.ceil((new Date().getMonth() + 1) / 3), trim = f => Math.ceil(Number(String(f.fecha).slice(5, 7)) / 3);
  const fsT = fs.filter(f => trim(f) === t && ui.honAnio === curYear());
  const falta = !S.config.nombre || !S.config.nif;
  return `${head('Honorarios', 'Facturas de tu despacho a cada comunidad. Al emitirlas se registra el gasto en la comunidad con su retención, para el modelo 111.', `<button class="btn pri" data-act="emitirFacturas" ${falta ? 'disabled' : ''}>Emitir facturas</button>`)}
  ${falta ? '<div class="notice">Completa el nombre y el NIF del despacho en <a href="#ajustes">Ajustes</a> para poder facturar.</div>' : ''}
  <div class="filters"><label class="sub" for="fHa">Año</label><select id="fHa" data-filter="honAnio">${anios.map(a => `<option ${ui.honAnio === a ? 'selected' : ''}>${a}</option>`).join('')}</select></div>
  <div class="tiles">${tile('Facturado (base)', eur(sum(fs.map(f => f.base))), fs.length + ' facturas')}${tile('Pendiente de cobro', eur(sum(fs.filter(f => !f.cobrada).map(f => f.total))), '', fs.some(f => !f.cobrada) ? 'warn' : '')}${tile(`IVA repercutido T${t}`, eur(sum(fsT.map(f => f.iva))), 'para tu modelo 303')}${tile(`Retenciones T${t}`, eur(sum(fsT.map(f => f.retencion))), 'a cuenta de tu IRPF')}</div>
  <div class="tw"><table class="tbl"><thead><tr><th>Número</th><th>Fecha</th><th>Comunidad</th><th>Concepto</th><th class="r">Base</th><th class="r">IVA</th><th class="r">Retención</th><th class="r">A cobrar</th><th>Estado</th><th></th></tr></thead><tbody>
  ${fs.length ? fs.map(f => `<tr><td class="nw"><b>${esc(f.numero)}</b></td><td class="nw">${esc(fd(f.fecha))}</td><td>${esc(comName(f.cid))}</td><td class="sub">${esc(f.concepto)}</td><td class="r">${eur(f.base)}</td><td class="r">${eur(f.iva)}</td><td class="r">${num(f.retencion) ? '−' + eur(f.retencion) : '—'}</td><td class="r"><b>${eur(f.total)}</b></td><td><button class="btn sm" data-act="facCobrada" data-id="${esc(f.id)}">${f.cobrada ? '<span class="pill ok">Cobrada</span>' : '<span class="pill warn">Pendiente</span>'}</button></td><td class="ra"><button class="btn sm" data-act="verFactura" data-id="${esc(f.id)}">Ver</button> <button class="btn sm" data-act="edit" data-col="facturas" data-id="${esc(f.id)}">Editar</button> <button class="btn sm danger" data-act="del" data-col="facturas" data-id="${esc(f.id)}" aria-label="Borrar factura">×</button></td></tr>`).join('') : `<tr><td colspan="10" class="empty">No hay facturas en ${esc(ui.honAnio)}.</td></tr>`}
  </tbody></table></div>`;
}
function siguienteNumero(serie, y) {
  const re = new RegExp('^' + serie.replace(/[^A-Za-z0-9]/g, '') + y + '/(\\d+)$');
  const max = S.facturas.reduce((a, f) => { const m = String(f.numero).match(re); return m ? Math.max(a, +m[1]) : a; }, 0);
  return n => `${serie.replace(/[^A-Za-z0-9]/g, '')}${y}/${String(max + n).padStart(3, '0')}`;
}
function docFactura(f) {
  const k = com(f.cid) || {}, c = S.config;
  return docPage('Factura ' + f.numero, `<table style="border:0"><tr><td style="border:0;vertical-align:top"><b>${esc(c.nombre || '')}</b><br>NIF ${esc(c.nif || '')}${c.colegiado ? '<br>Colegiado nº ' + esc(c.colegiado) : ''}<br>${esc(c.direccion || '')}<br>${esc([c.telefono, c.email].filter(Boolean).join(' · '))}</td>
    <td style="border:0;text-align:right;vertical-align:top"><h1 style="margin:0;text-align:right">FACTURA</h1>Nº <b>${esc(f.numero)}</b><br>Fecha: ${esc(fd(f.fecha))}</td></tr></table>
  <h2>Cliente</h2><p>${esc(k.nombre || '')}<br>CIF ${esc(k.cif || '')}<br>${esc([k.direccion, k.cp, k.ciudad].filter(Boolean).join(', '))}</p>
  <table><tr><th>Concepto</th><th class="r">Importe</th></tr><tr><td>${esc(f.concepto)}</td><td class="r">${eur(f.base)}</td></tr>
  <tr><td class="r">Base imponible</td><td class="r">${eur(f.base)}</td></tr><tr><td class="r">IVA ${esc(PCT.format(num(f.ivaPct)))} %</td><td class="r">${eur(f.iva)}</td></tr>
  ${num(f.retencion) ? `<tr><td class="r">Retención IRPF ${esc(PCT.format(num(f.retPct)))} %</td><td class="r">−${eur(f.retencion)}</td></tr>` : ''}<tr><td class="r"><b>TOTAL A PAGAR</b></td><td class="r"><b>${eur(f.total)}</b></td></tr></table>
  ${c.iban ? `<p>Forma de pago: transferencia a ${esc(ibanFmt(c.iban))}.</p>` : ''}
  ${num(f.retencion) ? '<p class="nota">La comunidad debe ingresar la retención en Hacienda (modelo 111) y declararla en el resumen anual (modelo 190).</p>' : ''}`);
}
Object.assign(ACTS, {
  verFactura: d => { const f = find('facturas', d.id); if (f) openDoc(docFactura(f), `factura_${slug(f.numero)}.html`); },
  facCobrada: async d => { const f = find('facturas', d.id); if (f) try { await retry(() => store.update('facturas', f.id, { cobrada: !f.cobrada, fechaCobro: f.cobrada ? '' : today() })); } catch (e) { toast(errMsg(e)); } },
  emitirFacturas: () => {
    const c = S.config, ivaPct = c.ivaPct != null ? num(c.ivaPct) : 21, retPct = c.retencionPct != null ? num(c.retencionPct) : 15;
    const now = new Date(), mes = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const coms = sortedComs().filter(k => ui.cid === 'all' || k.id === ui.cid);
    const m = modal('Emitir facturas de honorarios', `<div class="fg">
      <label for="h_per">Concepto<input id="h_per" type="text" value="Honorarios de administración, ${esc(mes)}"></label>
      <label for="h_mes">Meses que se facturan<select id="h_mes"><option value="1">1 (mensual)</option><option value="3">3 (trimestral)</option><option value="12">12 (anual)</option></select></label>
      <label for="h_fec">Fecha de las facturas<input id="h_fec" type="date" value="${today()}"></label>
      <label class="chk" for="h_gasto"><input type="checkbox" id="h_gasto" checked> Registrar el gasto en cada comunidad</label></div>
      <p class="sub" style="margin:0">IVA ${esc(PCT.format(ivaPct))} % · retención ${esc(PCT.format(retPct))} % (cámbialo en Ajustes → Datos del despacho).</p><div id="h_list"></div>`,
      [{ l: 'Cancelar' }, { l: 'Emitir', pri: 1, fn: async (b, setErr) => {
        const sel = coms.filter(k => $('#h_c_' + k.id, b) && $('#h_c_' + k.id, b).checked); if (!sel.length) return setErr('Marca al menos una comunidad.'), false;
        const y = $('#h_fec', b).value.slice(0, 4), numero = siguienteNumero(c.serieFactura || 'A', y), fecha = $('#h_fec', b).value, concepto = $('#h_per', b).value.trim();
        let prov = despachoProveedor();
        if ($('#h_gasto', b).checked && !prov) { const id = await retry(() => store.add('proveedores', { nombre: c.nombre, cif: c.nif, servicio: 'Administración de fincas', telefono: c.telefono || '', email: c.email || '', iban: c.iban || '', notas: 'Tu despacho' })); prov = { id }; }
        let i = 0;
        for (const k of sel) { i++; setErr(`Emitiendo ${i} de ${sel.length}…`, true);
          const base = num($('#h_b_' + k.id, b).value), iva = r2(base * ivaPct / 100), ret = r2(base * retPct / 100);
          const f = { cid: k.id, numero: numero(i), fecha, concepto, base, ivaPct, iva, retPct, retencion: ret, total: r2(base + iva - ret), cobrada: false, fechaCobro: '', creado: new Date().toISOString() };
          if ($('#h_gasto', b).checked) f.gastoId = await retry(() => store.add('gastos', { cid: k.id, fecha, provId: prov.id, categoria: 'Administración', partidaId: '', concepto: `${concepto} (factura ${f.numero})`, baseImponible: base, retencion: ret, importe: r2(base + iva), pagado: false, fondoReserva: false, notas: '', creado: new Date().toISOString() }));
          await retry(() => store.add('facturas', f)); }
        toast(`${sel.length} facturas emitidas`); location.hash = '#honorarios'; render(); } }], { wide: 1 });
    const draw = () => { const meses = +$('#h_mes', m.body).value;
      $('#h_list', m.body).innerHTML = `<div class="prev"><table class="tbl"><thead><tr><th></th><th>Comunidad</th><th class="r">Base</th></tr></thead><tbody>${coms.map(k => `<tr><td><input type="checkbox" id="h_c_${esc(k.id)}" ${num(k.honorariosMes) > 0 ? 'checked' : ''} aria-label="Facturar a ${esc(k.nombre)}"></td><td>${esc(k.nombre)}${k.cif ? '' : ' <span class="pill warn">sin CIF</span>'}</td><td class="r"><input id="h_b_${esc(k.id)}" type="text" inputmode="decimal" value="${esc(String(r2(num(k.honorariosMes) * meses)).replace('.', ','))}" style="width:110px;text-align:right" aria-label="Base de ${esc(k.nombre)}"></td></tr>`).join('')}</tbody></table></div>`; };
    $('#h_mes', m.body).addEventListener('change', draw); draw();
  }
});

/* ================= impuestos ================= */
function vImpuestos() {
  const anios = yearsOf(S.gastos.map(g => g.fecha).concat(S.ingresos.map(i => i.fecha)), [curYear()]);
  if (!ui.impAnio) ui.impAnio = curYear(); const y = ui.impAnio;
  const coms = sortedComs().filter(k => ui.cid === 'all' || k.id === ui.cid);
  const ret = S.gastos.filter(g => inCid(g) && num(g.retencion) > 0 && String(g.fecha).startsWith(y));
  const trimestres = [1, 2, 3, 4].map(t => { const gs = ret.filter(g => Math.ceil(Number(String(g.fecha).slice(5, 7)) / 3) === t); return { t, perceptores: new Set(gs.map(g => g.provId || g.concepto)).size, base: sum(gs.map(g => num(g.baseImponible) || 0)), ret: sum(gs.map(g => g.retencion)) }; });
  const alq = coms.map(k => { const is = S.ingresos.filter(i => i.cid === k.id && i.categoria === 'Alquileres' && String(i.fecha).startsWith(y)); return { k, ingresos: sum(is.map(i => i.importe)), ret: sum(is.map(i => i.retencion)) }; }).filter(x => x.ingresos > 0);
  return `${head('Impuestos', 'Ayudas para los modelos que presentan las comunidades. Revisa siempre las cifras con tu asesor antes de presentarlos.', `<select id="fIm" data-filter="impAnio" aria-label="Ejercicio">${anios.map(a => `<option ${a === y ? 'selected' : ''}>${a}</option>`).join('')}</select>`)}
  <div class="card"><div class="vh"><h2>Modelos 111 y 190 · retenciones a profesionales</h2><button class="btn sm" data-act="csv190">Exportar detalle (190)</button></div>
    <p class="sub" style="margin:0">Retenciones de IRPF que las comunidades practican a profesionales (tu despacho, abogados, arquitectos…). Se ingresan cada trimestre con el 111 y se resumen en enero con el 190.</p>
    <div class="tw"><table class="tbl"><thead><tr><th>Trimestre</th><th class="r">Perceptores</th><th class="r">Base</th><th class="r">Retenciones (111)</th></tr></thead><tbody>${trimestres.map(t => `<tr><td>${t.t}T ${esc(y)}</td><td class="r">${t.perceptores}</td><td class="r">${eur(t.base)}</td><td class="r">${eur(t.ret)}</td></tr>`).join('')}</tbody><tfoot><tr><td>Año (190)</td><td></td><td class="r">${eur(sum(trimestres.map(t => t.base)))}</td><td class="r">${eur(sum(trimestres.map(t => t.ret)))}</td></tr></tfoot></table></div>
    ${ui.cid === 'all' ? '<p class="sub" style="margin:0">Cada comunidad presenta sus propios modelos: elige una comunidad arriba para ver solo las suyas.</p>' : ''}</div>
  <div class="card"><div class="vh"><h2>Modelo 184 · rentas de la comunidad</h2>${alq.length ? '<button class="btn sm" data-act="csv184">Exportar reparto por comunero</button>' : ''}</div>
    <p class="sub" style="margin:0">Si la comunidad obtiene rentas (por ejemplo, alquila la portería o la azotea), presenta el 184 e imputa a cada propietario su parte según el coeficiente.</p>
    ${alq.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Comunidad</th><th class="r">Ingresos por alquiler</th><th class="r">Retenciones soportadas</th></tr></thead><tbody>${alq.map(x => `<tr><td>${esc(x.k.nombre)}</td><td class="r">${eur(x.ingresos)}</td><td class="r">${eur(x.ret)}</td></tr>`).join('')}</tbody></table></div><p class="sub" style="margin:0">Los gastos deducibles del alquiler (IBI, reparaciones del piso, seguro…) se añaden al preparar el modelo.</p>` : `<p class="sub" style="margin:0">No hay ingresos por alquiler en ${esc(y)}${ui.cid === 'all' ? '' : ' en esta comunidad'}.</p>`}</div>
  <div class="card"><div class="vh"><h2>Modelo 347 · operaciones con terceros</h2><button class="btn sm" data-act="m347">Abrir informe</button></div>
    <p class="sub" style="margin:0">Proveedores con los que cada comunidad supera 3.005,06 € en el año.</p></div>`;
}
Object.assign(ACTS, {
  csv190: () => { const y = ui.impAnio; const acc = {};
    S.gastos.filter(g => inCid(g) && num(g.retencion) > 0 && String(g.fecha).startsWith(y)).forEach(g => { const key = g.cid + '|' + (g.provId || g.concepto); const a = acc[key] = acc[key] || { cid: g.cid, p: find('proveedores', g.provId), base: 0, ret: 0 }; a.base += num(g.baseImponible); a.ret += num(g.retencion); });
    const c = toCSV(['comunidad', 'cif comunidad', 'perceptor', 'nif perceptor', 'base', 'retencion'], Object.values(acc).map(a => [comName(a.cid), (com(a.cid) || {}).cif, a.p ? a.p.nombre : '', a.p ? a.p.cif : '', r2(a.base), r2(a.ret)]));
    saveFile(`modelo190_${y}.csv`, c); },
  csv184: () => { const y = ui.impAnio; const rows = [];
    sortedComs().filter(k => ui.cid === 'all' || k.id === ui.cid).forEach(k => { const is = S.ingresos.filter(i => i.cid === k.id && i.categoria === 'Alquileres' && String(i.fecha).startsWith(y)); const ing = sum(is.map(i => i.importe)), ret = sum(is.map(i => i.retencion)); if (!ing) return;
      const us = unitsOf(k.id), sc = us.reduce((a, u) => a + num(u.coef), 0) || 100;
      us.forEach(u => rows.push([k.nombre, k.cif, u.ref, u.propietario, u.nif, PCT.format(num(u.coef)), r2(ing * num(u.coef) / sc), r2(ret * num(u.coef) / sc)])); });
    const c = toCSV(['comunidad', 'cif comunidad', 'piso', 'comunero', 'nif', 'coeficiente %', 'ingresos imputados', 'retenciones imputadas'], rows); saveFile(`modelo184_${y}.csv`, c); }
});

Object.assign(VIEW_FN, { presupuesto: vPresupuesto, ingresos: vIngresos, banco: vBanco, cuentas: vCuentas, honorarios: vHonorarios, impuestos: vImpuestos });
