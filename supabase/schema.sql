-- =====================================================================
--  Rutas LICONSUMAR v2 — Esquema de base de datos (Supabase / PostgreSQL)
--  Ejecutar completo en: Supabase → SQL Editor → New query → Run
--  Es seguro ejecutarlo varias veces (usa IF NOT EXISTS).
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- RUTAS: una fila por ruta guardada (botón "Guardar ruta y comenzar nueva")
-- ---------------------------------------------------------------------
create table if not exists public.rutas (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz not null default now(),
  auxiliar              text,            -- nombre con el que ingresó el auxiliar
  conductor             text,            -- NOMBRE CONDUCTOR (plantilla)
  placa                 text,            -- VEHICULO (plantilla)
  fecha                 date,            -- FECHA (plantilla)
  planilla              text,            -- NUMERO PLANILLA (plantilla)
  valor_total_planilla  numeric(14,2) default 0,
  total_a_legalizar     numeric(14,2) default 0,
  total_efectivo        numeric(14,2) default 0,
  cta_total_facturas    integer default 0,
  cuadre                jsonb            -- {"Efectivo":{"count":3,"valor":120000}, ...}
);

-- Si la tabla ya existía de la versión 1, agrega las columnas nuevas
alter table public.rutas add column if not exists auxiliar text;
alter table public.rutas add column if not exists conductor text;
alter table public.rutas add column if not exists total_a_legalizar numeric(14,2) default 0;
alter table public.rutas add column if not exists total_efectivo numeric(14,2) default 0;
alter table public.rutas add column if not exists cuadre jsonb;

-- ---------------------------------------------------------------------
-- FACTURAS: sin productos; el valor se digita a mano en la ruta
-- ---------------------------------------------------------------------
create table if not exists public.facturas (
  id                   uuid primary key default gen_random_uuid(),
  created_at           timestamptz not null default now(),
  ruta_id              uuid not null references public.rutas(id) on delete cascade,
  numero_factura       text not null,   -- NUMERO DOCUMENTO (plantilla)
  fecha                date,
  planilla             text,
  sucursal_despacho    text,            -- SUCURSAL DESPACHO (plantilla)
  cliente              text,            -- nombre del cliente (digitado en ruta)
  vendedor             text,            -- NOMBRE VENDEDOR (plantilla)
  direccion            text,
  barrio               text,
  ciudad               text,
  telefono             text,
  valor_factura        numeric(14,2) default 0,
  descuentos           jsonb default '[]'::jsonb,  -- [{"concepto":"Pronto pago","porcentaje":"2","valor":5000}]
  total_descuentos     numeric(14,2) default 0,
  retencion            numeric(14,2) default 0,
  saldo_favor          numeric(14,2) default 0,
  valor_devuelto       numeric(14,2) default 0,
  forma_pago           text,
  mixto_transferencia  numeric(14,2) default 0,
  mixto_efectivo       numeric(14,2) default 0,
  comprobante_pago     text,            -- imagen en base64 (jpeg comprimido)
  estado_entrega       text check (estado_entrega in ('OK','Dev Parcial','Dev Total','Reenvío')),
  causal               text,
  valor_pagado         numeric(14,2) default 0,  -- saldo a pagar final
  firma_digital        text,            -- imagen png base64
  observaciones        text,
  confirmada           boolean default false
);

-- columnas nuevas si la tabla venía de la versión 1
alter table public.facturas add column if not exists fecha date;
alter table public.facturas add column if not exists planilla text;
alter table public.facturas add column if not exists sucursal_despacho text;
alter table public.facturas add column if not exists telefono text;
alter table public.facturas add column if not exists valor_factura numeric(14,2) default 0;
alter table public.facturas add column if not exists descuentos jsonb default '[]'::jsonb;
alter table public.facturas add column if not exists total_descuentos numeric(14,2) default 0;
alter table public.facturas add column if not exists valor_devuelto numeric(14,2) default 0;
alter table public.facturas add column if not exists mixto_transferencia numeric(14,2) default 0;
alter table public.facturas add column if not exists mixto_efectivo numeric(14,2) default 0;
alter table public.facturas add column if not exists comprobante_pago text;
alter table public.facturas add column if not exists observaciones text;
alter table public.facturas add column if not exists confirmada boolean default false;

create index if not exists facturas_ruta_idx    on public.facturas (ruta_id);
create index if not exists facturas_numero_idx  on public.facturas (numero_factura);
create index if not exists facturas_cliente_idx on public.facturas (lower(cliente));

-- ---------------------------------------------------------------------
-- DEVOLUCIONES: formato F-GL-001
-- ---------------------------------------------------------------------
create table if not exists public.devoluciones (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  ruta_id           uuid not null references public.rutas(id) on delete cascade,
  tipo              text,   -- 'parcial' | 'total' | 'manual'
  fecha             date,
  placa             text,
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
alter table public.devoluciones add column if not exists tipo text;
alter table public.devoluciones add column if not exists cantidad numeric(12,2);
alter table public.devoluciones add column if not exists valor numeric(14,2) default 0;
create index if not exists devoluciones_ruta_idx on public.devoluciones (ruta_id);

-- ---------------------------------------------------------------------
-- REENVIOS: registro manual con consolidado propio
-- ---------------------------------------------------------------------
create table if not exists public.reenvios (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  ruta_id         uuid not null references public.rutas(id) on delete cascade,
  numero_factura  text,
  valor_total     numeric(14,2) default 0,
  fecha           date
);
create index if not exists reenvios_ruta_idx on public.reenvios (ruta_id);

-- ---------------------------------------------------------------------
-- SEGURIDAD (RLS): la app usa la llave "anon" y solo INSERTA.
-- Leer los datos se hace desde el panel de Supabase (o con la llave service_role).
-- ---------------------------------------------------------------------
alter table public.rutas        enable row level security;
alter table public.facturas     enable row level security;
alter table public.devoluciones enable row level security;
alter table public.reenvios     enable row level security;

-- (el id de la ruta se genera en la app, así no se necesita permiso de lectura)
drop policy if exists "app inserta rutas"        on public.rutas;
drop policy if exists "app lee ruta insertada"   on public.rutas;
drop policy if exists "app inserta facturas"     on public.facturas;
drop policy if exists "app inserta devoluciones" on public.devoluciones;
drop policy if exists "app inserta reenvios"     on public.reenvios;

create policy "app inserta rutas"        on public.rutas        for insert to anon with check (true);
create policy "app inserta facturas"     on public.facturas     for insert to anon with check (true);
create policy "app inserta devoluciones" on public.devoluciones for insert to anon with check (true);
create policy "app inserta reenvios"     on public.reenvios     for insert to anon with check (true);

-- La versión 1 usaba la tabla factura_items (productos por factura).
-- La versión 2 ya no la usa; se puede conservar como histórico o borrar con:
-- drop table if exists public.factura_items;

-- ---------------------------------------------------------------------
-- Vista útil para consultar: facturas con datos de su ruta
-- (security_invoker: respeta RLS, la llave anon no puede leerla)
-- ---------------------------------------------------------------------
create or replace view public.v_facturas_ruta with (security_invoker = true) as
select r.fecha as fecha_ruta, r.planilla, r.placa, r.conductor, r.auxiliar,
       f.numero_factura, f.cliente, f.vendedor, f.sucursal_despacho,
       f.valor_factura, f.total_descuentos, f.retencion, f.saldo_favor, f.valor_devuelto,
       f.forma_pago, f.estado_entrega, f.causal, f.valor_pagado, f.confirmada
from public.facturas f
join public.rutas r on r.id = f.ruta_id;
