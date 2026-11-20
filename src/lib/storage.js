/* Persistencia en IndexedDB (aguanta fotos de comprobantes y firmas, a diferencia de localStorage).
   Si IndexedDB no está disponible se usa localStorage como respaldo. */
import { uid, num, todayStr } from "./utils.js";
import { VENDEDORES_DEFAULT } from "./constants.js";
import PRODUCTOS_SEED from "../data/productos-seed.json";

const DB_NAME = "rutas-liconsumar";
const STORE = "kv";
const STATE_KEY = "app_state_v2";
const PENDING_KEY = "pending_sync_v2";

let dbPromise = null;
function openDb() {
  if (!("indexedDB" in window)) return Promise.reject(new Error("sin indexedDB"));
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function idbGet(key) {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const r = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : undefined;
  }
}

async function idbSet(key, value) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    localStorage.setItem(key, JSON.stringify(value));
  }
}

export function emptyRoute(auxiliar = "") {
  return { auxiliar, conductor: "", placa: "", fecha: todayStr(), planilla: "", rutaId: "" };
}

export function initialState() {
  return {
    session: { auxiliar: "", usuario: "", pin: "" },
    auxiliares: [],
    route: emptyRoute(),
    facturas: [],
    devoluciones: [],
    reenvios: [],
    clientes: [],
    productos: PRODUCTOS_SEED.map((p) => ({ codigo: p.codigo, nombre: p.nombre, valorUnitario: p.valor, codigoBarras: "" })),
    vendedores: VENDEDORES_DEFAULT.slice(),
    calcEfectivo: {}
  };
}

/* Convierte una factura de la versión anterior (con productos) al formato nuevo */
export function migrateFactura(f) {
  const valorItems = (f.items || []).reduce((s, it) => s + num(it.valorUnitario) * num(it.cantidad), 0);
  return {
    id: f.id || uid("fac"),
    numero: f.numero || "",
    fecha: f.fecha || "",
    sucursal: f.sucursal || "",
    planilla: f.planilla || "",
    cliente: f.cliente || "",
    vendedor: f.vendedor || "",
    direccion: f.direccion || "",
    barrio: f.barrio || "",
    ciudad: f.ciudad || "",
    telefono: f.telefono || "",
    valorFactura: f.valorFactura != null ? num(f.valorFactura) : valorItems,
    descuentos: f.descuentos || [],
    retencion: num(f.retencion),
    saldoFavor: num(f.saldoFavor),
    formaPago: f.formaPago || "",
    mixtoTransferencia: num(f.mixtoTransferencia),
    mixtoEfectivo: num(f.mixtoEfectivo),
    transferenciaFoto: f.transferenciaFoto || null,
    estado: f.estado || "OK",
    causal: f.causal || "",
    firma: f.firma || null,
    observaciones: f.observaciones || "",
    confirmada: !!f.confirmada,
    obsequio: !!f.obsequio,
    obsequioDetalle: f.obsequioDetalle || "",
    lat: f.lat ?? null,
    lng: f.lng ?? null,
    entregadaAt: f.entregadaAt || null,
    refLat: f.refLat ?? null,
    refLng: f.refLng ?? null
  };
}

/* Lee los datos de la app anterior (localStorage rl_*) una sola vez */
function migrateLegacy(state) {
  const read = (k) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : null; } catch { return null; } };
  const productos = read("rl_productos");
  const clientes = read("rl_clientes");
  const vendedores = read("rl_vendedores");
  const work = read("rl_route_work");
  if (!productos && !clientes && !vendedores && !work) return state;
  const next = { ...state };
  if (productos) next.productos = productos;
  if (clientes) next.clientes = clientes;
  if (vendedores) next.vendedores = vendedores;
  if (work) {
    const r = work.route || {};
    next.route = { ...emptyRoute(), conductor: r.entregador || "", placa: r.placa || "", fecha: r.fecha || todayStr(), planilla: r.planilla || "" };
    const facturas = (work.facturas || []).map(migrateFactura);
    next.facturas = facturas;
    const byNumero = Object.fromEntries(facturas.map((f) => [f.numero, f.id]));
    next.devoluciones = (work.devoluciones || []).map((d) => ({
      ...d,
      facturaId: byNumero[d.factura] || null,
      tipo: d.descripcion === "DEVOLUCIÓN TOTAL DE FACTURA" ? "total" : "parcial",
      valor: num(d.valor)
    }));
    next.reenvios = work.reenvios || [];
  }
  return next;
}

export async function loadState() {
  const saved = await idbGet(STATE_KEY);
  if (saved) return { ...initialState(), ...saved, facturas: (saved.facturas || []).map(migrateFactura) };
  return migrateLegacy(initialState());
}

let saveTimer = null;
export function saveStateDebounced(state) {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => idbSet(STATE_KEY, state), 250);
}
export function saveStateNow(state) {
  clearTimeout(saveTimer);
  return idbSet(STATE_KEY, state);
}

/* ---------- Rutas pendientes por subir a Supabase (cuando no hay internet) ---------- */
export async function getPending() {
  return (await idbGet(PENDING_KEY)) || [];
}
export async function setPending(list) {
  await idbSet(PENDING_KEY, list);
}
