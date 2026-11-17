// Copia los archivos de la aplicación web a dist/ para empaquetarlos en el programa de escritorio.
// Uso: node tools/build-dist.mjs   (lo ejecuta Tauri antes de compilar)
import { cpSync, rmSync, mkdirSync } from 'node:fs';
const root = new URL('../', import.meta.url);
const dist = new URL('dist/', root);
rmSync(dist, { recursive: true, force: true });
mkdirSync(dist);
for (const f of ['index.html', 'config.js', 'manifest.webmanifest', 'css', 'js', 'icons']) cpSync(new URL(f, root), new URL(f, dist), { recursive: true });
console.log('dist/ preparado');
