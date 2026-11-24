import { CAUSALES } from "../lib/constants.js";
/* Cálculos del panel de administrador a partir del dataset de Supabase */
const ENTREGADA = (f) => f.confirmada && (f.estado === "OK" || f.estado === "Dev Parcial");
const esDev = (f) => f.estado === "Dev Parcial" || f.estado === "Dev Total";
const key = (s) => String(s || "").trim().toUpperCase();
const num = (n) => Number(n) || 0;

/* Aplica filtros del usuario (auxiliar, cliente) al dataset */
export function filtrar(ds, { aux = "", cliente = "" } = {}) {
  if (!ds) return { rutas: [], facturas: [], devoluciones: [] };
  const rutasPorId = Object.fromEntries(ds.rutas.map((r) => [r.id, r]));
  let rutas = ds.rutas;
  if (aux) rutas = rutas.filter((r) => key(r.auxiliar) === key(aux));
  const ids = new Set(rutas.map((r) => r.id));
  const c = key(cliente);
  const facturas = ds.facturas
    .filter((f) => ids.has(f.ruta_id) && (!c || key(f.cliente).includes(c)))
    .map((f) => ({ ...f, ruta: rutasPorId[f.ruta_id] }));
  const devoluciones = ds.devoluciones.filter((d) => ids.has(d.ruta_id) && (!c || key(d.cliente).includes(c)));
  return { rutas, facturas, devoluciones };
}

export function resumen({ rutas, facturas, devoluciones }) {
  const abiertas = rutas.filter((r) => r.estado !== "cerrada");
  const gestionadas = facturas.filter((f) => f.confirmada).length;
  const entregadas = facturas.filter(ENTREGADA).length;
  return {
    rutas: rutas.length,
    rutasCerradas: rutas.length - abiertas.length,
    vehiculosActivos: new Set(abiertas.map((r) => key(r.placa)).filter(Boolean)).size,
    facturas: facturas.length,
    entregadas,
    pendientes: facturas.length - gestionadas,
    conDevolucion: facturas.filter((f) => f.confirmada && esDev(f)).length,
    clientesNovedad: new Set(devoluciones.map((d) => key(d.cliente)).filter(Boolean)).size,
    unidadesDevueltas: devoluciones.reduce((s, d) => s + num(d.cantidad), 0),
    valorDevuelto: devoluciones.reduce((s, d) => s + num(d.valor), 0),
    valorFacturado: facturas.reduce((s, f) => s + num(f.valor), 0),
    recaudo: facturas.filter((f) => f.confirmada).reduce((s, f) => s + num(f.valor_pagado), 0),
    efectividad: gestionadas ? Math.round((entregadas / gestionadas) * 100) : 0
  };
}

/* Ranking de auxiliares: más entregas efectivas y menos devoluciones arriba */
export function rankingAuxiliares({ rutas, facturas, devoluciones }) {
  const m = new Map();
  const get = (name) => {
    const k = key(name) || "SIN AUXILIAR";
    if (!m.has(k)) m.set(k, { auxiliar: k, rutas: 0, facturas: 0, gestionadas: 0, entregadas: 0, devParciales: 0, devTotales: 0, reenvios: 0, pendientes: 0, unidades: 0, valorDev: 0, valorFacturado: 0 });
    return m.get(k);
  };
  rutas.forEach((r) => { get(r.auxiliar).rutas++; });
  facturas.forEach((f) => {
    const a = get(f.ruta && f.ruta.auxiliar);
    a.facturas++;
    a.valorFacturado += num(f.valor);
    if (!f.confirmada) { a.pendientes++; return; }
    a.gestionadas++;
    if (ENTREGADA(f)) a.entregadas++;
    if (f.estado === "Dev Parcial") a.devParciales++;
    if (f.estado === "Dev Total") a.devTotales++;
    if (f.estado === "Reenvío") a.reenvios++;
  });
  const rutaAux = Object.fromEntries(rutas.map((r) => [r.id, r.auxiliar]));
  devoluciones.forEach((d) => {
    const a = get(rutaAux[d.ruta_id] || d.auxiliar);
    a.unidades += num(d.cantidad);
    a.valorDev += num(d.valor);
  });
  return [...m.values()]
    .map((a) => ({
      ...a,
      devoluciones: a.devParciales + a.devTotales,
      pctEfectividad: a.gestionadas ? Math.round((a.entregadas / a.gestionadas) * 1000) / 10 : 0,
      pctDevolucion: a.gestionadas ? Math.round(((a.devParciales + a.devTotales) / a.gestionadas) * 1000) / 10 : 0
    }))
    .sort((x, y) => (y.gestionadas ? 1 : 0) - (x.gestionadas ? 1 : 0) || y.pctEfectividad - x.pctEfectividad || y.entregadas - x.entregadas || x.valorDev - y.valorDev)
    .map((a, i) => ({ ...a, puesto: i + 1 }));
}

/* Clientes con más devoluciones */
export function rankingClientes({ devoluciones }) {
  const m = new Map();
  devoluciones.forEach((d) => {
    const k = key(d.cliente) || "SIN CLIENTE";
    if (!m.has(k)) m.set(k, { cliente: k, facturas: new Set(), unidades: 0, valor: 0, ultima: "", auxiliares: new Set() });
    const c = m.get(k);
    c.facturas.add(d.factura);
    c.unidades += num(d.cantidad);
    c.valor += num(d.valor);
    if (d.fecha && d.fecha > c.ultima) c.ultima = d.fecha;
    if (d.auxiliar) c.auxiliares.add(key(d.auxiliar));
  });
  return [...m.values()]
    .map((c) => ({ cliente: c.cliente, facturas: c.facturas.size, unidades: c.unidades, valor: c.valor, ultima: c.ultima, auxiliares: [...c.auxiliares].join(", ") }))
    .sort((a, b) => b.valor - a.valor || b.facturas - a.facturas);
}

/* Detalle de cada devolución: qué, quién, cuándo, planilla y vehículo */
export function detalleDevoluciones({ devoluciones }) {
  return [...devoluciones]
    .sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || "")))
    .map((d) => ({
      fecha: d.fecha || "", auxiliar: key(d.auxiliar), planilla: d.planilla || "", placa: key(d.placa), cliente: key(d.cliente),
      factura: d.factura || "", tipo: d.tipo === "total" ? "Total" : "Parcial", causal: d.causal || "", producto: d.producto || "",
      cantidad: d.cantidad == null ? "" : num(d.cantidad), valor: num(d.valor)
    }));
}

export function entregasPorDia({ facturas }) {
  const m = new Map();
  facturas.forEach((f) => {
    const d = f.ruta && f.ruta.fecha;
    if (!d || !f.confirmada) return;
    if (!m.has(d)) m.set(d, { fecha: d, entregas: 0, devoluciones: 0 });
    const x = m.get(d);
    if (ENTREGADA(f)) x.entregas++;
    if (esDev(f)) x.devoluciones++;
  });
  return [...m.values()].sort((a, b) => a.fecha.localeCompare(b.fecha));
}

export function porEstado({ facturas }) {
  const c = { OK: 0, "Dev Parcial": 0, "Dev Total": 0, "Reenvío": 0, Pendiente: 0 };
  facturas.forEach((f) => { c[f.confirmada ? f.estado : "Pendiente"]++; });
  return c;
}

export function vehiculos({ rutas, facturas }) {
  const prog = new Map();
  facturas.forEach((f) => {
    const p = prog.get(f.ruta_id) || { total: 0, hechas: 0 };
    p.total++; if (f.confirmada) p.hechas++;
    prog.set(f.ruta_id, p);
  });
  return rutas
    .map((r) => ({ ...r, ...(prog.get(r.id) || { total: 0, hechas: 0 }) }))
    .map((r) => ({ ...r, pct: r.total ? Math.round((r.hechas / r.total) * 100) : 0 }));
}

export function actividadReciente({ facturas }, n = 7) {
  return facturas.filter((f) => f.confirmada && f.entregada_at)
    .sort((a, b) => String(b.entregada_at).localeCompare(String(a.entregada_at))).slice(0, n);
}

export const fmtMoney = (n) => "$" + (Number(n) || 0).toLocaleString("es-CO", { maximumFractionDigits: 0 });

/* ---------- Destacados del dashboard (según el rango de fechas elegido) ---------- */
const pct1 = (n, t) => (t ? Math.round((n / t) * 1000) / 10 : 0);

/* Convierte un Map nombre -> cantidad en lista con porcentaje, de mayor a menor (o al revés con asc).
   items = solo los que tienen datos; todos = también los que están en 0 (universo completo) */
function lista(m, asc, universo = []) {
  const total = [...m.values()].reduce((s, n) => s + n, 0);
  const ord = (l) => (asc ? l.reverse() : l);
  const mk = (mm) => ord([...mm.entries()].map(([nombre, cantidad]) => ({ nombre, cantidad, pct: pct1(cantidad, total) }))
    .sort((a, b) => b.cantidad - a.cantidad || a.nombre.localeCompare(b.nombre)));
  const completo = new Map(m);
  universo.forEach((n) => { if (n && !completo.has(n)) completo.set(n, 0); });
  return { total, items: mk(m), todos: mk(completo) };
}
const suma = (m, k) => m.set(k, (m.get(k) || 0) + 1);

export function destacados({ rutas = [], facturas, devoluciones }, asc = false) {
  const entregas = new Map(), devs = new Map(), clientes = new Map(), causales = new Map(), vendedores = new Map();
  facturas.forEach((f) => {
    const a = key(f.ruta && f.ruta.auxiliar) || "SIN AUXILIAR";
    if (ENTREGADA(f)) suma(entregas, a);
    if (f.confirmada && esDev(f)) { suma(devs, a); suma(vendedores, key(f.vendedor) || "SIN VENDEDOR"); }
  });
  // una factura cuenta una sola vez por cliente y una sola vez por causal
  const vistoCli = new Set(), vistoCau = new Set();
  const causalFact = new Map(facturas.filter((f) => f.causal).map((f) => [f.ruta_id + "|" + f.numero, f.causal]));
  devoluciones.forEach((d) => {
    const fk = d.ruta_id + "|" + d.factura;
    const c = key(d.cliente) || "SIN CLIENTE";
    if (!vistoCli.has(fk)) { vistoCli.add(fk); suma(clientes, c); }
    if (!vistoCau.has(fk)) { vistoCau.add(fk); suma(causales, String(d.causal || causalFact.get(fk) || "Sin causal").trim()); }
  });
  const uAux = [...new Set(rutas.map((r) => key(r.auxiliar)).filter(Boolean))];
  return {
    entregas: lista(entregas, asc, uAux),
    devs: lista(devs, asc, uAux),
    vendedores: lista(vendedores, asc, [...new Set(facturas.map((f) => key(f.vendedor)).filter(Boolean))]),
    clientes: lista(clientes, asc, [...new Set(facturas.map((f) => key(f.razon_social || f.cliente)).filter(Boolean))]),
    causales: lista(causales, asc, CAUSALES)
  };
}
