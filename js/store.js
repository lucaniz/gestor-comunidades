/*
 * Gestor de Comunidades — almacenamiento.
 * Dos implementaciones con la misma interfaz:
 *   watch(col, cb, err)        cb(filas) con cada cambio; filas = [{id, ...datos}]
 *   watchDoc(col, id, cb, err) cb(datos | {})
 *   add(col, datos) -> id      set(col, id, datos)      update(col, id, cambios)      del(col, id)
 *
 *  - GCStore.local(): datos en el navegador (localStorage). Para probar sin registro.
 *  - GCStore.supabase(cliente, despachoId): datos en Supabase, separados por despacho (RLS).
 */
(function () {
  'use strict';
  const EXTRA = ['config'];

  function makeCache(cols) {
    const cache = {}, subs = {};
    cols.concat(EXTRA).forEach(c => { cache[c] = new Map(); subs[c] = []; });
    const rows = c => [...cache[c].entries()].map(([id, d]) => ({ id, ...d }));
    const emit = c => subs[c].forEach(f => { try { f(rows(c), { fromCache: false }); } catch (e) { console.error(e); } });
    return { cache, subs, rows, emit };
  }
  function permErr(message) { return { code: 'invalid_argument', message }; }
  const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'id' + Date.now().toString(36) + Math.random().toString(36).slice(2));

  /* ---------------- Navegador ---------------- */
  function local(cols, key) {
    const KEY = key || 'gc_local_v1';
    const { cache, subs, rows, emit } = makeCache(cols);
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
      for (const c of Object.keys(cache)) for (const [id, d] of Object.entries(raw[c] || {})) cache[c].set(id, d);
    } catch (e) { console.warn('No se pudieron leer los datos locales', e); }
    const persist = () => {
      const out = {}; for (const c of Object.keys(cache)) out[c] = Object.fromEntries(cache[c]);
      try { localStorage.setItem(KEY, JSON.stringify(out)); }
      catch (e) { throw { code: 'quota_exceeded', message: 'El navegador no tiene más espacio para guardar datos. Exporta una copia y usa la versión con cuenta.' }; }
    };
    const api = {
      kind: 'local',
      watch(col, cb) { subs[col].push(cb); setTimeout(() => cb(rows(col), { fromCache: false }), 0); return () => {}; },
      watchDoc(col, id, cb) { return api.watch(col, () => cb(cache[col].get(id) || {})); },
      async add(col, data) { const id = newId(); await api.set(col, id, data); return id; },
      async set(col, id, data) { cache[col].set(id, { ...data }); persist(); emit(col); },
      async update(col, id, patch) { const cur = cache[col].get(id); if (!cur) throw permErr('El registro ya no existe.'); cache[col].set(id, { ...cur, ...patch }); persist(); emit(col); },
      async del(col, id) { cache[col].delete(id); persist(); emit(col); }
    };
    return api;
  }

  /* ---------------- Supabase ---------------- */
  function mapErr(error) {
    if (!error) return null;
    if (error.code === '42501' || /row-level security|permission denied/i.test(error.message || '')) return permErr('No tienes permiso para modificar los datos de este despacho (tu rol es de solo lectura).');
    if (/Failed to fetch|NetworkError/i.test(error.message || '')) return { code: 'unavailable', message: 'Sin conexión con el servidor.' };
    return { code: error.code || 'error', message: error.message || String(error) };
  }
  function supabase(sb, did, cols) {
    const { cache, subs, rows, emit } = makeCache(cols);
    let failed = null;
    const ready = (async () => {
      const size = 1000;
      for (let from = 0; ; from += size) {
        const { data, error } = await sb.from('docs').select('col,id,data').eq('despacho_id', did).order('col').order('id').range(from, from + size - 1);
        if (error) throw mapErr(error);
        for (const r of data) if (cache[r.col]) cache[r.col].set(r.id, r.data);
        if (data.length < size) break;
      }
      // Cambios en tiempo real (otros usuarios del despacho, otras pestañas).
      sb.channel('docs-' + did)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'docs', filter: 'despacho_id=eq.' + did }, p => {
          if (p.eventType === 'DELETE') {
            const o = p.old || {};
            if (o.despacho_id === did && cache[o.col] && cache[o.col].has(o.id)) { cache[o.col].delete(o.id); emit(o.col); }
          } else {
            const n = p.new || {};
            if (n.despacho_id === did && cache[n.col]) { cache[n.col].set(n.id, n.data); emit(n.col); }
          }
        })
        .subscribe();
    })().catch(e => { failed = e; throw e; });

    const api = {
      kind: 'supabase',
      watch(col, cb, err) { subs[col].push(cb); ready.then(() => cb(rows(col), { fromCache: false }), e => err && err(e)); return () => {}; },
      watchDoc(col, id, cb, err) { return api.watch(col, () => cb(cache[col].get(id) || {}), err); },
      async add(col, data) { const id = newId(); await api.set(col, id, data); return id; },
      async set(col, id, data) {
        if (failed) throw failed;
        const { error } = await sb.from('docs').upsert({ despacho_id: did, col, id, data });
        if (error) throw mapErr(error);
        cache[col].set(id, { ...data }); emit(col);
      },
      async update(col, id, patch) {
        const cur = cache[col].get(id); if (!cur) throw permErr('El registro ya no existe.');
        return api.set(col, id, { ...cur, ...patch });
      },
      async del(col, id) {
        const { error } = await sb.from('docs').delete().match({ despacho_id: did, col, id });
        if (error) throw mapErr(error);
        cache[col].delete(id); emit(col);
      }
    };
    return api;
  }

  window.GCStore = { local, supabase, mapErr };
})();
