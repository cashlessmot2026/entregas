/* Acceso a Supabase. Las tablas no son accesibles con la llave pública: todo pasa por funciones
   RPC que validan en el servidor la contraseña del admin o el usuario + PIN del auxiliar.
   Si al guardar la ruta no hay internet, queda en cola (IndexedDB) y se reintenta sola. */
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./constants.js";
import { computeCuadre, facturaValor, facturaTotalDescuentos, facturaDevParcialValor, facturaSaldoAPagar } from "./calc.js";
import { getPending, setPending } from "./storage.js";

let clientPromise = null;
function getClient() {
  if (!clientPromise) {
    clientPromise = import("@supabase/supabase-js").then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } }));
  }
  return clientPromise;
}

async function rpc(fn, args) {
  const supa = await getClient();
  const { data, error } = await supa.rpc(fn, args);
  if (error) throw new Error(error.message || "Error de conexión con Supabase");
  return data;
}

export function newUuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* ---------------- ADMINISTRADOR ---------------- */
export const adminApi = {
  login: (pass) => rpc("admin_login", { p_pass: pass }),
  cambiarPass: (pass, nueva) => rpc("admin_cambiar_pass", { p_pass: pass, p_nueva: nueva }),
  dataset: (pass, desde, hasta) => rpc("admin_dataset", { p_pass: pass, p_desde: desde || null, p_hasta: hasta || null }),
  cargarRutas: (pass, rutas) => rpc("admin_cargar_rutas", { p_pass: pass, p_rutas: rutas }),
  eliminarRuta: (pass, id) => rpc("admin_eliminar_ruta", { p_pass: pass, p_id: id }),
  listarAuxiliares: (pass) => rpc("admin_listar_auxiliares", { p_pass: pass }),
  guardarAuxiliar: (pass, a) => rpc("admin_guardar_auxiliar", {
    p_pass: pass, p_id: a.id || null, p_nombre: a.nombre, p_usuario: a.usuario,
    p_pin: a.pin || "", p_telefono: a.telefono || "", p_activo: a.activo !== false
  }),
  importarAuxiliares: (pass, items) => rpc("admin_importar_auxiliares", { p_pass: pass, p_items: items }),
  eliminarAuxiliar: (pass, id) => rpc("admin_eliminar_auxiliar", { p_pass: pass, p_id: id }),
  ubicaciones: (pass, minutos = 30) => rpc("admin_ubicaciones", { p_pass: pass, p_minutos: minutos })
};

/* ---------------- AUXILIAR ---------------- */
export const auxApi = {
  login: (usuario, pin) => rpc("aux_login", { p_usuario: usuario, p_pin: pin }),
  rutas: (usuario, pin) => rpc("aux_rutas", { p_usuario: usuario, p_pin: pin }),
  /* p = null apaga el seguimiento; si no, { lat, lng, precision, velocidad } */
  ubicacion: (usuario, pin, placa, planilla, p) => rpc("aux_ubicacion", {
    p_usuario: usuario, p_pin: pin, p_placa: placa || "", p_planilla: planilla || "",
    p_lat: p ? p.lat : null, p_lng: p ? p.lng : null, p_precision: p ? p.precision ?? null : null, p_velocidad: p ? p.velocidad ?? null : null
  })
};

/* ---------------- GUARDADO DE LA RUTA ---------------- */
const nul = (v) => (v === "" || v === undefined ? null : v);

export function buildRutaSnapshot(state, { cerrar = true } = {}) {
  const { route, session } = state;
  return {
    rutaId: route.rutaId || newUuid(),
    savedAt: new Date().toISOString(),
    usuario: session.usuario,
    pin: session.pin,
    cerrar,
    route,
    facturas: state.facturas,
    devoluciones: state.devoluciones,
    reenvios: state.reenvios
  };
}

/* Convierte el snapshot al formato que espera la función aux_guardar_ruta.
   En sincronizaciones de avance no se envían firmas ni fotos (pesan mucho). */
export function snapshotToPayload(snap) {
  const { route, facturas, devoluciones, reenvios } = snap;
  const liviano = !snap.cerrar;
  const cuadre = computeCuadre(facturas, devoluciones);
  return {
    ruta_id: snap.rutaId,
    route: { fecha: nul(route.fecha), planilla: route.planilla || "", placa: route.placa || "", conductor: route.conductor || "" },
    valor_total_planilla: cuadre.valorTotalPlanilla,
    total_a_legalizar: cuadre.totalALegalizar,
    total_efectivo: cuadre.totalEfectivo,
    cuadre: Object.fromEntries(Object.entries(cuadre.buckets).map(([k, b]) => [k, { count: b.count, valor: b.valor }])),
    facturas: facturas.map((f) => ({
      numero_factura: f.numero,
      fecha: nul(f.fecha),
      planilla: f.planilla || "",
      sucursal_despacho: f.sucursal || "",
      cliente: f.cliente || "",
      vendedor: f.vendedor || "",
      direccion: f.direccion || "",
      barrio: f.barrio || "",
      ciudad: f.ciudad || "",
      telefono: f.telefono || "",
      valor_factura: facturaValor(f),
      descuentos: f.descuentos || [],
      total_descuentos: facturaTotalDescuentos(f),
      retencion: Number(f.retencion) || 0,
      saldo_favor: Number(f.saldoFavor) || 0,
      valor_devuelto: facturaDevParcialValor(f, devoluciones),
      forma_pago: f.formaPago || "",
      mixto_transferencia: Number(f.mixtoTransferencia) || 0,
      mixto_efectivo: Number(f.mixtoEfectivo) || 0,
      comprobante_pago: liviano ? null : f.transferenciaFoto || null,
      estado_entrega: f.estado,
      causal: f.causal || "",
      valor_pagado: facturaSaldoAPagar(f, devoluciones),
      firma_digital: liviano ? null : f.firma || null,
      observaciones: f.observaciones || "",
      confirmada: !!f.confirmada,
      obsequio: !!f.obsequio,
      obsequio_detalle: f.obsequioDetalle || "",
      lat: f.lat ?? null,
      lng: f.lng ?? null,
      entregada_at: f.entregadaAt || null
    })),
    devoluciones: devoluciones.map((d) => ({
      tipo: d.tipo,
      fecha: nul(d.fecha),
      cliente: d.cliente || "",
      factura: d.factura || "",
      asesor: d.asesor || "",
      causal: d.causal || "",
      codigo_producto: d.codigoProducto || "",
      descripcion: d.descripcion || "",
      cantidad: d.cantidad === "" || d.cantidad == null ? null : Number(d.cantidad),
      valor: Number(d.valor) || 0,
      firma: liviano ? null : d.firma || null
    })),
    reenvios: reenvios.map((r) => ({ numero: r.numero, valor: Number(r.valor) || 0, fecha: nul(r.fecha) }))
  };
}

async function uploadSnapshot(snap) {
  const res = await rpc("aux_guardar_ruta", {
    p_usuario: snap.usuario, p_pin: snap.pin, p_data: snapshotToPayload(snap), p_cerrar: snap.cerrar !== false
  });
  return res;
}

/* Cierra la ruta. Devuelve { ok, queued, error } */
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
    // si es un error de credenciales no tiene sentido reintentar solo
    await setPending([...(await getPending()), snap]);
    return { ok: false, queued: true, error: e };
  }
}

/* Sincroniza el avance sin cerrar la ruta (el admin lo ve casi en tiempo real). No lanza errores. */
export async function sincronizarAvance(snap) {
  if (!navigator.onLine) return false;
  try { await uploadSnapshot({ ...snap, cerrar: false }); return true; }
  catch (e) { console.warn("Sincronización de avance:", e); return false; }
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
