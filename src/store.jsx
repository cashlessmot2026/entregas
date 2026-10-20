import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { loadState, saveStateDebounced, saveStateNow, emptyRoute } from "./lib/storage.js";
import { uid, num, normText } from "./lib/utils.js";
import { CAUSAL_DEV_TOTAL } from "./lib/constants.js";

const StoreCtx = createContext(null);
const ToastCtx = createContext(() => {});

export const useStore = () => useContext(StoreCtx);
export const useToast = () => useContext(ToastCtx);

const DEV_TOTAL_DESC = "DEVOLUCIÓN TOTAL DE FACTURA";

function findCliente(clientes, nombre) {
  const n = normText(nombre);
  return n ? clientes.find((c) => normText(c.nombre) === n) : null;
}

/* Crea o actualiza el cliente en la base de datos a partir de la factura */
function upsertCliente(clientes, f) {
  const nombre = (f.cliente || "").trim();
  if (!nombre) return clientes;
  const cli = findCliente(clientes, nombre);
  if (cli) {
    const patch = {};
    if (f.direccion && f.direccion !== cli.direccion) patch.direccion = f.direccion;
    if (f.telefono && !cli.telefono) patch.telefono = f.telefono;
    if (f.barrio && !cli.barrio) patch.barrio = f.barrio;
    if (f.vendedor && !cli.vendedor) patch.vendedor = f.vendedor;
    if (!Object.keys(patch).length) return clientes;
    return clientes.map((c) => (c.id === cli.id ? { ...c, ...patch } : c));
  }
  return [...clientes, {
    id: uid("cli"), nombre, negocio: f.sucursal || "", telefono: f.telefono || "",
    direccion: f.direccion || "", barrio: f.barrio || "", horario: "", vendedor: f.vendedor || ""
  }];
}

/* Mantiene el registro automático de "Dev Total" en el documento de devolución */
function syncDevTotal(devoluciones, f, route) {
  const rest = devoluciones.filter((d) => !(d.facturaId === f.id && d.tipo === "total"));
  if (f.estado !== "Dev Total") return rest;
  const prev = devoluciones.find((d) => d.facturaId === f.id && d.tipo === "total");
  return [...rest, {
    id: prev ? prev.id : uid("dev"),
    tipo: "total",
    facturaId: f.id,
    fecha: f.fecha || route.fecha,
    placa: route.placa,
    cliente: f.cliente,
    factura: f.numero,
    asesor: f.vendedor,
    causal: f.causal || CAUSAL_DEV_TOTAL,
    codigoProducto: "-",
    descripcion: DEV_TOTAL_DESC,
    cantidad: "",
    valor: num(f.valorFactura),
    firma: f.firma || null
  }];
}

function addVendedorTo(list, name) {
  const v = (name || "").trim().toUpperCase();
  return v && !list.includes(v) ? [...list, v] : list;
}

function createActions(set, get) {
  const patchFactura = (s, id, fn) => {
    let changed = null;
    const facturas = s.facturas.map((f) => (f.id === id ? (changed = fn(f)) : f));
    return { facturas, changed };
  };

  return {
    /* ---------- sesión del auxiliar ---------- */
    login(nombre) {
      const n = nombre.trim().toUpperCase();
      set((s) => ({
        ...s,
        session: { auxiliar: n, desde: new Date().toISOString() },
        auxiliares: s.auxiliares.includes(n) ? s.auxiliares : [...s.auxiliares, n],
        route: { ...s.route, auxiliar: n }
      }));
    },
    logout() {
      set((s) => ({ ...s, session: { auxiliar: "" } }));
    },

    /* ---------- ruta ---------- */
    updateRoute(field, value) {
      set((s) => ({ ...s, route: { ...s.route, [field]: value } }));
    },
    importPlanilla({ route, facturas }) {
      const s = get();
      const existentes = new Set(s.facturas.map((f) => String(f.numero)));
      const nuevas = facturas.filter((f) => !existentes.has(String(f.numero)));
      const repetidas = facturas.length - nuevas.length;
      set((st) => {
        const r = { ...st.route };
        // los datos de la ruta vienen de la planilla; solo se pisan los que estén vacíos
        if (route) {
          ["fecha", "placa", "conductor", "planilla"].forEach((k) => {
            if (route[k] && (!r[k] || !st.facturas.length)) r[k] = route[k];
          });
        }
        let vendedores = st.vendedores;
        let clientes = st.clientes;
        const completas = nuevas.map((f) => {
          vendedores = addVendedorTo(vendedores, f.vendedor);
          // si el cliente ya está registrado se traen su dirección y teléfono
          const cli = findCliente(clientes, f.cliente);
          const full = cli ? { ...f, direccion: cli.direccion || "", barrio: cli.barrio || "", telefono: cli.telefono || "" } : f;
          clientes = upsertCliente(clientes, full);
          return full;
        });
        return { ...st, route: r, vendedores, clientes, facturas: [...st.facturas, ...completas] };
      });
      return { nuevas: nuevas.length, repetidas };
    },
    resetRoute() {
      set((s) => ({
        ...s,
        route: emptyRoute(s.session.auxiliar),
        facturas: [],
        devoluciones: [],
        reenvios: [],
        calcEfectivo: {}
      }));
    },

    /* ---------- facturas ---------- */
    updateFactura(id, patch) {
      set((s) => {
        const { facturas, changed } = patchFactura(s, id, (f) => {
          const next = { ...f, ...patch };
          if (patch.estado === "Dev Total") next.causal = CAUSAL_DEV_TOTAL;
          if (patch.estado && patch.estado !== "Dev Total" && f.causal === CAUSAL_DEV_TOTAL) next.causal = "";
          if (patch.estado === "OK" || patch.estado === "Reenvío") next.causal = "";
          // al elegir un cliente ya registrado se completan sus datos
          if (patch.cliente !== undefined) {
            const cli = findCliente(s.clientes, patch.cliente);
            if (cli) {
              if (!next.direccion) next.direccion = cli.direccion || "";
              if (!next.barrio) next.barrio = cli.barrio || "";
              if (!next.telefono) next.telefono = cli.telefono || "";
            }
          }
          return next;
        });
        if (!changed) return s;
        let devoluciones = syncDevTotal(s.devoluciones, changed, s.route);
        if (patch.firma !== undefined || patch.cliente !== undefined || patch.vendedor !== undefined) {
          devoluciones = devoluciones.map((d) => (d.facturaId === id
            ? { ...d, firma: changed.firma || d.firma, cliente: changed.cliente, asesor: changed.vendedor }
            : d));
        }
        const clientes = ["cliente", "direccion", "telefono", "barrio"].some((k) => k in patch) ? upsertCliente(s.clientes, changed) : s.clientes;
        const vendedores = patch.vendedor ? addVendedorTo(s.vendedores, patch.vendedor) : s.vendedores;
        return { ...s, facturas, devoluciones, clientes, vendedores };
      });
    },
    addDescuento(facId) {
      set((s) => ({
        ...s,
        facturas: s.facturas.map((f) => (f.id === facId
          ? { ...f, descuentos: [...(f.descuentos || []), { id: uid("dsc"), concepto: "Descuento comercial", porcentaje: "", valor: 0 }] }
          : f))
      }));
    },
    updateDescuento(facId, dscId, patch) {
      set((s) => ({
        ...s,
        facturas: s.facturas.map((f) => (f.id === facId
          ? { ...f, descuentos: f.descuentos.map((d) => (d.id === dscId ? { ...d, ...patch } : d)) }
          : f))
      }));
    },
    removeDescuento(facId, dscId) {
      set((s) => ({
        ...s,
        facturas: s.facturas.map((f) => (f.id === facId ? { ...f, descuentos: f.descuentos.filter((d) => d.id !== dscId) } : f))
      }));
    },
    deleteFactura(id) {
      set((s) => ({ ...s, facturas: s.facturas.filter((f) => f.id !== id), devoluciones: s.devoluciones.filter((d) => d.facturaId !== id) }));
    },

    /* ---------- devoluciones ---------- */
    addDevolucion(entry) {
      set((s) => ({ ...s, devoluciones: [...s.devoluciones, { id: uid("dev"), tipo: "parcial", facturaId: null, firma: null, ...entry }] }));
    },
    deleteDevolucion(id) {
      set((s) => {
        const d = s.devoluciones.find((x) => x.id === id);
        let facturas = s.facturas;
        // borrar el registro automático de Dev Total devuelve la factura a "OK"
        if (d && d.tipo === "total" && d.facturaId) {
          facturas = facturas.map((f) => (f.id === d.facturaId ? { ...f, estado: "OK", causal: "" } : f));
        }
        return { ...s, facturas, devoluciones: s.devoluciones.filter((x) => x.id !== id) };
      });
    },

    /* ---------- reenvíos ---------- */
    addReenvio(numero, valor) {
      set((s) => ({ ...s, reenvios: [...s.reenvios, { id: uid("rz"), numero, valor, fecha: s.route.fecha }] }));
    },
    deleteReenvio(id) {
      set((s) => ({ ...s, reenvios: s.reenvios.filter((r) => r.id !== id) }));
    },

    /* ---------- clientes ---------- */
    addCliente(c) {
      set((s) => ({ ...s, clientes: [...s.clientes, { id: uid("cli"), ...c }] }));
    },
    updateCliente(id, patch) {
      set((s) => ({ ...s, clientes: s.clientes.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
    },
    deleteCliente(id) {
      set((s) => ({ ...s, clientes: s.clientes.filter((c) => c.id !== id) }));
    },

    /* ---------- vendedores ---------- */
    addVendedor(nombre) {
      set((s) => ({ ...s, vendedores: addVendedorTo(s.vendedores, nombre) }));
    },

    /* ---------- productos ---------- */
    addProductos(list) {
      set((s) => ({ ...s, productos: [...s.productos, ...list] }));
    },
    updateProducto(codigo, patch) {
      set((s) => ({ ...s, productos: s.productos.map((p) => (p.codigo === codigo ? { ...p, ...patch } : p)) }));
    },
    deleteProducto(codigo) {
      set((s) => ({ ...s, productos: s.productos.filter((p) => p.codigo !== codigo) }));
    },

    /* ---------- calculadora ---------- */
    setCalc(den, value) {
      set((s) => ({ ...s, calcEfectivo: { ...s.calcEfectivo, [den]: num(value) } }));
    },
    clearCalc() {
      set((s) => ({ ...s, calcEfectivo: {} }));
    }
  };
}

export function StoreProvider({ children }) {
  const [state, setState] = useState(null);
  const ref = useRef(null);
  ref.current = state;

  useEffect(() => { loadState().then(setState); }, []);
  useEffect(() => { if (state) saveStateDebounced(state); }, [state]);
  useEffect(() => {
    // al minimizar la app o cerrar la pestaña se guarda de inmediato
    const flush = () => { if (document.visibilityState === "hidden" && ref.current) saveStateNow(ref.current); };
    document.addEventListener("visibilitychange", flush);
    window.addEventListener("pagehide", flush);
    return () => { document.removeEventListener("visibilitychange", flush); window.removeEventListener("pagehide", flush); };
  }, []);

  const actions = useMemo(() => createActions(setState, () => ref.current), []);
  const value = useMemo(() => ({ state, actions }), [state, actions]);

  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

/* ---------- Toasts ---------- */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const toast = useCallback((msg, kind = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, msg, kind }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3400);
  }, []);
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div id="toastWrap">
        {toasts.map((t) => <div key={t.id} className={"toast show " + t.kind}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}
