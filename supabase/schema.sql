-- =====================================================================
--  Rutas LICONSUMAR v3 — Esquema para el proyecto Supabase NUEVO
--  Ejecutar completo en: Supabase → SQL Editor → New query → Run
--  Es seguro ejecutarlo varias veces.
--
--  SEGURIDAD: las tablas tienen RLS activo y SIN políticas, es decir, la llave pública
--  (publishable/anon) NO puede leer ni escribir nada directamente. Todo pasa por las
--  funciones de abajo (SECURITY DEFINER) que validan la contraseña del admin
--  o el usuario + PIN del auxiliar en el servidor. Las contraseñas se guardan con hash (bcrypt).
--
--  Contraseña inicial del administrador: 1234 (se cambia desde Configuración en la app).
-- =====================================================================

create extension if not exists pgcrypto with schema extensions;

-- Normaliza nombres para compararlos (mayúsculas, sin tildes, sin espacios dobles)
create or replace function public.norm_txt(t text) returns text
language sql immutable as $$
  select trim(regexp_replace(upper(translate(coalesce(t, ''), 'áéíóúÁÉÍÓÚñÑüÜ', 'aeiouAEIOUnNuU')), '\s+', ' ', 'g'))
$$;

-- ---------------------------------------------------------------------
-- Configuración (hash de la contraseña del admin)
-- ---------------------------------------------------------------------
create table if not exists public.app_config (
  key   text primary key,
  value text not null
);
insert into public.app_config (key, value)
values ('admin_pass_hash', extensions.crypt('1234', extensions.gen_salt('bf')))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- AUXILIARES (los crea el admin: usuario + PIN de 4 dígitos)
-- El nombre debe coincidir con "Nombre conductor" del archivo de ruta.
-- ---------------------------------------------------------------------
create table if not exists public.auxiliares (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  nombre       text not null,
  nombre_norm  text generated always as (public.norm_txt(nombre)) stored,
  usuario      text not null,
  pin_hash     text,             -- null = aún sin PIN (el admin lo asigna al editar)
  telefono     text,
  activo       boolean not null default true
);
alter table public.auxiliares alter column pin_hash drop not null;
create unique index if not exists auxiliares_usuario_uq on public.auxiliares (lower(usuario));
create unique index if not exists auxiliares_nombre_uq  on public.auxiliares (nombre_norm);

-- ---------------------------------------------------------------------
-- RUTAS: una por planilla (la sube el admin; el auxiliar la ve al entrar)
-- ---------------------------------------------------------------------
create table if not exists public.rutas (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  fecha                 date,
  planilla              text not null default '',
  placa                 text,
  conductor             text,
  conductor_norm        text generated always as (public.norm_txt(conductor)) stored,
  auxiliar_id           uuid references public.auxiliares(id) on delete set null,
  estado                text not null default 'asignada' check (estado in ('asignada', 'en_curso', 'cerrada')),
  cerrada_at            timestamptz,
  actualizado_at        timestamptz,
  valor_total_planilla  numeric(14,2) default 0,
  total_a_legalizar     numeric(14,2) default 0,
  total_efectivo        numeric(14,2) default 0,
  cuadre                jsonb
);
create index if not exists rutas_fecha_idx on public.rutas (fecha);
create index if not exists rutas_aux_idx   on public.rutas (auxiliar_id);

-- ---------------------------------------------------------------------
-- FACTURAS de cada ruta (las crea el admin con el archivo; el auxiliar las completa)
-- ---------------------------------------------------------------------
create table if not exists public.facturas (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  ruta_id              uuid not null references public.rutas(id) on delete cascade,
  numero_factura       text not null,
  fecha                date,
  planilla             text,
  sucursal_despacho    text,
  cliente              text,
  vendedor             text,
  direccion            text,
  barrio               text,
  ciudad               text,
  telefono             text,
  valor_factura        numeric(14,2) default 0,
  descuentos           jsonb default '[]'::jsonb,
  total_descuentos     numeric(14,2) default 0,
  retencion            numeric(14,2) default 0,
  saldo_favor          numeric(14,2) default 0,
  valor_devuelto       numeric(14,2) default 0,
  forma_pago           text,
  mixto_transferencia  numeric(14,2) default 0,
  mixto_efectivo       numeric(14,2) default 0,
  comprobante_pago     text,
  estado_entrega       text not null default 'OK' check (estado_entrega in ('OK', 'Dev Parcial', 'Dev Total', 'Reenvío')),
  causal               text,
  valor_pagado         numeric(14,2) default 0,
  firma_digital        text,
  observaciones        text,
  confirmada           boolean not null default false,
  obsequio             boolean not null default false,   -- entrega de combos u obsequios (requiere firma)
  obsequio_detalle     text,
  lat                  double precision,                 -- GPS del cliente al entregar (opcional)
  lng                  double precision,
  entregada_at         timestamptz,
  unique (ruta_id, numero_factura)
);
create index if not exists facturas_ruta_idx    on public.facturas (ruta_id);
create index if not exists facturas_cliente_idx on public.facturas (public.norm_txt(cliente));

-- ---------------------------------------------------------------------
-- DEVOLUCIONES (con auxiliar, fecha, planilla y vehículo para el análisis)
-- ---------------------------------------------------------------------
create table if not exists public.devoluciones (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  ruta_id           uuid not null references public.rutas(id) on delete cascade,
  auxiliar_id       uuid references public.auxiliares(id) on delete set null,
  auxiliar          text,
  tipo              text,            -- 'parcial' | 'total' | 'manual'
  fecha             date,
  placa             text,
  planilla          text,
  cliente           text,
  factura           text,
  asesor_comercial  text,
  causal            text,
  codigo_producto   text,
  descripcion       text,
  cantidad          numeric(12,2),
  valor             numeric(14,2) default 0,
  firma_cliente     text
);
create index if not exists devoluciones_ruta_idx on public.devoluciones (ruta_id);

create table if not exists public.reenvios (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  ruta_id         uuid not null references public.rutas(id) on delete cascade,
  numero_factura  text,
  valor_total     numeric(14,2) default 0,
  fecha           date
);
create index if not exists reenvios_ruta_idx on public.reenvios (ruta_id);

-- Última ubicación GPS conocida de cada cliente (para el botón "Navegar")
create table if not exists public.clientes_gps (
  nombre_norm  text primary key,
  nombre       text,
  lat          double precision not null,
  lng          double precision not null,
  direccion    text,
  updated_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- RLS: activo y sin políticas → la llave pública no accede a las tablas.
-- ---------------------------------------------------------------------
alter table public.app_config   enable row level security;
alter table public.auxiliares   enable row level security;
alter table public.rutas        enable row level security;
alter table public.facturas     enable row level security;
alter table public.devoluciones enable row level security;
alter table public.reenvios     enable row level security;
alter table public.clientes_gps enable row level security;

-- =====================================================================
--  FUNCIONES INTERNAS (no expuestas)
-- =====================================================================
create or replace function public._check_admin(p_pass text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not exists (select 1 from public.app_config where key = 'admin_pass_hash' and value = crypt(coalesce(p_pass, ''), value)) then
    raise exception 'Contraseña de administrador incorrecta' using errcode = '28000';
  end if;
end $$;

create or replace function public._check_aux(p_usuario text, p_pin text) returns public.auxiliares
language plpgsql security definer set search_path = public, extensions as $$
declare a public.auxiliares;
begin
  select * into a from public.auxiliares where lower(usuario) = lower(trim(coalesce(p_usuario, ''))) and activo;
  if a.id is not null and a.pin_hash is null then
    raise exception 'Tu usuario aún no tiene PIN. Pídele al administrador que te lo asigne.' using errcode = '28000';
  end if;
  if a.id is null or a.pin_hash <> crypt(coalesce(p_pin, ''), a.pin_hash) then
    raise exception 'Usuario o PIN incorrecto' using errcode = '28000';
  end if;
  return a;
end $$;

-- Usuario sugerido a partir del nombre (APELLIDO + inicial del nombre), único
create or replace function public._usuario_unico(p_nombre text) returns text
language plpgsql security definer set search_path = public, extensions as $$
declare w text[]; base text; u text; n int := 1;
begin
  w := string_to_array(public.norm_txt(p_nombre), ' ');
  base := lower(regexp_replace(coalesce(w[1], 'aux'), '[^A-Za-z0-9]', '', 'g'))
       || lower(left(regexp_replace(coalesce(w[3], w[2], ''), '[^A-Za-z0-9]', '', 'g'), 1));
  if length(base) < 3 then base := base || 'aux'; end if;
  u := base;
  while exists (select 1 from public.auxiliares where lower(usuario) = u) loop
    n := n + 1; u := base || n;
  end loop;
  return u;
end $$;

-- Crea (sin PIN) un auxiliar por cada conductor de las rutas que todavía no existe
create or replace function public._autocrear_auxiliares() returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare c record; v_creados jsonb := '[]'::jsonb; v_user text;
begin
  for c in
    select distinct on (conductor_norm) conductor, conductor_norm from public.rutas
    where coalesce(conductor, '') <> '' and auxiliar_id is null
      and not exists (select 1 from public.auxiliares a where a.nombre_norm = rutas.conductor_norm)
  loop
    v_user := public._usuario_unico(c.conductor);
    insert into public.auxiliares (nombre, usuario, pin_hash, activo) values (upper(trim(c.conductor)), v_user, null, true);
    v_creados := v_creados || jsonb_build_object('nombre', upper(trim(c.conductor)), 'usuario', v_user);
  end loop;
  return v_creados;
end $$;

-- Asigna a su auxiliar las rutas cuyo conductor coincide con el nombre de un auxiliar
create or replace function public._reasignar_rutas() returns void
language sql security definer set search_path = public as $$
  update public.rutas r set auxiliar_id = a.id
  from public.auxiliares a
  where r.auxiliar_id is null and r.conductor_norm = a.nombre_norm;
$$;

revoke all on function public._check_admin(text)        from public, anon, authenticated;
revoke all on function public._check_aux(text, text)    from public, anon, authenticated;
revoke all on function public._reasignar_rutas()        from public, anon, authenticated;
revoke all on function public._usuario_unico(text)      from public, anon, authenticated;
revoke all on function public._autocrear_auxiliares()   from public, anon, authenticated;

-- =====================================================================
--  ADMINISTRADOR
-- =====================================================================
create or replace function public.admin_login(p_pass text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  return exists (select 1 from public.app_config where key = 'admin_pass_hash' and value = crypt(coalesce(p_pass, ''), value));
end $$;

create or replace function public.admin_cambiar_pass(p_pass text, p_nueva text) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_admin(p_pass);
  if length(coalesce(p_nueva, '')) < 4 then raise exception 'La contraseña debe tener mínimo 4 caracteres'; end if;
  update public.app_config set value = crypt(p_nueva, gen_salt('bf')) where key = 'admin_pass_hash';
  return true;
end $$;

-- ----- Auxiliares -----
create or replace function public.admin_listar_auxiliares(p_pass text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_admin(p_pass);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'nombre', a.nombre, 'usuario', a.usuario, 'telefono', a.telefono,
      'activo', a.activo, 'created_at', a.created_at, 'tiene_pin', a.pin_hash is not null,
      'rutas', (select count(*) from public.rutas r where r.auxiliar_id = a.id)
    ) order by a.nombre)
    from public.auxiliares a
  ), '[]'::jsonb);
end $$;

-- p_id null = crear; p_pin vacío al editar = no cambiar el PIN
create or replace function public.admin_guardar_auxiliar(
  p_pass text, p_id uuid, p_nombre text, p_usuario text, p_pin text, p_telefono text, p_activo boolean
) returns uuid
language plpgsql security definer set search_path = public, extensions as $$
declare v_id uuid;
begin
  perform public._check_admin(p_pass);
  if length(trim(coalesce(p_nombre, ''))) < 3 then raise exception 'Escribe el nombre completo del auxiliar'; end if;
  if length(trim(coalesce(p_usuario, ''))) < 3 then raise exception 'El usuario debe tener mínimo 3 caracteres'; end if;
  if p_id is null then
    if coalesce(p_pin, '') <> '' and p_pin !~ '^\d{4}$' then raise exception 'El PIN debe tener exactamente 4 dígitos'; end if;
    insert into public.auxiliares (nombre, usuario, pin_hash, telefono, activo)
    values (upper(trim(p_nombre)), lower(trim(p_usuario)),
            case when coalesce(p_pin, '') <> '' then crypt(p_pin, gen_salt('bf')) end, nullif(trim(p_telefono), ''), coalesce(p_activo, true))
    returning id into v_id;
  else
    if coalesce(p_pin, '') <> '' and p_pin !~ '^\d{4}$' then raise exception 'El PIN debe tener exactamente 4 dígitos'; end if;
    update public.auxiliares set
      nombre   = upper(trim(p_nombre)),
      usuario  = lower(trim(p_usuario)),
      telefono = nullif(trim(p_telefono), ''),
      activo   = coalesce(p_activo, activo),
      pin_hash = case when coalesce(p_pin, '') <> '' then crypt(p_pin, gen_salt('bf')) else pin_hash end
    where id = p_id returning id into v_id;
    if v_id is null then raise exception 'Auxiliar no encontrado'; end if;
  end if;
  perform public._reasignar_rutas();
  return v_id;
exception when unique_violation then
  raise exception 'Ya existe un auxiliar con ese usuario o ese nombre';
end $$;

-- p_items: [{"nombre":"...","usuario":"...","pin":"1234","telefono":"..."}]
create or replace function public.admin_importar_auxiliares(p_pass text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare it jsonb; creados int := 0; actualizados int := 0; errores jsonb := '[]'::jsonb; v_id uuid; v_exist uuid;
begin
  perform public._check_admin(p_pass);
  for it in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    begin
      select id into v_exist from public.auxiliares where lower(usuario) = lower(trim(it->>'usuario'));
      v_id := public.admin_guardar_auxiliar(p_pass, v_exist, it->>'nombre', it->>'usuario', it->>'pin', it->>'telefono', true);
      if v_exist is null then creados := creados + 1; else actualizados := actualizados + 1; end if;
    exception when others then
      errores := errores || jsonb_build_object('usuario', it->>'usuario', 'nombre', it->>'nombre', 'error', sqlerrm);
    end;
  end loop;
  return jsonb_build_object('creados', creados, 'actualizados', actualizados, 'errores', errores);
end $$;

create or replace function public.admin_eliminar_auxiliar(p_pass text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_admin(p_pass);
  delete from public.auxiliares where id = p_id;
  return true;
end $$;

-- ----- Rutas -----
-- p_rutas: [{"fecha":"2026-10-22","placa":"BHK744","conductor":"...","planilla":"1PL-00004878",
--            "facturas":[{"numero":"FVE-1","cliente":"...","sucursal":"...","vendedor":"...","fecha":"2026-10-22"}]}]
create or replace function public.admin_cargar_rutas(p_pass text, p_rutas jsonb) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  r jsonb; v_ruta uuid; v_estado text; v_fecha date; v_nuevas int := 0; v_actual int := 0;
  v_fact int := 0; v_n int; v_omit jsonb := '[]'::jsonb; v_sin jsonb := '[]'::jsonb; v_cond text; v_creados jsonb;
begin
  perform public._check_admin(p_pass);
  for r in select * from jsonb_array_elements(coalesce(p_rutas, '[]'::jsonb)) loop
    v_fecha := nullif(r->>'fecha', '')::date;
    v_cond  := coalesce(r->>'conductor', '');
    select id, estado into v_ruta, v_estado from public.rutas
      where planilla = coalesce(r->>'planilla', '')
        and fecha is not distinct from v_fecha
        and coalesce(placa, '') = coalesce(r->>'placa', '')
      limit 1;
    if v_ruta is not null and v_estado = 'cerrada' then
      v_omit := v_omit || to_jsonb(coalesce(nullif(r->>'planilla', ''), r->>'placa'));
      continue;
    end if;
    if v_ruta is null then
      insert into public.rutas (fecha, planilla, placa, conductor)
      values (v_fecha, coalesce(r->>'planilla', ''), nullif(r->>'placa', ''), v_cond)
      returning id into v_ruta;
      v_nuevas := v_nuevas + 1;
    else
      update public.rutas set conductor = v_cond where id = v_ruta;
      v_actual := v_actual + 1;
    end if;

    insert into public.facturas (ruta_id, numero_factura, fecha, planilla, sucursal_despacho, cliente, vendedor)
    select v_ruta, x.numero, nullif(x.fecha, '')::date, coalesce(r->>'planilla', ''), x.sucursal, x.cliente, x.vendedor
    from jsonb_to_recordset(r->'facturas') as x(numero text, fecha text, sucursal text, cliente text, vendedor text)
    where coalesce(x.numero, '') <> ''
    on conflict (ruta_id, numero_factura) do nothing;
    get diagnostics v_n = row_count;
    v_fact := v_fact + v_n;
  end loop;

  v_creados := public._autocrear_auxiliares();
  perform public._reasignar_rutas();

  select coalesce(jsonb_agg(distinct r2.conductor), '[]'::jsonb) into v_sin
  from public.rutas r2 where r2.auxiliar_id is null and r2.estado <> 'cerrada' and coalesce(r2.conductor, '') <> '';

  return jsonb_build_object('rutas_nuevas', v_nuevas, 'rutas_actualizadas', v_actual, 'facturas_nuevas', v_fact,
                            'omitidas_cerradas', v_omit, 'conductores_sin_auxiliar', v_sin, 'auxiliares_creados', v_creados);
end $$;

create or replace function public.admin_eliminar_ruta(p_pass text, p_id uuid) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_admin(p_pass);
  delete from public.rutas where id = p_id;
  return true;
end $$;

-- Listado de facturas con filtros (rango de fechas de la planilla, número, conductor, placa, cliente, estado)
create or replace function public.admin_facturas(
  p_pass text, p_desde date, p_hasta date, p_numero text, p_conductor text, p_placa text,
  p_cliente text, p_estado text, p_limit int default 200, p_offset int default 0
) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare v_total bigint; v_rows jsonb;
begin
  perform public._check_admin(p_pass);
  select coalesce(jsonb_agg(x.j order by x.ord_fecha desc nulls last, x.ord_num), '[]'::jsonb), coalesce(max(x.total), 0)
  into v_rows, v_total
  from (
    select jsonb_build_object(
             'ruta_id', r.id, 'numero', f.numero_factura, 'fecha', r.fecha, 'planilla', r.planilla, 'placa', r.placa,
             'conductor', coalesce(a.nombre, r.conductor), 'cliente', f.cliente, 'vendedor', f.vendedor,
             'estado', case when f.confirmada then f.estado_entrega else 'Pendiente' end, 'confirmada', f.confirmada,
             'valor', f.valor_factura, 'valor_devuelto', f.valor_devuelto, 'valor_pagado', f.valor_pagado,
             'forma_pago', f.forma_pago, 'entregada_at', f.entregada_at, 'obsequio', f.obsequio) as j,
           r.fecha as ord_fecha, f.numero_factura as ord_num, count(*) over() as total
    from public.facturas f
    join public.rutas r on r.id = f.ruta_id
    left join public.auxiliares a on a.id = r.auxiliar_id
    where (p_desde is null or r.fecha >= p_desde)
      and (p_hasta is null or r.fecha <= p_hasta)
      and (coalesce(trim(p_numero), '') = '' or f.numero_factura ilike '%' || trim(p_numero) || '%')
      and (coalesce(trim(p_conductor), '') = '' or public.norm_txt(coalesce(a.nombre, r.conductor)) like '%' || public.norm_txt(p_conductor) || '%')
      and (coalesce(trim(p_placa), '') = '' or upper(coalesce(r.placa, '')) like '%' || upper(trim(p_placa)) || '%')
      and (coalesce(trim(p_cliente), '') = '' or public.norm_txt(f.cliente) like '%' || public.norm_txt(p_cliente) || '%')
      and (coalesce(p_estado, '') = '' or (case when f.confirmada then f.estado_entrega else 'Pendiente' end) = p_estado)
    order by r.fecha desc nulls last, f.numero_factura
    limit greatest(coalesce(p_limit, 200), 1) offset greatest(coalesce(p_offset, 0), 0)
  ) x;
  return jsonb_build_object('total', v_total, 'rows', v_rows);
end $$;

-- Detalle completo de una factura: novedades, descuentos, quién la entregó, cuándo, firma y comprobante
create or replace function public.admin_factura_detalle(p_pass text, p_ruta_id uuid, p_numero text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare res jsonb;
begin
  perform public._check_admin(p_pass);
  select to_jsonb(f) || jsonb_build_object(
      'ruta', jsonb_build_object('fecha', r.fecha, 'planilla', r.planilla, 'placa', r.placa, 'conductor', r.conductor,
                                 'auxiliar', coalesce(a.nombre, r.conductor), 'estado', r.estado, 'cerrada_at', r.cerrada_at),
      'devoluciones', coalesce((
        select jsonb_agg(jsonb_build_object('tipo', d.tipo, 'producto', d.descripcion, 'cantidad', d.cantidad,
                                            'valor', d.valor, 'causal', d.causal))
        from public.devoluciones d where d.ruta_id = f.ruta_id and d.factura = f.numero_factura), '[]'::jsonb))
  into res
  from public.facturas f
  join public.rutas r on r.id = f.ruta_id
  left join public.auxiliares a on a.id = r.auxiliar_id
  where f.ruta_id = p_ruta_id and f.numero_factura = p_numero;
  return res;
end $$;

-- Datos para el dashboard y los reportes (sin firmas ni fotos, para que sea liviano)
create or replace function public.admin_dataset(p_pass text, p_desde date, p_hasta date) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare res jsonb;
begin
  perform public._check_admin(p_pass);
  select jsonb_build_object(
    'rutas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'fecha', r.fecha, 'planilla', r.planilla, 'placa', r.placa, 'conductor', r.conductor,
        'auxiliar_id', r.auxiliar_id, 'auxiliar', coalesce(a.nombre, r.conductor), 'estado', r.estado,
        'actualizado_at', r.actualizado_at, 'cerrada_at', r.cerrada_at,
        'total_a_legalizar', r.total_a_legalizar, 'total_efectivo', r.total_efectivo))
      from public.rutas r left join public.auxiliares a on a.id = r.auxiliar_id
      where (p_desde is null or r.fecha >= p_desde) and (p_hasta is null or r.fecha <= p_hasta)
    ), '[]'::jsonb),
    'facturas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ruta_id', f.ruta_id, 'numero', f.numero_factura, 'cliente', f.cliente, 'vendedor', f.vendedor,
        'estado', f.estado_entrega, 'confirmada', f.confirmada, 'valor', f.valor_factura,
        'valor_devuelto', f.valor_devuelto, 'valor_pagado', f.valor_pagado, 'forma_pago', f.forma_pago,
        'causal', f.causal, 'obsequio', f.obsequio, 'lat', f.lat, 'lng', f.lng, 'entregada_at', f.entregada_at))
      from public.facturas f join public.rutas r on r.id = f.ruta_id
      where (p_desde is null or r.fecha >= p_desde) and (p_hasta is null or r.fecha <= p_hasta)
    ), '[]'::jsonb),
    'devoluciones', coalesce((
      select jsonb_agg(jsonb_build_object(
        'ruta_id', d.ruta_id, 'auxiliar', coalesce(a.nombre, d.auxiliar), 'tipo', d.tipo, 'fecha', d.fecha,
        'placa', d.placa, 'planilla', d.planilla, 'cliente', d.cliente, 'factura', d.factura,
        'causal', d.causal, 'producto', d.descripcion, 'cantidad', d.cantidad, 'valor', d.valor))
      from public.devoluciones d
      join public.rutas r on r.id = d.ruta_id
      left join public.auxiliares a on a.id = d.auxiliar_id
      where (p_desde is null or r.fecha >= p_desde) and (p_hasta is null or r.fecha <= p_hasta)
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- =====================================================================
--  AUXILIAR
-- =====================================================================
create or replace function public.aux_login(p_usuario text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a public.auxiliares;
begin
  a := public._check_aux(p_usuario, p_pin);
  return jsonb_build_object('id', a.id, 'nombre', a.nombre, 'usuario', a.usuario);
end $$;

-- Rutas abiertas del auxiliar (y las terminadas en los últimos 7 días, para poder editarlas)
-- con sus facturas, avance, devoluciones y reenvíos (sin fotos de comprobante)
create or replace function public.aux_rutas(p_usuario text, p_pin text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a public.auxiliares;
begin
  a := public._check_aux(p_usuario, p_pin);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', r.id, 'fecha', r.fecha, 'planilla', r.planilla, 'placa', r.placa,
      'conductor', r.conductor, 'estado', r.estado, 'actualizado_at', r.actualizado_at,
      'facturas', coalesce((
        select jsonb_agg(jsonb_build_object(
          'numero', f.numero_factura, 'fecha', f.fecha, 'planilla', f.planilla,
          'sucursal', f.sucursal_despacho, 'cliente', f.cliente, 'vendedor', f.vendedor,
          'direccion', f.direccion, 'barrio', f.barrio, 'ciudad', f.ciudad, 'telefono', f.telefono,
          'ref_lat', g.lat, 'ref_lng', g.lng,
          'valor_factura', f.valor_factura, 'descuentos', f.descuentos, 'retencion', f.retencion,
          'saldo_favor', f.saldo_favor, 'forma_pago', f.forma_pago, 'mixto_transferencia', f.mixto_transferencia,
          'mixto_efectivo', f.mixto_efectivo, 'estado_entrega', f.estado_entrega, 'causal', f.causal,
          'observaciones', f.observaciones, 'confirmada', f.confirmada, 'obsequio', f.obsequio,
          'obsequio_detalle', f.obsequio_detalle, 'lat', f.lat, 'lng', f.lng, 'entregada_at', f.entregada_at,
          'firma_digital', f.firma_digital
        ) order by f.created_at, f.numero_factura)
        from public.facturas f
        left join public.clientes_gps g on g.nombre_norm = public.norm_txt(f.cliente)
        where f.ruta_id = r.id
      ), '[]'::jsonb),
      'devoluciones', coalesce((
        select jsonb_agg(jsonb_build_object(
          'tipo', d.tipo, 'fecha', d.fecha, 'cliente', d.cliente, 'factura', d.factura, 'asesor', d.asesor_comercial,
          'causal', d.causal, 'codigo_producto', d.codigo_producto, 'descripcion', d.descripcion,
          'cantidad', d.cantidad, 'valor', d.valor, 'firma', d.firma_cliente))
        from public.devoluciones d where d.ruta_id = r.id
      ), '[]'::jsonb),
      'reenvios', coalesce((
        select jsonb_agg(jsonb_build_object('numero', z.numero_factura, 'valor', z.valor_total, 'fecha', z.fecha))
        from public.reenvios z where z.ruta_id = r.id
      ), '[]'::jsonb)
    ) order by r.fecha desc, r.created_at desc)
    from public.rutas r
    where r.auxiliar_id = a.id
      and (r.estado <> 'cerrada' or coalesce(r.actualizado_at, r.cerrada_at, r.created_at) > now() - interval '7 days')
  ), '[]'::jsonb);
end $$;

-- p_cerrar = true  → guarda todo y marca la ruta cerrada
-- p_cerrar = false → sincroniza el avance (sin firmas/fotos si vienen null, no se pisan)
create or replace function public.aux_guardar_ruta(p_usuario text, p_pin text, p_data jsonb, p_cerrar boolean default true)
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  a public.auxiliares; v_ruta uuid; v_r jsonb := p_data->'route'; v_est text;
begin
  a := public._check_aux(p_usuario, p_pin);
  v_ruta := nullif(p_data->>'ruta_id', '')::uuid;
  if v_ruta is null then raise exception 'La ruta no tiene identificador'; end if;
  if exists (select 1 from public.rutas where id = v_ruta and auxiliar_id is not null and auxiliar_id <> a.id) then
    raise exception 'Esta ruta pertenece a otro auxiliar';
  end if;
  v_est := case when p_cerrar then 'cerrada' else 'en_curso' end;

  insert into public.rutas (id, fecha, planilla, placa, conductor, auxiliar_id, estado, cerrada_at, actualizado_at,
                            valor_total_planilla, total_a_legalizar, total_efectivo, cuadre)
  values (v_ruta, nullif(v_r->>'fecha', '')::date, coalesce(v_r->>'planilla', ''), nullif(v_r->>'placa', ''),
          coalesce(nullif(v_r->>'conductor', ''), a.nombre), a.id, v_est,
          case when p_cerrar then now() end, now(),
          coalesce((p_data->>'valor_total_planilla')::numeric, 0), coalesce((p_data->>'total_a_legalizar')::numeric, 0),
          coalesce((p_data->>'total_efectivo')::numeric, 0), p_data->'cuadre')
  on conflict (id) do update set
    placa                = coalesce(nullif(v_r->>'placa', ''), public.rutas.placa),
    auxiliar_id          = coalesce(public.rutas.auxiliar_id, a.id),
    estado               = case when public.rutas.estado = 'cerrada' or excluded.estado = 'cerrada' then 'cerrada' else excluded.estado end,
    cerrada_at           = coalesce(public.rutas.cerrada_at, excluded.cerrada_at),
    actualizado_at       = now(),
    valor_total_planilla = excluded.valor_total_planilla,
    total_a_legalizar    = excluded.total_a_legalizar,
    total_efectivo       = excluded.total_efectivo,
    cuadre               = coalesce(excluded.cuadre, public.rutas.cuadre);

  insert into public.facturas (
    ruta_id, numero_factura, fecha, planilla, sucursal_despacho, cliente, vendedor, direccion, barrio, ciudad, telefono,
    valor_factura, descuentos, total_descuentos, retencion, saldo_favor, valor_devuelto, forma_pago,
    mixto_transferencia, mixto_efectivo, comprobante_pago, estado_entrega, causal, valor_pagado, firma_digital,
    observaciones, confirmada, obsequio, obsequio_detalle, lat, lng, entregada_at)
  select v_ruta, x.numero_factura, x.fecha, x.planilla, x.sucursal_despacho, x.cliente, x.vendedor, x.direccion, x.barrio, x.ciudad, x.telefono,
         coalesce(x.valor_factura, 0), coalesce(x.descuentos, '[]'::jsonb), coalesce(x.total_descuentos, 0), coalesce(x.retencion, 0),
         coalesce(x.saldo_favor, 0), coalesce(x.valor_devuelto, 0), x.forma_pago,
         coalesce(x.mixto_transferencia, 0), coalesce(x.mixto_efectivo, 0), x.comprobante_pago,
         coalesce(x.estado_entrega, 'OK'), x.causal, coalesce(x.valor_pagado, 0), x.firma_digital,
         x.observaciones, coalesce(x.confirmada, false), coalesce(x.obsequio, false), x.obsequio_detalle, x.lat, x.lng, x.entregada_at
  from jsonb_to_recordset(coalesce(p_data->'facturas', '[]'::jsonb)) as x(
    numero_factura text, fecha date, planilla text, sucursal_despacho text, cliente text, vendedor text, direccion text,
    barrio text, ciudad text, telefono text, valor_factura numeric, descuentos jsonb, total_descuentos numeric,
    retencion numeric, saldo_favor numeric, valor_devuelto numeric, forma_pago text, mixto_transferencia numeric,
    mixto_efectivo numeric, comprobante_pago text, estado_entrega text, causal text, valor_pagado numeric,
    firma_digital text, observaciones text, confirmada boolean, obsequio boolean, obsequio_detalle text,
    lat double precision, lng double precision, entregada_at timestamptz)
  where coalesce(x.numero_factura, '') <> ''
  on conflict (ruta_id, numero_factura) do update set
    cliente = excluded.cliente, vendedor = excluded.vendedor, direccion = excluded.direccion, barrio = excluded.barrio,
    ciudad = excluded.ciudad, telefono = excluded.telefono, valor_factura = excluded.valor_factura,
    descuentos = excluded.descuentos, total_descuentos = excluded.total_descuentos, retencion = excluded.retencion,
    saldo_favor = excluded.saldo_favor, valor_devuelto = excluded.valor_devuelto, forma_pago = excluded.forma_pago,
    mixto_transferencia = excluded.mixto_transferencia, mixto_efectivo = excluded.mixto_efectivo,
    comprobante_pago = coalesce(excluded.comprobante_pago, public.facturas.comprobante_pago),
    estado_entrega = excluded.estado_entrega, causal = excluded.causal, valor_pagado = excluded.valor_pagado,
    firma_digital = coalesce(excluded.firma_digital, public.facturas.firma_digital),
    observaciones = excluded.observaciones, confirmada = excluded.confirmada, obsequio = excluded.obsequio,
    obsequio_detalle = excluded.obsequio_detalle,
    lat = coalesce(excluded.lat, public.facturas.lat), lng = coalesce(excluded.lng, public.facturas.lng),
    entregada_at = coalesce(excluded.entregada_at, public.facturas.entregada_at);

  delete from public.devoluciones where ruta_id = v_ruta;
  insert into public.devoluciones (ruta_id, auxiliar_id, auxiliar, tipo, fecha, placa, planilla, cliente, factura,
                                   asesor_comercial, causal, codigo_producto, descripcion, cantidad, valor, firma_cliente)
  select v_ruta, a.id, a.nombre, d.tipo, d.fecha, nullif(v_r->>'placa', ''), coalesce(v_r->>'planilla', ''), d.cliente, d.factura,
         d.asesor, d.causal, d.codigo_producto, d.descripcion, d.cantidad, coalesce(d.valor, 0),
         coalesce(d.firma, (select f.firma_digital from public.facturas f where f.ruta_id = v_ruta and f.numero_factura = d.factura))
  from jsonb_to_recordset(coalesce(p_data->'devoluciones', '[]'::jsonb)) as d(
    tipo text, fecha date, cliente text, factura text, asesor text, causal text, codigo_producto text,
    descripcion text, cantidad numeric, valor numeric, firma text);

  delete from public.reenvios where ruta_id = v_ruta;
  insert into public.reenvios (ruta_id, numero_factura, valor_total, fecha)
  select v_ruta, z.numero, coalesce(z.valor, 0), z.fecha
  from jsonb_to_recordset(coalesce(p_data->'reenvios', '[]'::jsonb)) as z(numero text, valor numeric, fecha date);

  insert into public.clientes_gps (nombre_norm, nombre, lat, lng, direccion, updated_at)
  select distinct on (public.norm_txt(g.cliente)) public.norm_txt(g.cliente), g.cliente, g.lat, g.lng, g.direccion, now()
  from jsonb_to_recordset(coalesce(p_data->'facturas', '[]'::jsonb)) as g(cliente text, lat double precision, lng double precision, direccion text)
  where g.lat is not null and g.lng is not null and coalesce(g.cliente, '') <> ''
  order by public.norm_txt(g.cliente)
  on conflict (nombre_norm) do update set lat = excluded.lat, lng = excluded.lng, nombre = excluded.nombre,
    direccion = coalesce(nullif(excluded.direccion, ''), public.clientes_gps.direccion), updated_at = now();

  return jsonb_build_object('ok', true, 'ruta_id', v_ruta, 'estado', v_est,
                            'actualizado_at', (select r.actualizado_at from public.rutas r where r.id = v_ruta));
end $$;

-- =====================================================================
--  SEGUIMIENTO EN VIVO (opcional: lo activa el auxiliar desde su app)
-- =====================================================================
create table if not exists public.ubicaciones_vivo (
  auxiliar_id  uuid primary key references public.auxiliares(id) on delete cascade,
  placa        text,
  planilla     text,
  lat          double precision not null,
  lng          double precision not null,
  precision_m  numeric,
  velocidad    numeric,          -- km/h
  updated_at   timestamptz not null default now()
);
alter table public.ubicaciones_vivo enable row level security;

-- p_lat null = el auxiliar apagó el seguimiento (se borra su posición)
create or replace function public.aux_ubicacion(
  p_usuario text, p_pin text, p_placa text, p_planilla text,
  p_lat double precision, p_lng double precision, p_precision numeric, p_velocidad numeric
) returns boolean
language plpgsql security definer set search_path = public, extensions as $$
declare a public.auxiliares;
begin
  a := public._check_aux(p_usuario, p_pin);
  if p_lat is null or p_lng is null then
    delete from public.ubicaciones_vivo where auxiliar_id = a.id;
    return true;
  end if;
  insert into public.ubicaciones_vivo (auxiliar_id, placa, planilla, lat, lng, precision_m, velocidad, updated_at)
  values (a.id, nullif(p_placa, ''), nullif(p_planilla, ''), p_lat, p_lng, p_precision, p_velocidad, now())
  on conflict (auxiliar_id) do update set placa = excluded.placa, planilla = excluded.planilla, lat = excluded.lat,
    lng = excluded.lng, precision_m = excluded.precision_m, velocidad = excluded.velocidad, updated_at = now();
  return true;
end $$;

-- Camiones que reportaron posición en los últimos p_minutos
create or replace function public.admin_ubicaciones(p_pass text, p_minutos int default 30) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_admin(p_pass);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'auxiliar', a.nombre, 'placa', u.placa, 'planilla', u.planilla, 'lat', u.lat, 'lng', u.lng,
      'precision', u.precision_m, 'velocidad', u.velocidad, 'updated_at', u.updated_at,
      'segundos', extract(epoch from (now() - u.updated_at))::int
    ) order by u.updated_at desc)
    from public.ubicaciones_vivo u join public.auxiliares a on a.id = u.auxiliar_id
    where u.updated_at > now() - make_interval(mins => greatest(p_minutos, 1))
  ), '[]'::jsonb);
end $$;


-- =====================================================================
--  ADMIN: detalle por auxiliar (cuadres, registros por día, fotos, mapa, devoluciones)
-- =====================================================================
-- Todas las rutas del auxiliar con su cuadre, facturas (sin fotos) y devoluciones
create or replace function public.admin_auxiliar_detalle(p_pass text, p_aux_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare res jsonb;
begin
  perform public._check_admin(p_pass);
  select jsonb_build_object(
    'auxiliar', (select jsonb_build_object('id', a.id, 'nombre', a.nombre, 'usuario', a.usuario, 'telefono', a.telefono, 'activo', a.activo)
                 from public.auxiliares a where a.id = p_aux_id),
    'rutas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'fecha', r.fecha, 'planilla', r.planilla, 'placa', r.placa, 'conductor', r.conductor, 'estado', r.estado,
        'cerrada_at', r.cerrada_at, 'actualizado_at', r.actualizado_at,
        'valor_total_planilla', r.valor_total_planilla, 'total_a_legalizar', r.total_a_legalizar,
        'total_efectivo', r.total_efectivo, 'cuadre', r.cuadre,
        'facturas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'numero', f.numero_factura, 'cliente', f.cliente, 'vendedor', f.vendedor, 'direccion', f.direccion,
            'barrio', f.barrio, 'estado', f.estado_entrega, 'confirmada', f.confirmada, 'causal', f.causal,
            'valor', f.valor_factura, 'valor_devuelto', f.valor_devuelto, 'valor_pagado', f.valor_pagado,
            'forma_pago', f.forma_pago, 'observaciones', f.observaciones, 'obsequio', f.obsequio,
            'obsequio_detalle', f.obsequio_detalle, 'entregada_at', f.entregada_at,
            'lat', coalesce(f.lat, g.lat), 'lng', coalesce(f.lng, g.lng),
            'tiene_firma', f.firma_digital is not null, 'tiene_comprobante', f.comprobante_pago is not null
          ) order by f.entregada_at nulls last, f.numero_factura)
          from public.facturas f
          left join public.clientes_gps g on g.nombre_norm = public.norm_txt(f.cliente)
          where f.ruta_id = r.id), '[]'::jsonb),
        'devoluciones', coalesce((
          select jsonb_agg(jsonb_build_object(
            'tipo', d.tipo, 'fecha', d.fecha, 'cliente', d.cliente, 'factura', d.factura, 'asesor', d.asesor_comercial,
            'causal', d.causal, 'codigo_producto', d.codigo_producto, 'descripcion', d.descripcion,
            'cantidad', d.cantidad, 'valor', d.valor, 'tiene_firma', d.firma_cliente is not null))
          from public.devoluciones d where d.ruta_id = r.id), '[]'::jsonb)
      ) order by r.fecha desc nulls last, r.created_at desc)
      from public.rutas r where r.auxiliar_id = p_aux_id
    ), '[]'::jsonb)
  ) into res;
  return res;
end $$;

-- Fotos (firma del cliente y comprobante de pago) de una ruta: se piden aparte porque pesan
create or replace function public.admin_ruta_fotos(p_pass text, p_ruta_id uuid) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_admin(p_pass);
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'numero', f.numero_factura, 'cliente', f.cliente, 'estado', f.estado_entrega, 'entregada_at', f.entregada_at,
      'firma', f.firma_digital, 'comprobante', f.comprobante_pago) order by f.entregada_at nulls last, f.numero_factura)
    from public.facturas f
    where f.ruta_id = p_ruta_id and (f.firma_digital is not null or f.comprobante_pago is not null)
  ), '[]'::jsonb);
end $$;

-- Ubicación GPS de todos los clientes registrados
create or replace function public.admin_clientes_gps(p_pass text) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform public._check_admin(p_pass);
  return coalesce((
    select jsonb_agg(jsonb_build_object('nombre', g.nombre, 'lat', g.lat, 'lng', g.lng, 'direccion', g.direccion, 'updated_at', g.updated_at)
                     order by g.nombre)
    from public.clientes_gps g
  ), '[]'::jsonb);
end $$;


-- Historial del auxiliar: todas sus rutas (más recientes primero) con cuadre, facturas y devoluciones, sin fotos
create or replace function public.aux_historial(p_usuario text, p_pin text, p_limit int default 120) returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare a public.auxiliares;
begin
  a := public._check_aux(p_usuario, p_pin);
  return coalesce((
    select jsonb_agg(x.j order by x.ord desc nulls last, x.created desc)
    from (
      select r.fecha as ord, r.created_at as created, jsonb_build_object(
        'id', r.id, 'fecha', r.fecha, 'planilla', r.planilla, 'placa', r.placa, 'conductor', r.conductor, 'estado', r.estado,
        'cerrada_at', r.cerrada_at, 'actualizado_at', r.actualizado_at,
        'valor_total_planilla', r.valor_total_planilla, 'total_a_legalizar', r.total_a_legalizar,
        'total_efectivo', r.total_efectivo, 'cuadre', r.cuadre,
        'facturas', coalesce((
          select jsonb_agg(jsonb_build_object(
            'numero', f.numero_factura, 'cliente', f.cliente, 'estado', f.estado_entrega, 'confirmada', f.confirmada,
            'causal', f.causal, 'valor', f.valor_factura, 'valor_pagado', f.valor_pagado, 'forma_pago', f.forma_pago,
            'observaciones', f.observaciones, 'obsequio', f.obsequio, 'entregada_at', f.entregada_at
          ) order by f.entregada_at nulls last, f.numero_factura)
          from public.facturas f where f.ruta_id = r.id), '[]'::jsonb),
        'devoluciones', coalesce((
          select jsonb_agg(jsonb_build_object(
            'tipo', d.tipo, 'fecha', d.fecha, 'cliente', d.cliente, 'factura', d.factura, 'asesor', d.asesor_comercial,
            'causal', d.causal, 'codigo_producto', d.codigo_producto, 'descripcion', d.descripcion,
            'cantidad', d.cantidad, 'valor', d.valor))
          from public.devoluciones d where d.ruta_id = r.id), '[]'::jsonb)
      ) as j
      from public.rutas r where r.auxiliar_id = a.id
      order by r.fecha desc nulls last, r.created_at desc
      limit greatest(coalesce(p_limit, 120), 1)
    ) x
  ), '[]'::jsonb);
end $$;

-- =====================================================================
--  Permisos: solo las funciones públicas quedan abiertas a la llave anon
-- =====================================================================
grant execute on function
  public.admin_login(text),
  public.admin_cambiar_pass(text, text),
  public.admin_listar_auxiliares(text),
  public.admin_guardar_auxiliar(text, uuid, text, text, text, text, boolean),
  public.admin_importar_auxiliares(text, jsonb),
  public.admin_eliminar_auxiliar(text, uuid),
  public.admin_cargar_rutas(text, jsonb),
  public.admin_eliminar_ruta(text, uuid),
  public.admin_dataset(text, date, date),
  public.admin_facturas(text, date, date, text, text, text, text, text, int, int),
  public.admin_factura_detalle(text, uuid, text),
  public.aux_login(text, text),
  public.aux_rutas(text, text),
  public.aux_historial(text, text, int),
  public.aux_guardar_ruta(text, text, jsonb, boolean),
  public.aux_ubicacion(text, text, text, text, double precision, double precision, numeric, numeric),
  public.admin_ubicaciones(text, int),
  public.admin_auxiliar_detalle(text, uuid),
  public.admin_ruta_fotos(text, uuid),
  public.admin_clientes_gps(text)
to anon, authenticated;

-- Refresca la caché de esquema de la API para que las funciones nuevas se vean de inmediato
notify pgrst, 'reload schema';
