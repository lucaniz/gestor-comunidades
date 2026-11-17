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
  col         text not null check (col in ('comunidades','unidades','recibos','gastos','proveedores','juntas','incidencias','config')),
  id          text not null check (length(id) between 1 and 100),
  data        jsonb not null default '{}'::jsonb check (pg_column_size(data) < 262144),
  updated_at  timestamptz not null default now(),
  updated_by  uuid default auth.uid(),
  primary key (despacho_id, col, id)
);

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

-- ---------------------------------------------------------------------
-- Tiempo real: la aplicación recibe al momento los cambios de otros miembros.
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'docs') then
    alter publication supabase_realtime add table public.docs;
  end if;
end $$;
