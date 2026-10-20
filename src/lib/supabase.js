/* Guardado de la ruta en Supabase. Si no hay internet o falla, la ruta queda
   en cola (IndexedDB) y se reintenta automáticamente cuando vuelve la conexión. */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants.js";
import { computeCuadre, facturaValor, facturaTotalDescuentos, facturaDevParcialValor, facturaSaldoAPagar } from "./calc.js";
import { getPending, setPending } from "./storage.js";

let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) => createClient(SUPABASE_URL, SUPABASE_ANON_KEY));
  }
  return clientPromise;
}

function newUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function buildRutaSnapshot(state) {
  return {
    rutaId: newUuid(),
    savedAt: new Date().toISOString(),
    route: state.route,
    facturas: state.facturas,
    devoluciones: state.devoluciones,
    reenvios: state.reenvios
  };
}

async function uploadSnapshot(snap) {
  const supa = await getClient();
  const { route, facturas, devoluciones, reenvios } = snap;
  const cuadre = computeCuadre(facturas, devoluciones);

  // el id se genera aquí: no hace falta leer la fila insertada (la llave anon solo inserta)
  const rutaId = snap.rutaId;
  const { error: errRuta } = await supa.from("rutas").insert({
    id: rutaId,
    auxiliar: route.auxiliar,
    conductor: route.conductor,
    placa: route.placa,
    fecha: route.fecha || null,
    planilla: route.planilla,
    valor_total_planilla: cuadre.valorTotalPlanilla,
    total_a_legalizar: cuadre.totalALegalizar,
    total_efectivo: cuadre.totalEfectivo,
    cta_total_facturas: facturas.length,
    cuadre: Object.fromEntries(Object.entries(cuadre.buckets).map(([k, b]) => [k, { count: b.count, valor: b.valor }]))
  });
  if (errRuta && errRuta.code !== "23505") throw errRuta; // 23505 = ya subida en un intento anterior

  if (facturas.length) {
    const { error } = await supa.from("facturas").insert(facturas.map((f) => ({
      ruta_id: rutaId,
      numero_factura: f.numero,
      fecha: f.fecha || null,
      planilla: f.planilla,
      sucursal_despacho: f.sucursal,
      cliente: f.cliente,
      vendedor: f.vendedor,
      direccion: f.direccion,
      barrio: f.barrio,
      ciudad: f.ciudad,
      telefono: f.telefono,
      valor_factura: facturaValor(f),
      descuentos: f.descuentos || [],
      total_descuentos: facturaTotalDescuentos(f),
      retencion: f.retencion,
      saldo_favor: f.saldoFavor,
      valor_devuelto: facturaDevParcialValor(f, devoluciones),
      forma_pago: f.formaPago,
      mixto_transferencia: f.mixtoTransferencia,
      mixto_efectivo: f.mixtoEfectivo,
      comprobante_pago: f.transferenciaFoto,
      estado_entrega: f.estado,
      causal: f.causal,
      valor_pagado: facturaSaldoAPagar(f, devoluciones),
      firma_digital: f.firma,
      observaciones: f.observaciones,
      confirmada: f.confirmada
    })));
    if (error) throw error;
  }

  if (devoluciones.length) {
    const { error } = await supa.from("devoluciones").insert(devoluciones.map((d) => ({
      ruta_id: rutaId,
      tipo: d.tipo,
      fecha: d.fecha || null,
      placa: d.placa,
      cliente: d.cliente,
      factura: d.factura,
      asesor_comercial: d.asesor,
      causal: d.causal,
      codigo_producto: d.codigoProducto,
      descripcion: d.descripcion,
      cantidad: d.cantidad,
      valor: d.valor,
      firma_cliente: d.firma
    })));
    if (error) throw error;
  }

  if (reenvios.length) {
    const { error } = await supa.from("reenvios").insert(reenvios.map((r) => ({
      ruta_id: rutaId, numero_factura: r.numero, valor_total: r.valor, fecha: r.fecha || null
    })));
    if (error) throw error;
  }
}

/* Devuelve { ok, queued } */
export async function guardarRuta(snap) {
  if (!navigator.onLine) {
    await setPending([...(await getPending()), snap]);
    return { ok: false, queued: true };
  }
  try {
    await uploadSnapshot(snap);
    return { ok: true, queued: false };
  } catch (e) {
    console.error("Supabase:", e);
    await setPending([...(await getPending()), snap]);
    return { ok: false, queued: true, error: e };
  }
}

/* Sube las rutas que quedaron en cola. Devuelve cuántas se subieron. */
let syncing = false;
export async function syncPending() {
  if (syncing || !navigator.onLine) return 0;
  syncing = true;
  try {
    const list = await getPending();
    const rest = [];
    let sent = 0;
    for (const snap of list) {
      try { await uploadSnapshot(snap); sent++; } catch (e) { console.warn("Reintento fallido:", e); rest.push(snap); }
    }
    await setPending(rest);
    return sent;
  } finally {
    syncing = false;
  }
}
