/* Indicadores trimestrales de despachos y devoluciones (equivalen a las hojas del Excel "INDICADORES DE DESPACHOS Y DEVOLUCION"),
   calculados con los datos reales de la aplicación. Despachados = facturas de las rutas; devueltos = facturas con Dev Parcial o Dev Total. */
export const MESES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];
export const TRIMESTRES = ["Primer trimestre", "Segundo trimestre", "Tercer trimestre", "Cuarto trimestre"];
const K = (s) => String(s || "").trim().toUpperCase();
const esDev = (f) => f.confirmada && (f.estado === "Dev Parcial" || f.estado === "Dev Total");

/* Una fila por factura despachada */
export function filasIndicadores(ds) {
  if (!ds) return [];
  const rutas = Object.fromEntries(ds.rutas.map((r) => [r.id, r]));
  const causalDev = new Map();
  ds.devoluciones.forEach((d) => { const k = d.ruta_id + "|" + d.factura; if (d.causal && !causalDev.has(k)) causalDev.set(k, String(d.causal).trim()); });
  const filas = [];
  ds.facturas.forEach((f) => {
    const r = rutas[f.ruta_id];
    if (!r || !r.fecha) return;
    const mes = Number(String(r.fecha).slice(5, 7));
    if (!mes) return;
    const dev = esDev(f);
    filas.push({
      mes, trim: Math.ceil(mes / 3), vendedor: K(f.vendedor) || "SIN VENDEDOR", entregador: K(r.auxiliar || r.conductor) || "SIN ENTREGADOR",
      ruta: K(r.placa) || "SIN VEHÍCULO", dev, numero: f.numero,
      causal: dev ? K(causalDev.get(f.ruta_id + "|" + f.numero) || f.causal) || "SIN CAUSAL" : ""
    });
  });
  return filas;
}

/* Aplica los ajustes del admin: nombres cambiados, datos ocultos y registros manuales del año.
   ajustes = { alias: { vendedor|entregador|causal|ruta: { ORIGINAL: NUEVO } }, ocultos: { vendedor: [], ... },
               manuales: [{ id, anio, mes, vendedor, entregador, causal, ruta, despachados, devueltos }] } */
export function aplicarAjustes(filas, aj = {}, anio) {
  const al = aj.alias || {}, oc = aj.ocultos || {};
  const ren = (c, v) => (al[c] && al[c][v]) || v;
  let out = filas.map((f) => ({ ...f, vendedor: ren("vendedor", f.vendedor), entregador: ren("entregador", f.entregador), ruta: ren("ruta", f.ruta), causal: f.causal ? ren("causal", f.causal) : "" }));
  out = out.filter((f) => !(oc.vendedor || []).includes(f.vendedor) && !(oc.entregador || []).includes(f.entregador));
  (aj.manuales || []).filter((m) => Number(m.anio) === Number(anio)).forEach((m) => {
    const mes = Number(m.mes), d = Math.min(200000, Math.max(0, Math.round(Number(m.despachados) || 0))), v = Math.min(d || 200000, Math.max(0, Math.round(Number(m.devueltos) || 0)));
    if (!mes) return;
    const base = { mes, trim: Math.ceil(mes / 3), vendedor: K(m.vendedor) || "SIN VENDEDOR", entregador: K(m.entregador) || "SIN ENTREGADOR", ruta: K(m.ruta) || "SIN VEHÍCULO", manual: true };
    for (let i = 0; i < Math.max(0, d - v); i++) out.push({ ...base, dev: false, causal: "" });
    for (let i = 0; i < v; i++) out.push({ ...base, dev: true, causal: K(m.causal) || "SIN CAUSAL" });
  });
  return out;
}

const agrupar = (filas, campo) => {
  const m = new Map();
  filas.forEach((f) => {
    const k = f[campo];
    if (!m.has(k)) m.set(k, { nombre: k, despachados: 0, devueltos: 0 });
    const x = m.get(k); x.despachados++; if (f.dev) x.devueltos++;
  });
  return [...m.values()].map((x) => ({ ...x, pct: x.despachados ? x.devueltos / x.despachados : 0 }));
};
const totalDe = (l) => { const d = l.reduce((s, x) => s + x.despachados, 0), v = l.reduce((s, x) => s + x.devueltos, 0); return { nombre: "Total general", despachados: d, devueltos: v, pct: d ? v / d : 0 }; };

/* Tabla causal/ruta × columnas (meses o trimestres) para las devoluciones */
function cruce(filas, campo, cols) {
  const m = new Map();
  filas.filter((f) => f.dev).forEach((f) => {
    const k = f[campo];
    if (!m.has(k)) m.set(k, { nombre: k, v: cols.map(() => 0), total: 0 });
    const x = m.get(k), i = cols.findIndex((c) => c.test(f));
    if (i >= 0) { x.v[i]++; x.total++; }
  });
  const all = [...m.values()];
  const total = all.reduce((s, x) => s + x.total, 0);
  return {
    filas: all.map((x) => ({ ...x, pct: total ? x.total / total : 0 })).sort((a, b) => b.total - a.total || a.nombre.localeCompare(b.nombre)),
    totales: cols.map((_, i) => all.reduce((s, x) => s + x.v[i], 0)), total
  };
}

/* filtros: { trim: 0 = todo el año | 1..4, mes: 0 = todos | 1..12, vendedor, entregador } */
export function calcularIndicadores(filasAnio, { trim = 0, mes = 0, vendedor = "", entregador = "", ocultos = {} } = {}) {
  const visCau = (f) => !(ocultos.causal || []).includes(f.causal), visRuta = (f) => !(ocultos.ruta || []).includes(f.ruta);
  const base = filasAnio.filter((f) => (!vendedor || f.vendedor === vendedor) && (!entregador || f.entregador === entregador));
  const sel = base.filter((f) => (!trim || f.trim === trim) && (!mes || f.mes === mes));
  const meses = (trim ? [1, 2, 3].map((i) => (trim - 1) * 3 + i) : MESES.map((_, i) => i + 1)).filter((m) => !mes || m === mes);

  // por mes, con VAR % = % del mes anterior − % del mes actual (positivo = mejoró)
  const porMesAll = new Map(agrupar(base, "mes").map((x) => [x.nombre, x]));
  const porMes = meses.map((m) => {
    const x = porMesAll.get(m) || { despachados: 0, devueltos: 0, pct: 0 };
    const ant = porMesAll.get(m === 1 ? 0 : m - 1);
    return { ...x, nombre: MESES[m - 1], mes: m, var: ant && x.despachados ? ant.pct - x.pct : null };
  });
  const colsMes = meses.map((m) => ({ nombre: MESES[m - 1], test: (f) => f.mes === m }));

  const porTrimAll = new Map(agrupar(base, "trim").map((x) => [x.nombre, x]));
  const porTrim = [1, 2, 3, 4].map((t) => {
    const x = porTrimAll.get(t) || { despachados: 0, devueltos: 0, pct: 0 };
    const ant = porTrimAll.get(t - 1);
    return { ...x, nombre: TRIMESTRES[t - 1], trim: t, var: ant && x.despachados ? ant.pct - x.pct : null };
  });
  const colsTrim = [1, 2, 3, 4].map((t) => ({ nombre: TRIMESTRES[t - 1], test: (f) => f.trim === t }));

  const ord = (l) => l.sort((a, b) => b.pct - a.pct || b.despachados - a.despachados || a.nombre.localeCompare(b.nombre));
  return {
    porMes, totalMes: totalDe(porMes),
    causales: { cols: colsMes.map((c) => c.nombre), ...cruce(sel.filter(visCau), "causal", colsMes) },
    rutas: { cols: colsMes.map((c) => c.nombre), ...cruce(sel.filter(visRuta), "ruta", colsMes) },
    vendedores: ord(agrupar(sel, "vendedor")), entregadores: ord(agrupar(sel, "entregador")), totalSel: totalDe(agrupar(sel, "mes")),
    porTrim, totalTrim: totalDe(porTrim),
    causalesTrim: { cols: colsTrim.map((c) => c.nombre), ...cruce(base.filter(visCau), "causal", colsTrim) },
    vendedoresLista: [...new Set(filasAnio.map((f) => f.vendedor))].sort(),
    entregadoresLista: [...new Set(filasAnio.map((f) => f.entregador))].sort()
  };
}
