/*
 * Gestor de Comunidades — propietarios:
 *   comunicaciones por email, recogida de datos de contacto (formulario público + cartel con QR),
 *   portal del propietario y versión de demostración.
 */
'use strict';

COLS.push('solicitudes'); S.solicitudes = []; NOUN.solicitudes = 'solicitud';
const appUrl = () => location.origin + location.pathname;

/* ================= comunicaciones por email ================= */
function plantillaJunta(j, acta) {
  const k = com(j.cid) || {}; const orden = String(j.orden || '').split('\n').map(s => s.replace(/^\s*\d+[.)-]?\s*/, '').trim()).filter(Boolean);
  if (acta) return { asunto: `Acta de la Junta General ${j.tipo} del ${fd(j.fecha)} · ${k.nombre}`,
    cuerpo: `Estimado/a propietario/a:\n\nLe remitimos el acta de la Junta General ${j.tipo} de la ${k.nombre} celebrada el ${fdLong(j.fecha)}.\n\nAcuerdos adoptados:\n${j.acuerdos || '(ver acta adjunta)'}\n\nLos propietarios ausentes pueden manifestar su discrepancia en los términos del art. 17 de la Ley de Propiedad Horizontal.\n\nUn saludo,\n${adminName()}` };
  return { asunto: `Convocatoria Junta General ${j.tipo} · ${k.nombre}`,
    cuerpo: `Estimado/a propietario/a:\n\nPor orden de ${String(j.convocadaPor || 'el Presidente').toLowerCase()}, se le convoca a la Junta General ${j.tipo} de la ${k.nombre}, que se celebrará el ${fdLong(j.fecha)} en ${j.lugar || '___'}, a las ${j.hora1 || '__:__'} en primera convocatoria y a las ${j.hora2 || '__:__'} en segunda, con el siguiente orden del día:\n\n${orden.map((o, i) => `${i + 1}. ${o}`).join('\n')}\n\nSe adjunta la convocatoria completa con la hoja de delegación de voto.\n\nUn saludo,\n${adminName()}` };
}
function plantillaDeuda(u) {
  const k = com(u.cid) || {}; const rs = S.recibos.filter(r => r.uid === u.id && r.estado !== 'cobrado');
  return { asunto: `Recibos pendientes · ${k.nombre} · ${u.ref}`,
    cuerpo: `Estimado/a ${u.propietario}:\n\nSegún la contabilidad de la ${k.nombre}, el piso ${u.ref} tiene pendientes los siguientes recibos:\n\n${rs.map(r => `- ${r.periodo} · ${r.concepto}: ${eur(r.importe)}`).join('\n')}\n\nTotal: ${eur(sum(rs.map(r => r.importe)))}\n\n${ibanValid(k.iban) ? `Puede ingresarlo por transferencia en la cuenta de la comunidad ${ibanFmt(k.iban)}, indicando el piso.\n\n` : ''}Si ya lo ha pagado, ignore este mensaje.\n\nUn saludo,\n${adminName()}` };
}
function comunicar({ cid, asunto = '', cuerpo = '', soloUid = null, filtro = 'todos' }) {
  const coms = sortedComs();
  const html = `<div class="fg">
    <label for="cm_cid">Comunidad *<select id="cm_cid">${comOpts(cid || (ui.cid !== 'all' ? ui.cid : ''))}</select></label>
    <label for="cm_dest">Destinatarios<select id="cm_dest"><option value="todos">Todos los propietarios con email</option><option value="morosos">Solo los que deben recibos</option><option value="inquilinos">Propietarios e inquilinos con email</option>${soloUid ? '<option value="uno" selected>Solo este propietario</option>' : ''}</select></label>
    <label class="full" for="cm_as">Asunto<input id="cm_as" type="text" value="${esc(asunto)}"></label>
    <label class="full" for="cm_cu">Mensaje<textarea id="cm_cu" rows="10">${esc(cuerpo)}</textarea></label>
    ${S.mode === 'cloud' ? `<label class="chk full" for="cm_portal"><input type="checkbox" id="cm_portal" checked> Añadir el enlace al portal del propietario (${esc(appUrl())})</label>` : ''}</div><div id="cm_prev"></div>
    <p class="sub" style="margin:0">Se abre tu programa de correo con los destinatarios en copia oculta. Adjunta allí el PDF si hace falta (convocatoria, acta…).</p>`;
  const lista = b => { const k = com($('#cm_cid', b).value); if (!k) return []; const d = $('#cm_dest', b).value; const us = unitsOf(k.id);
    const sel = d === 'uno' ? us.filter(u => u.id === soloUid) : d === 'morosos' ? us.filter(u => D.debt[u.id] > 0) : us;
    const out = []; sel.forEach(u => { if (u.email) out.push({ u, email: u.email }); if (d === 'inquilinos' && u.inquilinoEmail) out.push({ u, email: u.inquilinoEmail }); }); return { sel, out }; };
  const texto = b => $('#cm_cu', b).value + ($('#cm_portal', b) && $('#cm_portal', b).checked ? `\n\nConsulte sus recibos y las convocatorias en el portal del propietario: ${appUrl()} (entre con este mismo email).` : '');
  const m = modal('Enviar comunicación', html, [{ l: 'Cerrar' },
    { l: 'Copiar direcciones', fn: async (b, setErr) => { const { out } = lista(b); const t = out.map(x => x.email).join(', '); try { await navigator.clipboard.writeText(t); setErr(`${out.length} direcciones copiadas.`, true); } catch (e) { setErr(t, true); } return false; } },
    { l: 'Abrir en mi correo', pri: 1, fn: async (b, setErr) => { const { out } = lista(b); if (!out.length) return setErr('No hay destinatarios con email.'), false;
      const to = out.length === 1 ? out[0].email : (S.config.email || ''); const bcc = out.length === 1 ? '' : out.map(x => x.email).join(',');
      const url = `mailto:${encodeURIComponent(to)}?${bcc ? 'bcc=' + encodeURIComponent(bcc) + '&' : ''}subject=${encodeURIComponent($('#cm_as', b).value)}&body=${encodeURIComponent(texto(b))}`;
      if (url.length > 1900) setErr('El mensaje es largo para algunos programas de correo: si no se abre completo, usa "Copiar direcciones" y pega el texto.', true);
      location.href = url; return false; } }], { wide: 1 });
  const draw = () => { const r = lista(m.body); if (!r.sel) { $('#cm_prev', m.body).innerHTML = ''; return; } const sin = r.sel.filter(u => !u.email);
    $('#cm_prev', m.body).innerHTML = `<p style="margin:0"><b>${r.out.length}</b> destinatarios.${sin.length ? ` <span class="pill warn">${sin.length} sin email: ${sin.map(u => esc(u.ref)).join(', ')}</span> <button class="btn link" data-act="altaPropietarios">Recoger sus emails</button>` : ''}</p>`; };
  ['#cm_cid', '#cm_dest'].forEach(s => $(s, m.body).addEventListener('change', draw)); draw();
}
Object.assign(ACTS, {
  comunicar: d => {
    if (d.junta) { const j = find('juntas', d.junta); if (!j) return; return comunicar({ cid: j.cid, ...plantillaJunta(j, d.acta === '1') }); }
    if (d.uid) { const u = find('unidades', d.uid); if (!u) return; return comunicar({ cid: u.cid, soloUid: u.id, ...plantillaDeuda(u) }); }
    comunicar({ cid: ui.cid !== 'all' ? ui.cid : '', asunto: '', cuerpo: `Estimados propietarios:\n\n\n\nUn saludo,\n${adminName()}` });
  }
});

/* ================= recogida de datos de contacto (QR) ================= */
let _qr; function loadQR() { if (_qr) return _qr; _qr = new Promise((res, rej) => { const s = document.createElement('script'); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js'; s.onload = () => res(window.QRCode); s.onerror = rej; document.head.appendChild(s); }); return _qr; }
async function qrDataUrl(text) { const QR = await loadQR(); const div = document.createElement('div'); new QR(div, { text, width: 512, height: 512, correctLevel: QR.CorrectLevel.M }); const c = div.querySelector('canvas'); return c ? c.toDataURL('image/png') : (div.querySelector('img') || {}).src; }
const altaUrl = k => `${appUrl()}?alta=${encodeURIComponent(k.tokenAlta)}`;
function tokenNuevo() { const a = new Uint8Array(18); crypto.getRandomValues(a); return Array.from(a, b => b.toString(36).padStart(2, '0')).join('').slice(0, 24); }
function cartelAlta(k, qr) {
  return docPage('Datos de contacto ' + k.nombre, `<div style="text-align:center;padding-top:10mm">
    <h1 style="font-size:24pt;margin-bottom:4mm">COMUNIDAD DE PROPIETARIOS</h1><p style="font-size:16pt;margin:0">${esc(k.nombre)}</p>
    <p style="font-size:15pt;margin:14mm 0 6mm">Recibe las convocatorias, actas y recibos <b>por email</b>.<br>Escanea el código con la cámara del móvil y deja tus datos.</p>
    <img src="${qr}" alt="Código QR del formulario" style="width:95mm;height:95mm;image-rendering:pixelated">
    <p style="font-size:10pt;word-break:break-all;margin-top:6mm">${esc(altaUrl(k))}</p>
    <p class="nota" style="margin-top:12mm">Tus datos solo se usan para las comunicaciones de la comunidad. Administración: ${esc(adminName())}${S.config.telefono ? ' · ' + esc(S.config.telefono) : ''}</p></div>`);
}
function solicitudesPend(cid) { return S.solicitudes.filter(x => x.estado === 'pendiente' && (!cid || cid === 'all' || x.cid === cid)); }
function unidadPorRef(cid, ref) { const n = s => norm(s).replace(/\s/g, '').replace(/^(PISO|PLANTA)/, ''); return unitsOf(cid).find(u => n(u.ref) === n(ref)); }
Object.assign(ACTS, {
  altaPropietarios: async () => {
    if (S.mode !== 'cloud') return modal('Recogida de emails', '<p style="margin:0">El formulario para que los vecinos dejen sus datos necesita el modo con cuenta, porque las respuestas se guardan en el servidor del despacho. En modo prueba puedes añadir los emails a mano en cada piso.</p>');
    const cid = ui.cid !== 'all' ? ui.cid : (sortedComs()[0] || {}).id; const k = com(cid); if (!k) return toast('Crea primero una comunidad.');
    if (!k.tokenAlta) { try { await retry(() => store.update('comunidades', k.id, { tokenAlta: tokenNuevo() })); } catch (e) { return toast(errMsg(e)); } }
    const kk = com(cid); const url = altaUrl(kk); const pend = solicitudesPend(cid);
    const m = modal('Recogida de emails de propietarios', `<p style="margin:0">Pon el cartel en el portal de <b>${esc(kk.nombre)}</b> o envía el enlace al grupo de vecinos. Cada respuesta llega aquí para que la revises; no cambia ningún piso hasta que la aceptes.</p>
      <div class="fg"><label class="full" for="al_url">Enlace del formulario<input id="al_url" type="text" readonly value="${esc(url)}"></label></div>
      <div id="al_qr" style="display:flex;justify-content:center;min-height:200px"><span class="sub">Generando QR…</span></div>
      <p class="sub" style="margin:0">${pend.length ? `<b>${pend.length}</b> respuestas pendientes de revisar en Propietarios.` : 'Todavía no hay respuestas pendientes.'}</p>`,
      [{ l: 'Cerrar' }, { l: 'Nuevo enlace', fn: async (b, setErr) => { await retry(() => store.update('comunidades', kk.id, { tokenAlta: tokenNuevo() })); setErr('Enlace cambiado: el anterior y su cartel ya no funcionan. Vuelve a abrir esta ventana.', true); return false; } },
       { l: 'Copiar enlace', fn: async (b, setErr) => { try { await navigator.clipboard.writeText(url); setErr('Enlace copiado.', true); } catch (e) { $('#al_url', b).select(); } return false; } },
       { l: 'Cartel para imprimir', pri: 1, fn: async () => { const qr = await qrDataUrl(url); openDoc(cartelAlta(kk, qr), `cartel_${slug(kk.nombre)}.html`); return false; } }]);
    try { const src = await qrDataUrl(url); $('#al_qr', m.body).innerHTML = `<img src="${src}" alt="Código QR del formulario" width="200" height="200" style="image-rendering:pixelated">`; } catch (e) { $('#al_qr', m.body).innerHTML = '<span class="sub">No se ha podido generar el QR sin conexión.</span>'; }
  },
  solAceptar: async d => {
    const s = find('solicitudes', d.id); if (!s) return; const sel = document.getElementById('sol_u_' + d.id); const u = find('unidades', sel ? sel.value : '');
    if (!u) return toast('Elige a qué piso corresponde.');
    const patch = s.rol === 'inquilino' ? { inquilino: s.nombre, inquilinoEmail: s.email, inquilinoTelefono: s.telefono } : { email: s.email, telefono: s.telefono || u.telefono || '', consentimientoEmail: s.fecha };
    if (s.rol !== 'inquilino' && norm(u.propietario) && norm(u.propietario) !== norm(s.nombre) && !await confirmBox(`El piso ${esc(u.ref)} figura a nombre de <b>${esc(u.propietario)}</b> y quien responde es <b>${esc(s.nombre)}</b>. ¿Guardar igualmente su email en este piso?`, 'Guardar')) return;
    try { await retry(() => store.update('unidades', u.id, patch)); await retry(() => store.update('solicitudes', s.id, { estado: 'aceptada', uid: u.id })); toast(`Datos guardados en ${u.ref}`); } catch (e) { toast(errMsg(e)); }
  },
  solRechazar: async d => { try { await retry(() => store.update('solicitudes', d.id, { estado: 'rechazada' })); } catch (e) { toast(errMsg(e)); } }
});
function solicitudesCard() {
  const ps = solicitudesPend(ui.cid); if (!ps.length) return '';
  return `<div class="card"><div class="vh"><h2>Datos de contacto recibidos (${ps.length})</h2><span class="sub">Del formulario del portal. Revísalos antes de aceptarlos.</span></div><div class="tw"><table class="tbl"><thead><tr><th>Fecha</th>${ui.cid === 'all' ? '<th>Comunidad</th>' : ''}<th>Piso indicado</th><th>Nombre</th><th>Contacto</th><th>Guardar en</th><th></th></tr></thead><tbody>
  ${ps.map(s => { const guess = unidadPorRef(s.cid, s.piso); return `<tr><td class="nw sub">${esc(String(s.fecha || '').replace('T', ' '))}</td>${ui.cid === 'all' ? `<td class="sub">${esc(comName(s.cid))}</td>` : ''}<td>${esc(s.piso)}</td><td>${esc(s.nombre)} ${s.rol === 'inquilino' ? '<span class="pill">inquilino</span>' : ''}</td><td class="sub">${esc(s.email)}${s.telefono ? '<br>' + esc(s.telefono) : ''}</td>
    <td><select id="sol_u_${esc(s.id)}" aria-label="Piso" style="width:auto">${unitOpts(s.cid, guess ? guess.id : '', true)}</select></td><td class="ra"><button class="btn sm pri" data-act="solAceptar" data-id="${esc(s.id)}">Aceptar</button> <button class="btn sm danger" data-act="solRechazar" data-id="${esc(s.id)}">Descartar</button></td></tr>`; }).join('')}</tbody></table></div></div>`;
}
(function () {
  const orig = VIEW_FN.propietarios;
  VIEW_FN.propietarios = () => {
    const html = orig(); const extra = `<button class="btn" data-act="comunicar">Enviar comunicado</button><button class="btn" data-act="altaPropietarios">Recogida de emails (QR)</button>`;
    return html.replace('<button class="btn" data-act="importUnits">', extra + '<button class="btn" data-act="importUnits">').replace('<div class="tw"><table class="tbl" id="qt">', solicitudesCard() + '<div class="tw"><table class="tbl" id="qt">');
  };
  const origJ = VIEW_FN.juntas;
  VIEW_FN.juntas = () => origJ().replace(/<button class="btn sm" data-act="acta" data-id="([^"]+)">Acta<\/button>/g, (m0, id) => `${m0} <button class="btn sm" data-act="comunicar" data-junta="${id}" data-acta="${(find('juntas', id) || {}).estado === 'celebrada' ? '1' : '0'}">Enviar</button>`);
  const origP = VIEW_FN.panel;
  VIEW_FN.panel = () => origP().replace(/<button class="btn sm" data-act="certificado" data-id="([^"]+)">Certificado<\/button>/g, (m0, id) => `<button class="btn sm" data-act="comunicar" data-uid="${id}">Recordar</button> ${m0}`)
    .replace('<button class="btn pri" data-act="genRecibos">Generar recibos</button>', '<button class="btn" data-act="comunicar">Enviar aviso</button><button class="btn pri" data-act="genRecibos">Generar recibos</button>');
  // Aviso de respuestas pendientes en el panel general
  const origP2 = VIEW_FN.panel;
  VIEW_FN.panel = () => { const n = solicitudesPend(ui.cid).length; const h = origP2(); return n ? `<div class="notice info">${n} ${n === 1 ? 'vecino ha dejado' : 'vecinos han dejado'} sus datos de contacto. <a href="#propietarios">Revisarlos</a></div>` + h : h; };
})();

/* ================= formulario público de alta ================= */
async function bootAlta(token) {
  S.mode = 'alta'; S.alta = { token, cargando: true }; render();
  if (!cloudConfigured() || !window.supabase) { S.alta = { error: 'Este formulario no está disponible.' }; return render(); }
  sb = window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('alta_info', { p_token: token });
  S.alta = error || !data ? { error: 'El enlace no es válido o ha caducado. Pide uno nuevo a tu administrador.' } : { token, ...data };
  render();
}
function vAlta() {
  const a = S.alta || {};
  if (a.cargando) return '<p class="sub">Cargando…</p>';
  if (a.error) return `<div class="auth card"><h1>Datos de contacto</h1><p class="notice">${esc(a.error)}</p></div>`;
  if (a.enviado) return `<div class="auth card"><h1>¡Gracias!</h1><p style="margin:0">Hemos recibido tus datos. El administrador los revisará y a partir de entonces recibirás las comunicaciones de <b>${esc(a.comunidad)}</b> por email.</p><p class="sub" style="margin:0">Puedes cerrar esta página.</p></div>`;
  return `<div class="auth card"><h1>${esc(a.comunidad)}</h1><p class="sub" style="margin:0">${esc(a.direccion || '')}${a.despacho ? ' · Administración: ' + esc(a.despacho) : ''}</p>
  <p style="margin:0">Deja tus datos para recibir por email las convocatorias, actas, recibos y avisos de la comunidad.</p>
  <form id="altaForm" class="stack" style="gap:10px">
    <div class="fg"><label for="a_piso">Piso o local *<select id="a_piso" required><option value="">— Elige —</option>${(a.pisos || []).map(p => `<option>${esc(p)}</option>`).join('')}<option value="__otro">Otro (escribirlo)</option></select></label>
    <label for="a_rol">Soy<select id="a_rol"><option value="propietario">Propietario/a</option><option value="inquilino">Inquilino/a</option></select></label>
    <label class="full" for="a_otro" id="a_otro_l" hidden>Piso o local<input id="a_otro" type="text" maxlength="40"></label>
    <label class="full" for="a_nom">Nombre y apellidos *<input id="a_nom" type="text" required maxlength="120" autocomplete="name"></label>
    <label for="a_em">Email *<input id="a_em" type="email" required maxlength="200" autocomplete="email"></label>
    <label for="a_tel">Teléfono<input id="a_tel" type="tel" maxlength="30" autocomplete="tel"></label>
    <label class="chk full" for="a_ok"><input type="checkbox" id="a_ok" required> Acepto que la comunidad y su administrador usen estos datos para enviarme por email las comunicaciones de la comunidad. Puedo retirar el consentimiento cuando quiera escribiendo al administrador.</label></div>
    <button class="btn pri" type="submit">Enviar mis datos</button><p id="a_msg" class="sub" role="status" style="margin:0"></p></form></div>`;
}
document.addEventListener('change', e => { if (e.target.id === 'a_piso') { const l = $('#a_otro_l'); if (l) l.hidden = e.target.value !== '__otro'; } });
document.addEventListener('submit', async e => {
  if (e.target.id !== 'altaForm') return; e.preventDefault(); const msg = $('#a_msg'), btn = e.target.querySelector('button[type=submit]');
  const piso = $('#a_piso').value === '__otro' ? $('#a_otro').value.trim() : $('#a_piso').value; if (!piso) { msg.textContent = 'Indica tu piso.'; return; }
  btn.disabled = true; msg.textContent = 'Enviando…';
  const { error } = await sb.rpc('alta_propietario', { p_token: S.alta.token, p_piso: piso, p_nombre: $('#a_nom').value.trim(), p_email: $('#a_em').value.trim(), p_telefono: $('#a_tel').value.trim(), p_rol: $('#a_rol').value, p_consentimiento: $('#a_ok').checked });
  btn.disabled = false; if (error) { msg.textContent = 'No se ha podido enviar: ' + error.message; return; }
  S.alta.enviado = true; render();
});

/* ================= portal del propietario ================= */
async function bootPortal() {
  const { data, error } = await sb.rpc('portal_resumen');
  if (error || !Array.isArray(data) || !data.length) return false;
  S.portal = data; S.mode = 'portal'; render(); return true;
}
function vPortal() {
  const ps = S.portal || []; const pend = r => r.estado !== 'cobrado';
  return `<div class="stack" style="max-width:900px;margin:0 auto;width:100%">
  <div class="vh"><div><h1>Mis comunidades</h1><p>Has entrado como <b>${esc(S.user.email)}</b>.</p></div><div class="acts"><button class="btn" data-act="nuevoDespachoPortal">Soy administrador</button><button class="btn" data-act="logout">Salir</button></div></div>
  ${ps.map((p, i) => { const k = p.comunidad || {}, deuda = sum((p.recibos || []).filter(pend).map(r => r.importe)); const pr = (p.juntas || []).filter(j => j.estado === 'convocada');
    return `<div class="card"><div class="vh"><div><h2>${esc(k.nombre || '')} · ${esc(p.piso.ref || '')}</h2><p class="sub" style="margin:0">${esc([k.direccion, k.ciudad].filter(Boolean).join(', '))} · Administración: ${esc(p.administrador || p.despacho || '')}${p.contacto && p.contacto.telefono ? ' · ' + esc(p.contacto.telefono) : ''}${p.contacto && p.contacto.email ? ' · ' + esc(p.contacto.email) : ''}</p></div><button class="btn" data-act="portalIncidencia" data-i="${i}">Comunicar una incidencia</button></div>
      <div class="tiles">${tile('Pendiente de pago', eur(deuda), deuda > 0 && k.iban ? 'Transferencia a ' + esc(ibanFmt(k.iban)) : (p.piso.domiciliado ? 'Recibos domiciliados' : ''), deuda > 0 ? 'warn' : '')}${tile('Coeficiente', esc(PCT.format(num(p.piso.coef))) + ' %', esc(p.piso.tipo || ''))}${tile('Próxima junta', pr.length ? esc(fd(pr[pr.length - 1].fecha)) : '—', pr.length ? esc(pr[pr.length - 1].tipo) : '')}</div>
      ${pr.map(j => `<div class="notice info"><b>Junta ${esc(j.tipo)}</b> el ${esc(fdLong(j.fecha))}, ${esc(j.lugar || '')}, a las ${esc(j.hora1 || '')} (2ª convocatoria ${esc(j.hora2 || '')}).<br>Orden del día: ${esc(String(j.orden || '').split('\n').filter(Boolean).join(' · '))}</div>`).join('')}
      <h3>Recibos</h3><div class="tw"><table class="tbl"><thead><tr><th>Periodo</th><th>Concepto</th><th class="r">Importe</th><th>Estado</th></tr></thead><tbody>${(p.recibos || []).slice(0, 24).map(r => `<tr><td>${esc(r.periodo)}</td><td>${esc(r.concepto || '')}</td><td class="r">${eur(r.importe)}</td><td>${estPill(r.estado)}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">Sin recibos.</td></tr>'}</tbody></table></div>
      ${(p.juntas || []).filter(j => j.estado === 'celebrada' && j.acuerdos).slice(0, 3).map(j => `<details><summary>Acuerdos de la junta del ${esc(fd(j.fecha))}</summary><p style="white-space:pre-wrap">${esc(j.acuerdos)}</p></details>`).join('')}
      ${(p.incidencias || []).length ? `<h3>Mis incidencias</h3><div class="list">${p.incidencias.map(x => `<div class="it"><span>${esc(x.titulo)} <span class="sub">${esc(fd(x.fecha))}</span></span>${incPill(x.estado)}</div>`).join('')}</div>` : ''}</div>`; }).join('')}</div>`;
}
Object.assign(ACTS, {
  portalIncidencia: d => { const p = (S.portal || [])[+d.i]; if (!p) return;
    modal('Comunicar una incidencia', `<div class="fg"><label class="full" for="pi_t">¿Qué ocurre? *<input id="pi_t" type="text" maxlength="200" placeholder="Ej.: Luz fundida en el portal"></label><label class="full" for="pi_d">Detalles<textarea id="pi_d" rows="4" maxlength="3000"></textarea></label></div><p class="sub" style="margin:0">Llega directamente al administrador de ${esc((p.comunidad || {}).nombre || '')}. Para urgencias (agua, gas, ascensor con personas dentro) llama por teléfono.</p>`,
      [{ l: 'Cancelar' }, { l: 'Enviar', pri: 1, fn: async (b, setErr) => { const t = $('#pi_t', b).value.trim(); if (!t) return setErr('Describe la incidencia.'), false;
        const { error } = await sb.rpc('portal_incidencia', { p_despacho: p.despacho_id, p_uid: p.uid, p_titulo: t, p_descripcion: $('#pi_d', b).value.trim() });
        if (error) return setErr(error.message), false; toast('Incidencia enviada al administrador'); await bootPortal(); } }]); },
  nuevoDespachoPortal: () => { S.mode = 'nuevoDespacho'; render(); }
});

/* ================= versión de demostración ================= */
// Con ?demo la aplicación se abre en modo prueba con datos ficticios, en un almacén separado del modo prueba normal.
window.GC_DEMO_MODE = new URLSearchParams(location.search).has('demo');
Object.assign(ACTS, {
  resetDemo: async () => { if (!await confirmBox('¿Volver a los datos de ejemplo iniciales? Se pierden los cambios hechos en la demostración.', 'Restablecer')) return;
    try { localStorage.removeItem('gc_demo_v1'); } catch (e) {} location.reload(); },
  salirDemo: () => { location.href = appUrl(); }
});
