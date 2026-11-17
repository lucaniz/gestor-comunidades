/* Gestor de Comunidades — instalación como aplicación (móvil y escritorio). */
(function () {
  'use strict';
  let deferred = null;
  const standalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const ios = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(e => console.warn('Service worker:', e)));
  }
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); deferred = e; if (window.render) render(); });
  window.addEventListener('appinstalled', () => { deferred = null; if (window.toast) toast('Aplicación instalada'); if (window.render) render(); });

  // Estado para la interfaz: 'instalada' | 'boton' | 'ios' | 'manual'
  window.GCInstall = {
    estado() { return (window.__TAURI__ || standalone()) ? 'instalada' : deferred ? 'boton' : ios() ? 'ios' : 'manual'; },
    async instalar() {
      if (!deferred) return false;
      deferred.prompt(); const r = await deferred.userChoice; deferred = null;
      if (window.render) render(); return r.outcome === 'accepted';
    }
  };
})();
