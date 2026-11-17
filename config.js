/*
 * Configuración del Gestor de Comunidades.
 *
 * Sin rellenar  → la aplicación funciona en "modo prueba": los datos se guardan solo en el navegador.
 * Rellenado     → cada administrador entra con su email y trabaja en su propio despacho (Supabase).
 *
 * Los dos valores están en Supabase → Project Settings → API.
 * La "anon public key" es pública por diseño: la seguridad la ponen las reglas de supabase/schema.sql.
 * Nunca pongas aquí la "service_role key".
 */
window.GC_CONFIG = {
  supabaseUrl: '',
  supabaseAnonKey: ''
};
