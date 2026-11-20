import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useStore, useToast } from "./store.jsx";
import { SECTIONS } from "./lib/constants.js";
import { buildRutaSnapshot, guardarRuta, syncPending, sincronizarAvance, auxApi } from "./lib/supabase.js";
import { getPending } from "./lib/storage.js";
import { useSeguimiento } from "./lib/seguimiento.js";
import Login from "./components/Login.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Sidebar from "./components/Sidebar.jsx";
import Dashboard from "./sections/Dashboard.jsx";
import Entregas from "./sections/Entregas.jsx";
import Devolucion from "./sections/Devolucion.jsx";
import Cuadre from "./sections/Cuadre.jsx";
import Reenvios from "./sections/Reenvios.jsx";
import Clientes from "./sections/Clientes.jsx";
import Productos from "./sections/Productos.jsx";
import CalcEfectivo from "./sections/CalcEfectivo.jsx";

const AdminApp = lazy(() => import("./admin/AdminApp.jsx"));

const FILTRO_INICIAL = { estado: "TODOS", entrega: "TODAS", cliente: "TODOS", vendedor: "TODOS", busqueda: "" };
const NAV_BAJA = ["dashboard", "entregas", "devolucion", "cuadre"];

export default function App() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [admin, setAdmin] = useState(() => sessionStorage.getItem("rl_admin") || "");
  const [section, setSection] = useState(() => sessionStorage.getItem("rl_section") || "dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtro, setFiltro] = useState(FILTRO_INICIAL);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState(0);
  const [guardando, setGuardando] = useState(false);
  const [asignadas, setAsignadas] = useState([]); // rutas abiertas del auxiliar en Supabase
  const [buscandoRuta, setBuscandoRuta] = useState(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  const skipPush = useRef(false); // true cuando el cambio vino del servidor: no se vuelve a subir

  const seguimiento = useSeguimiento(state ? state.session : { usuario: "" }, state ? state.route : {});

  const refreshPending = useCallback(() => getPending().then((l) => setPendientes(l.length)), []);

  // reintenta subir rutas pendientes al recuperar la conexión
  useEffect(() => {
    const trySync = async () => {
      const sent = await syncPending();
      if (sent) toast(sent + " ruta(s) pendiente(s) subidas a Supabase", "success");
      refreshPending();
    };
    const on = () => { setOnline(true); trySync(); };
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    trySync();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
  }, [toast, refreshPending]);

  /* Trae la ruta que el administrador le asignó al auxiliar (por su nombre en el archivo) */
  const buscarRutaAsignada = useCallback(async (manual = false) => {
    const s = stateRef.current;
    if (!s || !s.session.usuario || !navigator.onLine) return;
    setBuscandoRuta(true);
    try {
      const rutas = await auxApi.rutas(s.session.usuario, s.session.pin);
      setAsignadas(rutas);
      const abiertas = rutas.filter((r) => r.estado !== "cerrada");
      const local = rutas.find((r) => r.id === s.route.rutaId);
      if (local) {
        if (s.route.dirty) {
          // hay cambios de este equipo sin subir: primero se suben (no se pisan con lo del servidor)
          const res = await sincronizarAvance(buildRutaSnapshot(s, { cerrar: !!s.route.terminada }));
          if (res) actions.setSync({ dirty: false, ...(res.actualizado_at ? { syncedAt: res.actualizado_at } : {}) });
        } else if (local.actualizado_at && local.actualizado_at !== s.route.syncedAt) {
          // otro equipo (APK o enlace web) modificó la ruta: se traen esos cambios
          skipPush.current = true;
          actions.aplicarServidor(local);
          if (s.route.syncedAt) toast("Registros actualizados desde otro dispositivo", "info");
        } else if (!s.route.terminada) {
          const n = actions.mergeAsignada(local);
          if (n) toast(n + " factura(s) nueva(s) agregadas a tu ruta", "success");
          else if (manual) toast("Tu ruta está al día", "info");
        } else if (manual) toast("Tu ruta está al día", "info");
      }
      const s2 = stateRef.current;
      if (!local || s2.route.terminada) {
        if ((!s2.facturas.length || s2.route.terminada) && abiertas.length && abiertas[0].id !== s2.route.rutaId) {
          // ruta nueva del administrador: reemplaza la anterior (si estaba terminada, ya quedó guardada)
          skipPush.current = true;
          actions.loadAsignada(abiertas[0]);
          toast("Ruta asignada cargada: " + (abiertas[0].placa || "") + " · " + abiertas[0].facturas.length + " facturas", "success");
        } else if (manual && !abiertas.length && !local) {
          toast("No tienes rutas nuevas asignadas", "info");
        }
      }
    } catch (e) {
      if (manual) toast("No se pudo consultar la ruta: " + e.message, "error");
    } finally { setBuscandoRuta(false); }
  }, [actions, toast]);

  const usuario = state && state.session.usuario;
  useEffect(() => { if (usuario) buscarRutaAsignada(); }, [usuario, buscarRutaAsignada]);

  // mantiene este equipo al día con lo que se haya registrado desde otro (APK ↔ enlace web)
  useEffect(() => {
    if (!usuario) return;
    const refrescar = () => { if (document.visibilityState === "visible") buscarRutaAsignada(); };
    const t = setInterval(refrescar, 60000);
    document.addEventListener("visibilitychange", refrescar);
    window.addEventListener("online", refrescar);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refrescar); window.removeEventListener("online", refrescar); };
  }, [usuario, buscarRutaAsignada]);

  /* Sincroniza solo los cambios de la ruta asignada (el admin los ve casi en tiempo real).
     Si la ruta ya está terminada, se reenvía completa (con firmas y fotos) para que las ediciones queden guardadas. */
  const rutaId = state && state.route.rutaId;
  const facturasSt = state && state.facturas;
  const devolucionesSt = state && state.devoluciones;
  const reenviosSt = state && state.reenvios;
  const terminada = state && state.route.terminada;
  const primera = useRef(true);
  useEffect(() => {
    if (!usuario || !rutaId) return;
    if (skipPush.current) { skipPush.current = false; primera.current = false; return; } // cambio que vino del servidor: no re-subirlo
    if (primera.current) { primera.current = false; return; } // no re-subir lo que acaba de cargarse
    if (!facturasSt || !facturasSt.some((f) => f.confirmada || f.valorFactura)) return;
    actions.setSync({ dirty: true });
    const t = setTimeout(async () => {
      const s = stateRef.current;
      if (!s || s.route.rutaId !== rutaId) return;
      const res = await sincronizarAvance(buildRutaSnapshot(s, { cerrar: !!s.route.terminada }));
      if (res) actions.setSync({ dirty: false, ...(res.actualizado_at ? { syncedAt: res.actualizado_at } : {}) });
    }, terminada ? 6000 : 4000);
    return () => clearTimeout(t);
  }, [usuario, rutaId, facturasSt, devolucionesSt, reenviosSt, terminada, actions]);

  const navigate = useCallback((id) => {
    setSection(id);
    sessionStorage.setItem("rl_section", id);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (admin) {
    return (
      <Suspense fallback={<div className="loading">Cargando panel...</div>}>
        <AdminApp pass={admin} onLogout={() => { sessionStorage.removeItem("rl_admin"); setAdmin(""); }} />
      </Suspense>
    );
  }

  if (!state) return <div className="loading">Cargando...</div>;
  if (!state.session.auxiliar || !state.session.usuario) {
    return <Login onAdmin={(p) => { sessionStorage.setItem("rl_admin", p); setAdmin(p); }} />;
  }

  const verEnRuta = (cliente) => {
    setFiltro({ ...FILTRO_INICIAL, cliente });
    navigate("entregas");
  };

  const terminarRuta = async () => {
    if (!state.facturas.length && !state.reenvios.length) { toast("No hay facturas en la ruta", "error"); return; }
    const pend = state.facturas.filter((f) => !f.confirmada).length;
    const msg = (pend ? `Hay ${pend} factura(s) sin confirmar.\n` : "") + "Se guardará la ruta tal como está. Después podrás seguir editando las facturas si lo necesitas. ¿Terminar la ruta?";
    if (!confirm(msg)) return;
    setGuardando(true);
    const snap = buildRutaSnapshot(state);
    const res = await guardarRuta(snap);
    setGuardando(false);
    skipPush.current = false;
    actions.marcarTerminada(snap.rutaId);
    if (res.ok) actions.setSync({ dirty: false, ...(res.actualizado_at ? { syncedAt: res.actualizado_at } : {}) });
    if (res.ok) toast("Ruta terminada y guardada correctamente", "success");
    else toast("Sin conexión o error con Supabase: la ruta quedó guardada en el equipo y se subirá automáticamente.", "info");
    refreshPending();
    setTimeout(() => buscarRutaAsignada(), 300);
  };

  const salir = () => {
    if (confirm("¿Cerrar la sesión de " + state.session.auxiliar + "? La ruta en curso se conserva en el equipo.")) actions.logout();
  };

  const current = SECTIONS.find((s) => s.id === section) || SECTIONS[0];
  const ofertas = asignadas.filter((r) => r.id !== state.route.rutaId);

  return (
    <div className="app">
      <Sidebar
        current={current.id}
        onNavigate={navigate}
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        auxiliar={state.session.auxiliar}
        onLogout={salir}
        online={online}
        pendientes={pendientes}
      />
      <main className="main">
        <header className="topbar">
          <button className="mobile-menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Abrir menú">☰</button>
          <h1>{current.title}</h1>
        </header>
        <ErrorBoundary key={current.id} onReset={() => navigate("dashboard")}>
        {current.id === "dashboard" && (
          <Dashboard
            onNavigate={navigate}
            ofertas={ofertas}
            onCargar={(r) => {
              if (state.facturas.length && !state.route.terminada && !confirm("Tienes una ruta sin terminar en este equipo (su avance ya se sincroniza). ¿Cambiar a la otra ruta?")) return;
              actions.loadAsignada(r);
              toast("Ruta cargada", "success");
            }}
            onActualizar={() => buscarRutaAsignada(true)}
            buscando={buscandoRuta}
            onTerminar={terminarRuta}
            guardando={guardando}
            seguimiento={seguimiento}
          />
        )}
        {current.id === "entregas" && <Entregas filtro={filtro} setFiltro={setFiltro} />}
        {current.id === "devolucion" && <Devolucion />}
        {current.id === "cuadre" && <Cuadre />}
        {current.id === "reenvios" && <Reenvios />}
        {current.id === "clientes" && <Clientes onVerEnRuta={verEnRuta} />}
        {current.id === "productos" && <Productos />}
        {current.id === "efectivo" && <CalcEfectivo />}
        </ErrorBoundary>
      </main>

      {/* barra inferior (celular) */}
      <nav className="bottom-nav">
        {NAV_BAJA.map((id) => {
          const s = SECTIONS.find((x) => x.id === id);
          return (
            <button key={id} className={current.id === id ? "active" : ""} onClick={() => navigate(id)}>
              <span className="ic">{s.icon}</span>{{ dashboard: "Inicio", entregas: "Facturas", devolucion: "Devol.", cuadre: "Cuadre" }[id]}
            </button>
          );
        })}
        <button className={!NAV_BAJA.includes(current.id) ? "active" : ""} onClick={() => setMenuOpen(true)}><span className="ic">☰</span>Más</button>
      </nav>

      {/* listas de autocompletado compartidas */}
      <datalist id="clientesDatalist">
        {state.clientes.map((c) => <option key={c.id} value={c.nombre} />)}
      </datalist>
      <datalist id="productosDatalist">
        {state.productos.map((p) => <option key={p.codigo} value={p.nombre} />)}
      </datalist>
    </div>
  );
}
