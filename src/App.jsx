import { useCallback, useEffect, useState } from "react";
import { useStore, useToast } from "./store.jsx";
import { SECTIONS } from "./lib/constants.js";
import { buildRutaSnapshot, guardarRuta, syncPending } from "./lib/supabase.js";
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

const FILTRO_INICIAL = { estado: "TODOS", entrega: "TODAS", cliente: "TODOS", vendedor: "TODOS", busqueda: "" };

export default function App() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [section, setSection] = useState(() => sessionStorage.getItem("rl_section") || "dashboard");
  const [menuOpen, setMenuOpen] = useState(false);
  const [filtro, setFiltro] = useState(FILTRO_INICIAL);
  const [online, setOnline] = useState(navigator.onLine);
  const [pendientes, setPendientes] = useState(0);
  const [guardando, setGuardando] = useState(false);

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

  const navigate = useCallback((id) => {
    setSection(id);
    sessionStorage.setItem("rl_section", id);
    setMenuOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  if (!state) return <div className="loading">Cargando...</div>;
  if (!state.session.auxiliar) return <Login />;

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

  return (
    <div className="app">
      <button className="mobile-menu-btn" onClick={() => setMenuOpen((v) => !v)} aria-label="Abrir menú">☰</button>
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
        <div className="topbar">
          <h1>{current.title}</h1>
          <div className="actions">
            <button className="btn btn-warn" onClick={limpiarTodo}>🧹 Limpiar todos los registros</button>
            <button className="btn btn-primary" disabled={guardando} onClick={guardarYNueva}>{guardando ? "Guardando..." : "💾 Guardar ruta y comenzar nueva"}</button>
          </div>
        </div>
        {current.id === "dashboard" && <Dashboard onNavigate={navigate} />}
        {current.id === "entregas" && <Entregas filtro={filtro} setFiltro={setFiltro} />}
        {current.id === "devolucion" && <Devolucion />}
        {current.id === "cuadre" && <Cuadre />}
        {current.id === "reenvios" && <Reenvios />}
        {current.id === "clientes" && <Clientes onVerEnRuta={verEnRuta} />}
        {current.id === "productos" && <Productos />}
        {current.id === "efectivo" && <CalcEfectivo />}
      </main>

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
