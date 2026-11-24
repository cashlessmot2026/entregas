import { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import { loadState, saveStateDebounced, saveStateNow, emptyRoute, migrateFactura } from "./lib/storage.js";
import { uid, num, normText, normReenvio } from "./lib/utils.js";

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
    cliente: f.razonSocial || f.clienteDev || f.cliente,
    factura: f.numero,
    asesor: f.vendedor,
    causal: f.causal || "",
    codigoProducto: "12",
    descripcion: DEV_TOTAL_DESC,
    cantidad: f.botellasDev === "" || f.botellasDev == null ? "" : num(f.botellasDev),
    valor: num(f.valorFactura),
    firma: f.firma || null
  }];
}

function addVendedorTo(list, name) {
  const v = (name || "").trim().toUpperCase();
  return v && !list.includes(v) ? [...list, v] : list;
}

/* Factura tal como la guarda el servidor (con el avance de la ruta) -> formato local */
function facturaDeServidor(rf, r) {
  return migrateFactura({
    id: uid("fac"), numero: rf.numero, fecha: rf.fecha || r.fecha || "", sucursal: rf.sucursal || "",
    planilla: rf.planilla || r.planilla || "", cliente: rf.cliente || rf.sucursal || "", vendedor: (rf.vendedor || "").toUpperCase(),
    direccion: rf.direccion || "", barrio: rf.barrio || "", ciudad: rf.ciudad || "", telefono: rf.telefono || "",
    refLat: rf.ref_lat, refLng: rf.ref_lng,
    razonSocial: rf.razon_social || "", cantidadInv: rf.cantidad_inv, valorNeto: rf.valor_neto,
    // avance guardado en el servidor (si la ruta ya se había trabajado o terminado)
    valorFactura: rf.valor_factura, descuentos: Array.isArray(rf.descuentos) ? rf.descuentos : [], retencion: rf.retencion,
    saldoFavor: rf.saldo_favor, formaPago: rf.forma_pago || "", mixtoTransferencia: rf.mixto_transferencia, mixtoEfectivo: rf.mixto_efectivo,
    estado: rf.estado_entrega || "OK", causal: rf.causal || "", observaciones: rf.observaciones || "", confirmada: !!rf.confirmada,
    obsequio: !!rf.obsequio, obsequioDetalle: rf.obsequio_detalle || "", lat: rf.lat, lng: rf.lng,
    entregadaAt: rf.entregada_at || null, firma: rf.firma_digital || null
  });
}

/* El nombre del negocio y las botellas de una Dev Total viajan en su registro de devolución:
   al traer la ruta del servidor se vuelven a poner en la factura. */
function datosDevTotal(facturas, devoluciones) {
  return facturas.map((f) => {
    if (f.estado !== "Dev Total") return f;
    const d = devoluciones.find((x) => x.facturaId === f.id && x.tipo === "total");
    if (!d) return f;
    return { ...f, clienteDev: !f.razonSocial && d.cliente && d.cliente !== f.cliente ? d.cliente : "", botellasDev: d.cantidad === "" || d.cantidad == null ? "" : Number(d.cantidad) };
  });
}

function devolucionesDeServidor(r, facturas) {
  const porNumero = Object.fromEntries(facturas.map((f) => [String(f.numero), f.id]));
  return (r.devoluciones || []).map((d) => ({
    id: uid("dev"), tipo: d.tipo || "parcial", facturaId: porNumero[String(d.factura)] || null, fecha: d.fecha || r.fecha,
    placa: r.placa || "", cliente: d.cliente || "", factura: d.factura || "", asesor: d.asesor || "", causal: d.causal || "",
    codigoProducto: d.codigo_producto || "", descripcion: d.descripcion || "", cantidad: d.cantidad == null ? "" : Number(d.cantidad),
    valor: Number(d.valor) || 0, firma: d.firma || null
  }));
}

const reenviosDeServidor = (r) => (r.reenvios || []).map((z) => ({ id: uid("rz"), ...normReenvio(z), fecha: z.fecha || r.fecha }));

function createActions(set, get) {
  const patchFactura = (s, id, fn) => {
    let changed = null;
    const facturas = s.facturas.map((f) => (f.id === id ? (changed = fn(f)) : f));
    return { facturas, changed };
  };

  return {
    /* ---------- sesión del auxiliar ---------- */
    login({ nombre, usuario, pin }) {
      const n = nombre.trim().toUpperCase();
      set((s) => {
        // si entra otro auxiliar en el mismo equipo no se mezcla su ruta con la anterior
        const otro = s.route.auxUsuario && s.route.auxUsuario !== usuario;
        const base = otro ? { ...s, route: emptyRoute(n), facturas: [], devoluciones: [], reenvios: [], calcEfectivo: {} } : s;
        return {
          ...base,
          session: { auxiliar: n, usuario, pin, desde: new Date().toISOString() },
          route: { ...base.route, auxiliar: n, auxUsuario: usuario }
        };
      });
    },
    logout() {
      set((s) => ({ ...s, session: { auxiliar: "", usuario: "", pin: "" } }));
    },

    /* ---------- ruta asignada por el administrador ---------- */
    loadAsignada(r) {
      set((s) => {
        let vendedores = s.vendedores;
        let clientes = s.clientes;
        const facturas = (r.facturas || []).map((rf) => {
          const base = facturaDeServidor(rf, r);
          vendedores = addVendedorTo(vendedores, base.vendedor);
          const cli = findCliente(clientes, base.cliente);
          const full = cli ? { ...base, direccion: base.direccion || cli.direccion || "", barrio: base.barrio || cli.barrio || "", telefono: base.telefono || cli.telefono || "" } : base;
          clientes = upsertCliente(clientes, full);
          return full;
        });
        const devoluciones = devolucionesDeServidor(r, facturas);
        const facturasFull = datosDevTotal(facturas, devoluciones);
        const reenvios = reenviosDeServidor(r);
        return {
          ...s,
          vendedores,
          clientes,
          route: {
            ...emptyRoute(s.session.auxiliar),
            auxUsuario: s.session.usuario,
            conductor: r.conductor || "", placa: r.placa || "", fecha: r.fecha || s.route.fecha,
            planilla: r.planilla || "", rutaId: r.id,
            terminada: r.estado === "cerrada", terminadaAt: r.estado === "cerrada" ? new Date().toISOString() : "",
            syncedAt: r.actualizado_at || "", dirty: false
          },
          facturas: facturasFull,
          devoluciones,
          reenvios,
          calcEfectivo: {}
        };
      });
    },
    /* Trae del servidor los cambios hechos desde otro equipo (APK / enlace web) sobre la misma ruta.
       Se conservan los datos que solo existen en este equipo (id, foto del comprobante). */
    aplicarServidor(r) {
      set((s) => {
        const locales = Object.fromEntries(s.facturas.map((f) => [String(f.numero), f]));
        const vistos = new Set();
        const delServidor = (r.facturas || []).map((rf) => {
          const nueva = facturaDeServidor(rf, r);
          vistos.add(String(rf.numero));
          const loc = locales[String(rf.numero)];
          if (!loc) return nueva;
          return { ...loc, ...nueva, id: loc.id, firma: nueva.firma || loc.firma, transferenciaFoto: loc.transferenciaFoto };
        });
        const soloLocales = s.facturas.filter((f) => !vistos.has(String(f.numero)));
        const facturas0 = [...delServidor, ...soloLocales];
        const devoluciones = devolucionesDeServidor(r, facturas0);
        const facturas = datosDevTotal(facturas0, devoluciones);
        return {
          ...s,
          facturas,
          devoluciones,
          reenvios: reenviosDeServidor(r),
          route: { ...s.route, syncedAt: r.actualizado_at || s.route.syncedAt || "", dirty: false, terminada: r.estado === "cerrada" ? true : s.route.terminada }
        };
      });
    },
    /* marca si hay cambios locales sin subir y la última versión conocida del servidor */
    setSync(patch) {
      set((s) => {
        const igual = Object.keys(patch).every((k) => (s.route[k] || "") === (patch[k] || "") || s.route[k] === patch[k]);
        return igual ? s : { ...s, route: { ...s.route, ...patch } };
      });
    },
    /* el auxiliar terminó la ruta: queda guardada, pero se puede seguir editando */
    marcarTerminada(rutaId) {
      set((s) => ({ ...s, route: { ...s.route, rutaId: s.route.rutaId || rutaId, terminada: true, terminadaAt: new Date().toISOString() } }));
    },
    /* agrega las facturas nuevas que el admin haya subido después a la misma ruta */
    mergeAsignada(r) {
      const existentes = new Set(get().facturas.map((f) => String(f.numero)));
      const nuevas = (r.facturas || []).filter((rf) => !existentes.has(String(rf.numero)));
      // facturas que el celular ya tenía y a las que el admin les cargó después la razón social, cantidad y valor neto
      const porNumero = new Map((r.facturas || []).map((rf) => [String(rf.numero), rf]));
      const faltan = get().facturas.some((f) => !f.razonSocial && porNumero.get(String(f.numero))?.razon_social);
      if (faltan) {
        set((s) => ({
          ...s,
          facturas: s.facturas.map((f) => {
            const rf = porNumero.get(String(f.numero));
            if (f.razonSocial || !rf || !rf.razon_social) return f;
            return { ...f, razonSocial: rf.razon_social, cantidadInv: num(rf.cantidad_inv), valorNeto: num(rf.valor_neto),
              valorFactura: num(f.valorFactura) ? f.valorFactura : num(rf.valor_factura) };
          })
        }));
      }
      if (!nuevas.length) return 0;
      set((s) => ({
        ...s,
        facturas: [...s.facturas, ...nuevas.map((rf) => migrateFactura({
          id: uid("fac"), numero: rf.numero, fecha: rf.fecha || r.fecha || "", sucursal: rf.sucursal || "",
          planilla: rf.planilla || r.planilla || "", cliente: rf.cliente || rf.sucursal || "", vendedor: (rf.vendedor || "").toUpperCase(),
          direccion: rf.direccion || "", telefono: rf.telefono || "", refLat: rf.ref_lat, refLng: rf.ref_lng,
          razonSocial: rf.razon_social || "", cantidadInv: rf.cantidad_inv, valorNeto: rf.valor_neto, valorFactura: rf.valor_factura
        }))]
      }));
      return nuevas.length;
    },
    setRutaId(id) {
      set((s) => (s.route.rutaId ? s : { ...s, route: { ...s.route, rutaId: id } }));
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
        route: { ...emptyRoute(s.session.auxiliar), auxUsuario: s.session.usuario },
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
          // al pasar a Dev Total el auxiliar elige la causal; al salir de Dev Total se limpian los datos propios de ella
          if (patch.estado === "Dev Total" && f.estado !== "Dev Total") next.causal = "";
          if (patch.estado && patch.estado !== "Dev Total" && f.estado === "Dev Total") { next.causal = ""; next.clienteDev = ""; next.botellasDev = ""; }
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
            ? { ...d, firma: changed.firma || d.firma, cliente: changed.razonSocial || (d.tipo === "total" ? changed.clienteDev || changed.cliente : changed.cliente), asesor: changed.vendedor }
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
    addReenvio(datos) {
      set((s) => ({ ...s, reenvios: [...s.reenvios, { id: uid("rz"), ...datos, fecha: s.route.fecha }] }));
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
