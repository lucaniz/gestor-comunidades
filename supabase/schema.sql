-- =====================================================================
-- Gestor de Comunidades — esquema para Supabase (PostgreSQL)
--
-- Cómo usarlo: Supabase → SQL Editor → New query → pega este archivo → Run.
-- Se puede ejecutar varias veces sin romper nada.
--
-- Modelo:
--   despachos  Un despacho de administración (tú, tu amigo… cada uno el suyo).
--   miembros   Quién pertenece a cada despacho y con qué rol (admin / editor / lectura).
--   docs       Todos los datos del despacho (comunidades, pisos, recibos…) como JSON.
--   historial  Registro automático de cada alta, cambio y borrado (quién y cuándo).
--
-- La separación entre despachos la garantiza la base de datos (Row Level Security):
-- aunque alguien manipule la aplicación, no puede leer ni tocar datos de otro despacho.
-- =====================================================================

create extension if not exists pgcrypto;

create table if not exists public.despachos (
  id          uuid primary key default gen_random_uuid(),
  nombre      text not null,
  created_at  timestamptz not null default now()
);

create table if not exists public.miembros (
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  rol         text not null default 'editor' check (rol in ('admin', 'editor', 'lectura')),
  created_at  timestamptz not null default now(),
  primary key (despacho_id, user_id)
);
create index if not exists miembros_user_idx on public.miembros(user_id);

create table if not exists public.docs (
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  col         text not null,
  id          text not null check (length(id) between 1 and 100),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 262144),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (despacho_id, col, id)
);

-- Colecciones permitidas (se puede volver a ejecutar para añadir nuevas).
alter table public.docs drop constraint if exists docs_col_check;
alter table public.docs add constraint docs_col_check check (col in (
  'comunidades','unidades','recibos','gastos','proveedores','juntas','incidencias','config',
  'ingresos','movimientos','facturas','solicitudes','mensajes'));
create index if not exists docs_token_alta_idx on public.docs ((data->>'tokenAlta')) where col = 'comunidades';
create index if not exists docs_email_idx on public.docs (lower(data->>'email')) where col = 'unidades';
create index if not exists docs_cid_idx on public.docs (despacho_id, col, (data->>'cid'));

create table if not exists public.historial (
  n           bigserial primary key,
  despacho_id uuid not null references public.despachos(id) on delete cascade,
  col         text not null,
  id          text not null,
  accion      text not null,           -- INSERT / UPDATE / DELETE
  antes       jsonb,
  despues     jsonb,
  user_id     uuid default auth.uid(),
  at          timestamptz not null default now()
);
create index if not exists historial_despacho_idx on public.historial(despacho_id, at desc);

-- ---------------------------------------------------------------------
-- Rol del usuario actual en un despacho (null si no pertenece).
-- security definer: evita recursión en las políticas de "miembros".
-- ---------------------------------------------------------------------
create or replace function public.rol_en(d uuid) returns text
language sql stable security definer set search_path = public as $$
  select rol from public.miembros where despacho_id = d and user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------
-- Seguridad por filas
-- ---------------------------------------------------------------------
alter table public.despachos enable row level security;
alter table public.miembros  enable row level security;
alter table public.docs      enable row level security;
alter table public.historial enable row level security;

drop policy if exists "despachos_leer"     on public.despachos;
drop policy if exists "despachos_renombrar" on public.despachos;
create policy "despachos_leer"      on public.despachos for select using (public.rol_en(id) is not null);
create policy "despachos_renombrar" on public.despachos for update using (public.rol_en(id) = 'admin') with check (public.rol_en(id) = 'admin');

drop policy if exists "miembros_leer" on public.miembros;
create policy "miembros_leer" on public.miembros for select using (user_id = auth.uid() or public.rol_en(despacho_id) is not null);
-- Altas, cambios y bajas de miembros solo mediante las funciones de abajo.

drop policy if exists "docs_leer"      on public.docs;
drop policy if exists "docs_crear"     on public.docs;
drop policy if exists "docs_modificar" on public.docs;
drop policy if exists "docs_borrar"    on public.docs;
create policy "docs_leer"      on public.docs for select using (public.rol_en(despacho_id) is not null);
create policy "docs_crear"     on public.docs for insert with check (public.rol_en(despacho_id) in ('admin','editor'));
create policy "docs_modificar" on public.docs for update using (public.rol_en(despacho_id) in ('admin','editor')) with check (public.rol_en(despacho_id) in ('admin','editor'));
create policy "docs_borrar"    on public.docs for delete using (public.rol_en(despacho_id) in ('admin','editor'));

drop policy if exists "historial_leer" on public.historial;
create policy "historial_leer" on public.historial for select using (public.rol_en(despacho_id) = 'admin');

-- ---------------------------------------------------------------------
-- Historial automático y fecha de modificación
-- ---------------------------------------------------------------------
create or replace function public.docs_tocar() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

create or replace function public.docs_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.historial (despacho_id, col, id, accion, antes, despues)
  values (coalesce(new.despacho_id, old.despacho_id), coalesce(new.col, old.col), coalesce(new.id, old.id), tg_op,
          case when tg_op <> 'INSERT' then old.data end,
          case when tg_op <> 'DELETE' then new.data end);
  return coalesce(new, old);
end $$;

drop trigger if exists docs_tocar on public.docs;
create trigger docs_tocar before insert or update on public.docs for each row execute function public.docs_tocar();
drop trigger if exists docs_log on public.docs;
create trigger docs_log after insert or update or delete on public.docs for each row execute function public.docs_log();

-- ---------------------------------------------------------------------
-- Funciones que usa la aplicación
-- ---------------------------------------------------------------------

-- Crea un despacho y hace administrador a quien lo crea.
create or replace function public.crear_despacho(p_nombre text) returns uuid
language plpgsql security definer set search_path = public as $$
declare d uuid;
begin
  if auth.uid() is null then raise exception 'Hay que iniciar sesión'; end if;
  if (select count(*) from public.miembros where user_id = auth.uid() and rol = 'admin') >= 10 then
    raise exception 'Has alcanzado el máximo de 10 despachos';
  end if;
  insert into public.despachos (nombre) values (coalesce(nullif(trim(p_nombre), ''), 'Mi despacho')) returning id into d;
  insert into public.miembros (despacho_id, user_id, rol) values (d, auth.uid(), 'admin');
  return d;
end $$;

-- Lista el equipo de un despacho (con emails), solo para sus miembros.
create or replace function public.miembros_despacho(p_despacho uuid)
returns table (user_id uuid, email text, rol text)
language sql stable security definer set search_path = public as $$
  select m.user_id, u.email::text, m.rol
  from public.miembros m join auth.users u on u.id = m.user_id
  where m.despacho_id = p_despacho and public.rol_en(p_despacho) is not null
  order by m.rol, u.email
$$;

-- Añade (o cambia el rol de) una persona ya registrada. Solo administradores.
create or replace function public.invitar_miembro(p_despacho uuid, p_email text, p_rol text default 'editor') returns void
language plpgsql security definer set search_path = public as $$
declare u uuid;
begin
  if public.rol_en(p_despacho) is distinct from 'admin' then raise exception 'Solo un administrador del despacho puede añadir personas'; end if;
  if p_rol not in ('admin', 'editor', 'lectura') then raise exception 'Rol no válido'; end if;
  select id into u from auth.users where lower(email) = lower(trim(p_email));
  if u is null then raise exception 'Esa persona aún no ha entrado nunca en la aplicación. Pídele que entre una vez con su email y vuelve a intentarlo.'; end if;
  insert into public.miembros (despacho_id, user_id, rol) values (p_despacho, u, p_rol)
  on conflict (despacho_id, user_id) do update set rol = excluded.rol;
end $$;

-- Quita a una persona. Solo administradores; nunca deja el despacho sin administrador.
create or replace function public.quitar_miembro(p_despacho uuid, p_user uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.rol_en(p_despacho) is distinct from 'admin' then raise exception 'Solo un administrador del despacho puede quitar personas'; end if;
  if (select rol from public.miembros where despacho_id = p_despacho and user_id = p_user) = 'admin'
     and (select count(*) from public.miembros where despacho_id = p_despacho and rol = 'admin') <= 1 then
    raise exception 'El despacho debe tener al menos un administrador';
  end if;
  delete from public.miembros where despacho_id = p_despacho and user_id = p_user;
end $$;

revoke all on function public.crear_despacho(text)                from public, anon;
revoke all on function public.miembros_despacho(uuid)             from public, anon;
revoke all on function public.invitar_miembro(uuid, text, text)   from public, anon;
revoke all on function public.quitar_miembro(uuid, uuid)          from public, anon;
revoke all on function public.rol_en(uuid)                        from public, anon;
grant execute on function public.crear_despacho(text)              to authenticated;
grant execute on function public.miembros_despacho(uuid)           to authenticated;
grant execute on function public.invitar_miembro(uuid, text, text) to authenticated;
grant execute on function public.quitar_miembro(uuid, uuid)        to authenticated;
grant execute on function public.rol_en(uuid)                      to authenticated;

-- =====================================================================
-- Recogida de datos de contacto de propietarios (formulario público con QR)
-- Cada comunidad tiene un token secreto (data.tokenAlta) que va en el enlace/QR del portal.
-- =====================================================================

-- Datos mínimos para pintar el formulario: nombre de la comunidad y lista de pisos.
create or replace function public.alta_info(p_token text) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare c record;
begin
  if p_token is null or length(p_token) < 16 then return null; end if;
  select d.despacho_id, d.id, d.data into c from public.docs d where d.col = 'comunidades' and d.data->>'tokenAlta' = p_token limit 1;
  if not found then return null; end if;
  return jsonb_build_object(
    'comunidad', c.data->>'nombre',
    'direccion', concat_ws(', ', c.data->>'direccion', c.data->>'ciudad'),
    'despacho', (select nombre from public.despachos where id = c.despacho_id),
    'pisos', coalesce((select jsonb_agg(u.data->>'ref' order by u.data->>'ref') from public.docs u
                       where u.despacho_id = c.despacho_id and u.col = 'unidades' and u.data->>'cid' = c.id), '[]'::jsonb));
end $$;

-- Guarda una solicitud de alta que el administrador revisará. No modifica ningún piso.
create or replace function public.alta_propietario(p_token text, p_piso text, p_nombre text, p_email text, p_telefono text, p_rol text, p_consentimiento boolean) returns void
language plpgsql security definer set search_path = public as $$
declare c record;
begin
  select d.despacho_id, d.id into c from public.docs d where d.col = 'comunidades' and d.data->>'tokenAlta' = p_token and length(p_token) >= 16 limit 1;
  if not found then raise exception 'Enlace no válido o caducado'; end if;
  if coalesce(p_consentimiento, false) is not true then raise exception 'Hace falta el consentimiento para recibir notificaciones por email'; end if;
  if p_email !~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' or length(p_email) > 200 then raise exception 'Email no válido'; end if;
  if length(coalesce(trim(p_piso), '')) = 0 or length(p_piso) > 40 or length(coalesce(trim(p_nombre), '')) = 0 or length(p_nombre) > 120 or length(coalesce(p_telefono, '')) > 30 then
    raise exception 'Revisa el piso, el nombre y el teléfono';
  end if;
  if (select count(*) from public.docs where despacho_id = c.despacho_id and col = 'solicitudes' and data->>'cid' = c.id and data->>'estado' = 'pendiente') >= 300 then
    raise exception 'Hay demasiadas solicitudes pendientes en esta comunidad. Avisa a tu administrador.';
  end if;
  insert into public.docs (despacho_id, col, id, data) values (c.despacho_id, 'solicitudes', gen_random_uuid()::text, jsonb_build_object(
    'cid', c.id, 'piso', trim(p_piso), 'nombre', trim(p_nombre), 'email', lower(trim(p_email)), 'telefono', trim(coalesce(p_telefono, '')),
    'rol', case when p_rol = 'inquilino' then 'inquilino' else 'propietario' end,
    'consentimiento', true, 'fecha', to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI'), 'estado', 'pendiente'));
end $$;

-- =====================================================================
-- Portal del propietario: quien entra con el email registrado en un piso ve sus datos.
-- =====================================================================
create or replace function public.mi_email() returns text
language sql stable security definer set search_path = public as $$
  select lower(email) from auth.users where id = auth.uid()
$$;

create or replace function public.portal_resumen() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare e text := public.mi_email();
begin
  if e is null then return '[]'::jsonb; end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'despacho_id', u.despacho_id, 'despacho', (select nombre from public.despachos where id = u.despacho_id),
      'administrador', (select data->'nombre' from public.docs where despacho_id = u.despacho_id and col = 'config' and id = 'despacho'),
      'contacto', (select jsonb_build_object('email', data->'email', 'telefono', data->'telefono') from public.docs where despacho_id = u.despacho_id and col = 'config' and id = 'despacho'),
      'uid', u.id,
      'piso', jsonb_build_object('ref', u.data->'ref', 'tipo', u.data->'tipo', 'coef', u.data->'coef', 'propietario', u.data->'propietario', 'domiciliado', u.data->'domiciliado'),
      'comunidad', (select jsonb_build_object('nombre', c.data->'nombre', 'direccion', c.data->'direccion', 'ciudad', c.data->'ciudad', 'presidente', c.data->'presidente', 'iban', c.data->'iban')
                    from public.docs c where c.despacho_id = u.despacho_id and c.col = 'comunidades' and c.id = u.data->>'cid'),
      'recibos', coalesce((select jsonb_agg(jsonb_build_object('periodo', r.data->'periodo', 'concepto', r.data->'concepto', 'importe', r.data->'importe',
                    'estado', r.data->'estado', 'vencimiento', r.data->'vencimiento', 'fechaCobro', r.data->'fechaCobro') order by r.data->>'emision' desc)
                  from public.docs r where r.despacho_id = u.despacho_id and r.col = 'recibos' and r.data->>'uid' = u.id), '[]'::jsonb),
      'juntas', coalesce((select jsonb_agg(jsonb_build_object('fecha', j.data->'fecha', 'tipo', j.data->'tipo', 'hora1', j.data->'hora1', 'hora2', j.data->'hora2',
                    'lugar', j.data->'lugar', 'orden', j.data->'orden', 'estado', j.data->'estado',
                    'acuerdos', case when j.data->>'estado' = 'celebrada' then j.data->'acuerdos' end) order by j.data->>'fecha' desc)
                  from public.docs j where j.despacho_id = u.despacho_id and j.col = 'juntas' and j.data->>'cid' = u.data->>'cid'), '[]'::jsonb),
      'incidencias', coalesce((select jsonb_agg(jsonb_build_object('fecha', i.data->'fecha', 'titulo', i.data->'titulo', 'estado', i.data->'estado') order by i.data->>'fecha' desc)
                  from public.docs i where i.despacho_id = u.despacho_id and i.col = 'incidencias' and (i.data->>'uid' = u.id or i.data->>'reportadaPor' = e)), '[]'::jsonb)
    ))
    from public.docs u where u.col = 'unidades' and (lower(u.data->>'email') = e or lower(u.data->>'inquilinoEmail') = e)
  ), '[]'::jsonb);
end $$;

-- El propietario comunica una incidencia de su comunidad desde el portal.
create or replace function public.portal_incidencia(p_despacho uuid, p_uid text, p_titulo text, p_descripcion text) returns void
language plpgsql security definer set search_path = public as $$
declare e text := public.mi_email(); u record;
begin
  select * into u from public.docs where despacho_id = p_despacho and col = 'unidades' and id = p_uid
    and (lower(data->>'email') = e or lower(data->>'inquilinoEmail') = e);
  if not found then raise exception 'No tienes acceso a este piso'; end if;
  if length(coalesce(trim(p_titulo), '')) = 0 or length(p_titulo) > 200 or length(coalesce(p_descripcion, '')) > 3000 then raise exception 'Revisa el texto de la incidencia'; end if;
  if (select count(*) from public.docs where despacho_id = p_despacho and col = 'incidencias' and data->>'reportadaPor' = e and data->>'estado' <> 'cerrada') >= 20 then
    raise exception 'Tienes muchas incidencias abiertas. Espera a que se resuelvan o llama al administrador.';
  end if;
  insert into public.docs (despacho_id, col, id, data) values (p_despacho, 'incidencias', gen_random_uuid()::text, jsonb_build_object(
    'cid', u.data->>'cid', 'uid', p_uid, 'fecha', to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD'), 'titulo', trim(p_titulo),
    'descripcion', coalesce(p_descripcion, ''), 'provId', '', 'prioridad', 'media', 'estado', 'abierta', 'origen', 'portal', 'reportadaPor', e));
end $$;

revoke all on function public.alta_info(text) from public;
revoke all on function public.alta_propietario(text, text, text, text, text, text, boolean) from public;
revoke all on function public.mi_email() from public, anon;
revoke all on function public.portal_resumen() from public, anon;
revoke all on function public.portal_incidencia(uuid, text, text, text) from public, anon;
grant execute on function public.alta_info(text) to anon, authenticated;
grant execute on function public.alta_propietario(text, text, text, text, text, text, boolean) to anon, authenticated;
grant execute on function public.mi_email() to authenticated;
grant execute on function public.portal_resumen() to authenticated;
grant execute on function public.portal_incidencia(uuid, text, text, text) to authenticated;

-- =====================================================================
-- Correo entrante: la función supabase/functions/correo-entrante recibe cada email
-- (por ejemplo desde Postmark) y llama a esta función con la clave de servicio.
-- El email se guarda en el historial del piso cuyo propietario o inquilino tiene esa dirección;
-- si no coincide con nadie, se descarta, salvo que el despacho active «guardar desconocidos».
-- =====================================================================
create or replace function public.correo_entrante(p_despacho uuid, p_token text, p_msg jsonb) returns integer
language plpgsql security definer set search_path = public as $$
declare e text := lower(trim(coalesce(p_msg->>'de', ''))); n integer := 0; u record; base jsonb;
begin
  if p_token is null or length(p_token) < 20 or not exists (
      select 1 from public.docs where despacho_id = p_despacho and col = 'config' and id = 'despacho' and data->>'buzonToken' = p_token) then
    raise exception 'Token del buzón no válido';
  end if;
  if coalesce(p_msg->>'messageId', '') <> '' and exists (
      select 1 from public.docs where despacho_id = p_despacho and col = 'mensajes' and data->>'messageId' = p_msg->>'messageId') then
    return 0;  -- ya recibido (reintento del proveedor)
  end if;
  if (select count(*) from public.docs where despacho_id = p_despacho and col = 'mensajes' and updated_at > now() - interval '1 hour') > 500 then
    raise exception 'Demasiados emails en la última hora';
  end if;
  base := jsonb_build_object('direccion', 'entrada', 'de', e, 'nombre', left(coalesce(p_msg->>'nombre', ''), 200),
    'asunto', left(coalesce(p_msg->>'asunto', ''), 300), 'texto', left(coalesce(p_msg->>'texto', ''), 20000),
    'para', left(coalesce(p_msg->>'para', ''), 300), 'fecha', coalesce(nullif(p_msg->>'fecha', ''), to_char(now() at time zone 'Europe/Madrid', 'YYYY-MM-DD"T"HH24:MI')),
    'messageId', left(coalesce(p_msg->>'messageId', ''), 300), 'adjuntos', coalesce(p_msg->'adjuntos', '[]'::jsonb), 'estado', 'nuevo', 'origen', 'email');
  for u in select id, data->>'cid' as cid from public.docs
           where despacho_id = p_despacho and col = 'unidades' and e <> '' and (lower(data->>'email') = e or lower(data->>'inquilinoEmail') = e) loop
    insert into public.docs (despacho_id, col, id, data) values (p_despacho, 'mensajes', gen_random_uuid()::text, base || jsonb_build_object('cid', u.cid, 'uid', u.id));
    n := n + 1;
  end loop;
  -- Remitente desconocido: se guarda como «sin identificar» solo si el despacho lo ha permitido
  -- (por defecto se descarta, para no almacenar correo ajeno a las comunidades).
  if n = 0 and coalesce((select data->>'buzonGuardarDesconocidos' from public.docs where despacho_id = p_despacho and col = 'config' and id = 'despacho'), 'false') = 'true' then
    insert into public.docs (despacho_id, col, id, data) values (p_despacho, 'mensajes', gen_random_uuid()::text, base || jsonb_build_object('cid', null, 'uid', null));
  end if;
  return n;
end $$;
revoke all on function public.correo_entrante(uuid, text, jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'service_role') then
    grant execute on function public.correo_entrante(uuid, text, jsonb) to service_role;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Tiempo real: la aplicación recibe al momento los cambios de otros miembros.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
