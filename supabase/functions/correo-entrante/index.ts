// Supabase Edge Function: recibe los emails que reenvía el proveedor de correo entrante (por ejemplo Postmark)
// y los guarda en el historial del piso correspondiente.
//
// Despliegue (sin comprobación de JWT, porque el proveedor no lo envía; la seguridad la da el token de la URL):
//   supabase functions deploy correo-entrante --no-verify-jwt
// o desde el panel: Edge Functions → Deploy a new function → pegar este archivo y normalizar.mjs → desactivar "Verify JWT".
//
// URL que se configura en el proveedor (la muestra la aplicación en Ajustes → Buzón de correo):
//   https://<proyecto>.supabase.co/functions/v1/correo-entrante?despacho=<id>&token=<clave>
import { createClient } from 'npm:@supabase/supabase-js@2.45.4';
import { normalizar } from './normalizar.mjs';

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') return new Response('Solo POST', { status: 405 });
  const url = new URL(req.url);
  const despacho = url.searchParams.get('despacho') ?? '';
  const token = url.searchParams.get('token') ?? '';
  if (!/^[0-9a-f-]{36}$/i.test(despacho) || token.length < 20) return new Response('Parámetros no válidos', { status: 400 });

  let body: unknown;
  try { body = await req.json(); } catch { return new Response('JSON no válido', { status: 400 }); }
  const msg = normalizar(body);
  if (!msg.de) return new Response('Falta el remitente', { status: 400 });

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
  const { data, error } = await sb.rpc('correo_entrante', { p_despacho: despacho, p_token: token, p_msg: msg });
  if (error) {
    const status = /Token/.test(error.message) ? 403 : 500;
    return new Response(error.message, { status });
  }
  return Response.json({ ok: true, pisos: data });
});
