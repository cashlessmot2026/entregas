import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useStore, useToast } from "./store.jsx";
import { SECTIONS } from "./lib/constants.js";
import { buildRutaSnapshot, guardarRuta, syncPending, sincronizarAvance, auxApi } from "./lib/supabase.js";
import { getPending } from "./lib/storage.js";
import Login from "./components/Login.jsx";
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
      const local = rutas.find((r) => r.id === s.route.rutaId);
      if (local) {
        const n = actions.mergeAsignada(local);
        if (n) toast(n + " factura(s) nueva(s) agregadas a tu ruta", "success");
        else if (manual) toast("Tu ruta está al día", "info");
      } else if (!s.facturas.length && rutas.length) {
        actions.loadAsignada(rutas[0]);
        toast("Ruta asignada cargada: " + (rutas[0].placa || "") + " · " + rutas[0].facturas.length + " facturas", "success");
      } else if (manual && !rutas.length) {
        toast("No tienes rutas nuevas asignadas", "info");
      }
    } catch (e) {
      if (manual) toast("No se pudo consultar la ruta: " + e.message, "error");
    } finally { setBuscandoRuta(false); }
  }, [actions, toast]);

  const usuario = state && state.session.usuario;
  useEffect(() => { if (usuario) buscarRutaAsignada(); }, [usuario, buscarRutaAsignada]);

  /* Sincroniza el avance de la ruta asignada (el admin lo ve casi en tiempo real) */
  const confirmadas = state ? state.facturas.filter((f) => f.confirmada).length : 0;
  const rutaId = state && state.route.rutaId;
  useEffect(() => {
    if (!usuario || !rutaId || !confirmadas) return;
    const t = setTimeout(() => {
      const s = stateRef.current;
      if (s && s.route.rutaId === rutaId) sincronizarAvance(buildRutaSnapshot(s, { cerrar: false }));
    }, 4000);
    return () => clearTimeout(t);
  }, [usuario, rutaId, confirmadas]);

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

  const guardarYNueva = async () => {
    if (!state.facturas.length && !state.reenvios.length) {
      if (!confirm("No hay facturas cargadas en esta ruta. ¿Deseas continuar de todas formas?")) return;
    }
    const pend = state.facturas.filter((f) => !f.confirmada).length;
    const msg = (pend ? `Hay ${pend} factura(s) sin confirmar.\n` : "") + "Esto guardará la ruta actual en la base de datos y comenzará una ruta nueva. ¿Continuar?";
    if (!confirm(msg)) return;
    setGuardando(true);
    const res = await guardarRuta(buildRutaSnapshot(state));
    setGuardando(false);
    if (res.ok) toast("Ruta guardada en Supabase correctamente", "success");
    else toast("Sin conexión o error con Supabase: la ruta quedó guardada en el equipo y se subirá automáticamente.", "info");
    refreshPending();
    actions.resetRoute();
    setFiltro(FILTRO_INICIAL);
    navigate("dashboard");
    setTimeout(() => buscarRutaAsignada(), 300);
  };

  const limpiarTodo = () => {
    if (!confirm("Esto borrará TODOS los registros de la ruta actual (facturas, devoluciones, reenvíos) sin guardarlos. ¿Confirmas?")) return;
    actions.resetRoute();
    setFiltro(FILTRO_INICIAL);
    toast("Ruta nueva iniciada", "success");
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
          <div className="actions">
            <button className="btn btn-warn" onClick={limpiarTodo}>🧹 Limpiar todos los registros</button>
            <button className="btn btn-primary" disabled={guardando} onClick={guardarYNueva}>{guardando ? "Guardando..." : "💾 Guardar ruta y comenzar nueva"}</button>
          </div>
        </header>
        {current.id === "dashboard" && (
          <Dashboard
            onNavigate={navigate}
            ofertas={ofertas}
            onCargar={(r) => {
              if (state.facturas.length && !confirm("Esto reemplaza la ruta en curso de este equipo. ¿Continuar?")) return;
              actions.loadAsignada(r);
              toast("Ruta cargada", "success");
            }}
            onActualizar={() => buscarRutaAsignada(true)}
            buscando={buscandoRuta}
          />
        )}
        {current.id === "entregas" && <Entregas filtro={filtro} setFiltro={setFiltro} />}
        {current.id === "devolucion" && <Devolucion />}
        {current.id === "cuadre" && <Cuadre />}
        {current.id === "reenvios" && <Reenvios />}
        {current.id === "clientes" && <Clientes onVerEnRuta={verEnRuta} />}
        {current.id === "productos" && <Productos />}
        {current.id === "efectivo" && <CalcEfectivo />}
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
