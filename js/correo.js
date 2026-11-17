/*
 * Gestor de Comunidades — correo y historial de comunicaciones.
 *   - Bandeja de emails recibidos de propietarios (llegan por supabase/functions/correo-entrante).
 *   - Historial de cada piso: emails recibidos, comunicaciones enviadas, notas, incidencias y deuda.
 *   - Ajustes del buzón: dirección pública, URL del conector y clave.
 * Colección "mensajes": {direccion: 'entrada'|'salida'|'nota', cid, uid | uids[], de, nombre, asunto, texto, fecha, estado}
 */
'use strict';

COLS.push('mensajes'); S.mensajes = []; NOUN.mensajes = 'mensaje';
VIEWS.splice(VIEWS.findIndex(v => v[0] === 'incidencias') + 1, 0, ['correo', 'Correo']);
const nuevos = () => S.mensajes.filter(m => m.direccion === 'entrada' && m.estado === 'nuevo' && (ui.cid === 'all' || m.cid === ui.cid || !m.cid));
NAV_BADGES.correo = () => nuevos().length;
const ahoraLocal = () => { const d = new Date(); return `${today()}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fdt = s => s ? `${fd(String(s).slice(0, 10))}${String(s).length > 10 ? ' ' + String(s).slice(11, 16) : ''}` : '';

/* ================= bandeja ================= */
function vCorreo() {
  if (!ui.corFiltro) ui.corFiltro = 'nuevos';
  let ms = S.mensajes.filter(m => m.direccion === 'entrada' && (ui.cid === 'all' || m.cid === ui.cid || !m.cid));
  const sinId = ms.filter(m => !m.uid).length;
  if (ui.corFiltro === 'nuevos') ms = ms.filter(m => m.estado === 'nuevo'); else if (ui.corFiltro === 'sinid') ms = ms.filter(m => !m.uid);
  ms.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  const c = S.config, conectado = !!c.buzonToken;
  return `${head('Correo', `Emails que los vecinos envían${c.emailEntrada ? ` a <b>${esc(c.emailEntrada)}</b>` : ' al buzón de la comunidad'}. Cada uno se guarda en el historial de su piso según la dirección del remitente.`, `<button class="btn" data-act="comunicar">Escribir a propietarios</button>`)}
  ${conectado || S.demo ? '' : `<div class="notice">El buzón todavía no está conectado. Configúralo en <a href="#ajustes">Ajustes → Buzón de correo</a>.</div>`}
  <div class="filters"><label class="sub" for="fCo">Mostrar</label><select id="fCo" data-filter="corFiltro"><option value="nuevos" ${ui.corFiltro === 'nuevos' ? 'selected' : ''}>Sin leer</option><option value="sinid" ${ui.corFiltro === 'sinid' ? 'selected' : ''}>Sin identificar (${sinId})</option><option value="todos" ${ui.corFiltro === 'todos' ? 'selected' : ''}>Todos</option></select>
  <input class="search" id="q" type="search" placeholder="Buscar remitente o asunto…" aria-label="Buscar" value="${esc(ui.q)}"></div>
  <div class="tw"><table class="tbl" id="qt"><thead><tr><th>Fecha</th><th>De</th><th>Asunto</th><th>Piso</th><th></th></tr></thead><tbody>
  ${ms.length ? ms.map(m => { const u = find('unidades', m.uid);
    return `<tr data-s="${esc([m.de, m.nombre, m.asunto, u && u.ref, u && u.propietario, comName(m.cid)].join(' ').toLowerCase())}"${m.estado === 'nuevo' ? ' style="font-weight:600"' : ''}><td class="nw">${esc(fdt(m.fecha))}</td><td>${esc(m.nombre || m.de)}<div class="sub" style="font-weight:400">${esc(m.de)}</div></td><td>${esc(m.asunto || '(sin asunto)')}${(m.adjuntos || []).length ? ` <span class="pill mut">${m.adjuntos.length} adjunto${m.adjuntos.length > 1 ? 's' : ''}</span>` : ''}<div class="sub" style="font-weight:400">${esc(String(m.texto || '').slice(0, 90))}</div></td>
      <td>${u ? `${esc(u.ref)}<div class="sub" style="font-weight:400">${esc(comName(u.cid))}</div>` : '<span class="pill warn">Sin identificar</span>'}</td><td class="ra"><button class="btn sm ${m.estado === 'nuevo' ? 'pri' : ''}" data-act="verMensaje" data-id="${esc(m.id)}">Abrir</button></td></tr>`; }).join('')
    : `<tr><td colspan="5" class="empty">${ui.corFiltro === 'nuevos' ? 'No hay emails sin leer.' : 'No hay emails.'}</td></tr>`}
  </tbody></table></div>`;
}
Object.assign(ACTS, {
  verMensaje: async d => {
    const m = find('mensajes', d.id); if (!m) return; const u = find('unidades', m.uid);
    const md = modal(m.asunto || '(sin asunto)', `<dl class="kv"><dt>De</dt><dd>${esc(m.nombre ? m.nombre + ' · ' : '')}${esc(m.de)}</dd><dt>Fecha</dt><dd>${esc(fdt(m.fecha))}</dd>${m.para ? `<dt>Para</dt><dd>${esc(m.para)}</dd>` : ''}
        <dt>Piso</dt><dd>${u ? `${esc(u.ref)} · ${esc(u.propietario)} · ${esc(comName(u.cid))} <button class="btn link" data-act="historial" data-id="${esc(u.id)}">Ver historial</button>` : `<select id="vm_u" aria-label="Asignar a un piso" style="width:auto"><option value="">— Asignar a un piso —</option>${sortedComs().map(k => `<optgroup label="${esc(k.nombre)}">${unitsOf(k.id).map(x => `<option value="${esc(x.id)}">${esc(unitLabel(x))}</option>`).join('')}</optgroup>`).join('')}</select>`}</dd>
        ${(m.adjuntos || []).length ? `<dt>Adjuntos</dt><dd>${m.adjuntos.map(a => esc(a.nombre)).join(', ')} <span class="sub">(los archivos siguen en el buzón original)</span></dd>` : ''}</dl>
      <div style="white-space:pre-wrap;border:1px solid var(--line);border-radius:8px;padding:12px;max-height:50vh;overflow:auto">${esc(m.texto || '')}</div>`,
      [{ l: 'Borrar', danger: 1, fn: async () => { if (!await confirmBox('¿Borrar este email del historial?', 'Borrar', true)) return false; await retry(() => store.del('mensajes', m.id)); } },
       { l: 'Crear incidencia', fn: async () => { const id = await retry(() => store.add('incidencias', { cid: m.cid || (u && u.cid) || (ui.cid !== 'all' ? ui.cid : ''), uid: m.uid || '', fecha: today(), titulo: m.asunto || 'Aviso por email', descripcion: `${m.nombre || m.de}: ${String(m.texto || '').slice(0, 1500)}`, provId: '', prioridad: 'media', estado: 'abierta', origen: 'email', creado: new Date().toISOString() })); void id; toast('Incidencia creada'); } },
       { l: 'Responder', fn: () => { abrirEnlace(`mailto:${encodeURIComponent(m.de)}?subject=${encodeURIComponent('Re: ' + (m.asunto || ''))}&body=${encodeURIComponent(`\n\n----\nEl ${fdt(m.fecha)}, ${m.nombre || m.de} escribió:\n${String(m.texto || '').slice(0, 1200)}`)}`); return false; } },
       { l: u ? 'Cerrar' : 'Guardar en el piso', pri: 1, fn: async (b, setErr) => { if (u) return; const sel = $('#vm_u', b); if (!sel.value) return setErr('Elige el piso.'), false; const x = find('unidades', sel.value);
          await retry(() => store.update('mensajes', m.id, { uid: x.id, cid: x.cid }));
          if (!x.email && await confirmBox(`¿Guardar también ${esc(m.de)} como email de ${esc(x.ref)} · ${esc(x.propietario)}? Así los próximos emails se asignarán solos.`, 'Guardar email')) await retry(() => store.update('unidades', x.id, { email: m.de }));
          toast('Guardado en ' + x.ref); } }], { wide: 1 });
    void md;
    if (m.estado === 'nuevo') try { await retry(() => store.update('mensajes', m.id, { estado: 'leido' })); } catch (e) { /* sin permiso de escritura: se queda como nuevo */ }
  }
});

/* ================= historial del piso ================= */
function eventosDe(u) {
  const ev = [];
  S.mensajes.forEach(m => {
    if (m.direccion === 'entrada' && m.uid === u.id) ev.push({ f: m.fecha, tipo: 'Email recibido', icono: '↙', t: m.asunto || '(sin asunto)', d: String(m.texto || '').slice(0, 300), id: m.id, act: 'verMensaje' });
    if (m.direccion === 'salida' && (m.uids || []).includes(u.id)) ev.push({ f: m.fecha, tipo: 'Comunicación enviada', icono: '↗', t: m.asunto || '', d: (m.uids || []).length > 1 ? `Enviada a ${(m.uids || []).length} propietarios` : '' });
    if (m.direccion === 'nota' && m.uid === u.id) ev.push({ f: m.fecha, tipo: cap(m.canal || 'nota'), icono: '✎', t: m.asunto || '', d: m.texto || '', id: m.id, borrar: true });
  });
  S.incidencias.filter(i => i.uid === u.id).forEach(i => ev.push({ f: i.fecha, tipo: 'Incidencia', icono: '!', t: i.titulo, d: `${cap(i.estado)}${i.origen === 'portal' ? ' · desde el portal' : ''}` }));
  S.recibos.filter(r => r.uid === u.id && r.estado === 'devuelto').forEach(r => ev.push({ f: r.vencimiento || r.emision, tipo: 'Recibo devuelto', icono: '€', t: `${r.periodo} · ${eur(r.importe)}`, d: r.motivoDevolucion || '' }));
  return ev.sort((a, b) => String(b.f).localeCompare(String(a.f)));
}
Object.assign(ACTS, {
  historial: d => {
    const u = find('unidades', d.id); if (!u) return; const ev = eventosDe(u);
    modal(`${u.ref} · ${u.propietario}`, `<div class="tiles">${tile('Deuda', eur(D.debt[u.id] || 0), D.overdue[u.id] ? eur(D.overdue[u.id]) + ' vencido' : '', D.overdue[u.id] ? 'bad' : '')}${tile('Contacto', esc(u.email || 'sin email'), esc([u.telefono, u.inquilino ? 'Inquilino: ' + u.inquilino : ''].filter(Boolean).join(' · ')))}${tile('Coeficiente', esc(PCT.format(num(u.coef))) + ' %', esc(comName(u.cid)))}</div>
      <div class="list">${ev.length ? ev.map(e => `<div class="it" style="align-items:flex-start"><span><span class="pill mut" title="${esc(e.tipo)}">${esc(e.icono)} ${esc(e.tipo)}</span> <b>${esc(e.t)}</b><div class="sub" style="white-space:pre-wrap">${esc(e.d)}</div></span><span class="acts"><span class="sub nw">${esc(fdt(e.f))}</span>${e.act ? `<button class="btn sm" data-act="${e.act}" data-id="${esc(e.id)}">Abrir</button>` : ''}${e.borrar ? `<button class="btn sm danger" data-act="del" data-col="mensajes" data-id="${esc(e.id)}" aria-label="Borrar nota">×</button>` : ''}</span></div>`).join('') : '<p class="sub" style="margin:0">Todavía no hay comunicaciones con este piso.</p>'}</div>`,
      [{ l: 'Cerrar' }, { l: 'Escribirle', fn: () => { comunicar({ cid: u.cid, soloUid: u.id, asunto: '', cuerpo: `Estimado/a ${u.propietario}:\n\n\n\nUn saludo,\n${adminName()}` }); } },
       { l: 'Añadir nota', pri: 1, fn: () => { ACTS.nota({ id: u.id }); } }], { wide: 1 });
  },
  nota: d => {
    const u = find('unidades', d.id); if (!u) return;
    modal(`Nota · ${u.ref}`, `<div class="fg"><label for="no_c">Tipo<select id="no_c"><option value="llamada">Llamada</option><option value="visita">Visita</option><option value="whatsapp">WhatsApp</option><option value="nota">Nota</option></select></label><label for="no_f">Fecha<input id="no_f" type="date" value="${today()}"></label>
      <label class="full" for="no_a">Resumen *<input id="no_a" type="text" maxlength="200"></label><label class="full" for="no_t">Detalle<textarea id="no_t" rows="4"></textarea></label></div>`,
      [{ l: 'Cancelar' }, { l: 'Guardar', pri: 1, fn: async (b, setErr) => { const a = $('#no_a', b).value.trim(); if (!a) return setErr('Escribe un resumen.'), false;
        await retry(() => store.add('mensajes', { direccion: 'nota', canal: $('#no_c', b).value, cid: u.cid, uid: u.id, asunto: a, texto: $('#no_t', b).value.trim(), fecha: $('#no_f', b).value + 'T' + ahoraLocal().slice(11), creado: new Date().toISOString() }));
        toast('Nota guardada'); ACTS.historial({ id: u.id }); } }]);
  }
});
// Botón «Historial» en cada piso de Propietarios
(function () {
  const orig = VIEW_FN.propietarios;
  VIEW_FN.propietarios = () => orig().replace(/<button class="btn sm" data-act="certificado" data-id="([^"]+)">Certificado<\/button>/g, (m0, id) => { const n = eventosDe(find('unidades', id) || { id }).length; return `<button class="btn sm" data-act="historial" data-id="${id}">Historial${n ? ' (' + n + ')' : ''}</button> ${m0}`; });
})();

/* ================= registro de lo enviado ================= */
// Al abrir el correo desde «Enviar comunicación», se apunta en el historial de cada piso destinatario.
window.registrarEnvio = async ({ cid, uids, asunto, texto }) => {
  if (!uids.length) return;
  try { await retry(() => store.add('mensajes', { direccion: 'salida', cid, uids, asunto, texto: String(texto || '').slice(0, 5000), fecha: ahoraLocal(), creado: new Date().toISOString() })); } catch (e) { console.warn(e); }
};

/* ================= ajustes del buzón ================= */
function vBuzon() {
  const c = S.config, cloud = S.mode === 'cloud';
  const url = cloud && c.buzonToken ? `${CFG.supabaseUrl.replace(/\/$/, '')}/functions/v1/correo-entrante?despacho=${S.despacho.id}&token=${c.buzonToken}` : '';
  return `<div class="card"><div class="vh"><h2>Buzón de correo</h2>${cloud ? `<button class="btn sm" data-act="buzonEditar">Editar</button>` : ''}</div>
    ${!cloud ? '<p class="sub" style="margin:0">Recibir los emails de los vecinos en su ficha necesita el modo con cuenta, porque el correo llega al servidor del despacho.</p>' : `
    <dl class="kv"><dt>Dirección para los vecinos</dt><dd>${esc(c.emailEntrada || '— sin indicar —')}</dd><dt>Remitentes desconocidos</dt><dd>${c.buzonGuardarDesconocidos ? 'Se guardan como «sin identificar»' : 'Se descartan (recomendado)'}</dd><dt>Estado</dt><dd>${c.buzonToken ? '<span class="pill ok">Clave creada</span>' : '<span class="pill warn">Sin conectar</span>'}</dd></dl>
    ${url ? `<label class="sub" for="bz_url" style="display:flex;flex-direction:column;gap:4px;font-weight:600">URL para el servicio de correo entrante (webhook)<input id="bz_url" type="text" readonly value="${esc(url)}"></label><p class="sub" style="margin:0">Trátala como una contraseña: quien la tenga puede añadir emails a tu bandeja. Si se filtra, pulsa «Nueva clave».</p>` : ''}
    <div class="acts"><button class="btn ${c.buzonToken ? '' : 'pri'}" data-act="buzonClave">${c.buzonToken ? 'Nueva clave' : 'Crear clave del buzón'}</button>${url ? '<button class="btn" data-act="buzonCopiar">Copiar URL</button>' : ''}<a class="btn" href="https://github.com/lucaniz/gestor-comunidades/blob/main/docs/correo-entrante.md" target="_blank" rel="noopener">Guía paso a paso</a></div>`}</div>`;
}
Object.assign(ACTS, {
  buzonClave: async () => { if (S.config.buzonToken && !await confirmBox('Se creará una clave nueva y la URL actual dejará de funcionar. Tendrás que pegar la nueva en el servicio de correo entrante.', 'Crear nueva')) return;
    const a = new Uint8Array(24); crypto.getRandomValues(a); const t = Array.from(a, b => b.toString(16).padStart(2, '0')).join('');
    try { await retry(() => store.set('config', 'despacho', { ...S.config, buzonToken: t })); toast('Clave creada'); } catch (e) { toast(errMsg(e)); } },
  buzonCopiar: async () => { const i = $('#bz_url'); try { await navigator.clipboard.writeText(i.value); toast('URL copiada'); } catch (e) { i.select(); } },
  buzonEditar: () => { const c = S.config;
    modal('Buzón de correo', `<div class="fg"><label class="full" for="bz_e">Dirección a la que escriben los vecinos<input id="bz_e" type="email" value="${esc(c.emailEntrada || '')}" placeholder="comunidades@tudominio.es"><small>Se añade al final de tus comunicaciones. Puedes cambiarla cuando quieras.</small></label>
      <label class="chk full" for="bz_d"><input type="checkbox" id="bz_d" ${c.buzonGuardarDesconocidos ? 'checked' : ''}> Guardar también los emails de remitentes que no son propietarios ni inquilinos registrados</label></div>`,
      [{ l: 'Cancelar' }, { l: 'Guardar', pri: 1, fn: async (b, setErr) => { const e = $('#bz_e', b).value.trim(); if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return setErr('Email no válido.'), false;
        await retry(() => store.set('config', 'despacho', { ...S.config, emailEntrada: e, buzonGuardarDesconocidos: $('#bz_d', b).checked })); toast('Buzón guardado'); } }]); }
});
(function () {
  const orig = VIEW_FN.ajustes;
  VIEW_FN.ajustes = () => orig().replace('<div class="card"><h2>Copia de seguridad</h2>', vBuzon() + '<div class="card"><h2>Copia de seguridad</h2>');
})();
VIEW_FN.correo = vCorreo;
