import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../store.jsx";
import { adminApi } from "../lib/supabase.js";
import { todayStr } from "../lib/utils.js";
import { filtrar } from "./analytics.js";
import AdminDashboard from "./AdminDashboard.jsx";
import AdminRutas from "./AdminRutas.jsx";
import AdminAuxiliares from "./AdminAuxiliares.jsx";
import AdminConfig from "./AdminConfig.jsx";
import AdminFacturas from "./AdminFacturas.jsx";
import AdminProductos from "./AdminProductos.jsx";
import "./admin.css";

const MENU = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "rutas", icon: "🗺️", label: "Rutas" },
  { id: "facturas", icon: "🧾", label: "Facturas" },
  { id: "auxiliares", icon: "🧑‍✈️", label: "Auxiliares" },
  { id: "productos", icon: "🏷️", label: "Productos" },
  { id: "config", icon: "⚙️", label: "Configuración" }
];

export default function AdminApp({ pass, onLogout }) {
  const toast = useToast();
  const [page, setPage] = useState(() => { const p = sessionStorage.getItem("rl_admin_page"); return !p || p === "reportes" ? "dashboard" : p; });
  const [menu, setMenu] = useState(false);
  // por defecto (automático) se muestra el día en curso; el admin puede elegir otro rango si quiere
  const [auto, setAuto] = useState(true);
  const [desde, setDesde] = useState(() => todayStr());
  const [hasta, setHasta] = useState(() => todayStr());
  const [ds, setDs] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ aux: "", cliente: "" });
  const [busqueda, setBusqueda] = useState("");

  const rango = useMemo(() => ({ desde: desde || null, hasta: hasta || null }), [desde, hasta]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDs(await adminApi.dataset(pass, rango.desde, rango.hasta)); }
    catch (e) { toast("No se pudieron cargar los datos: " + e.message, "error"); }
    finally { setCargando(false); }
  }, [pass, rango, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  // modo automático: sigue al día en curso (cambia solo a medianoche) y refresca los datos cada 2 min
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => {
      const h = todayStr();
      if (h !== desde || h !== hasta) { setDesde(h); setHasta(h); } else cargar();
    }, 120000);
    return () => clearInterval(t);
  }, [auto, desde, hasta, cargar]);

  const ir = (id) => { setPage(id); sessionStorage.setItem("rl_admin_page", id); setMenu(false); window.scrollTo({ top: 0 }); };
  const data = useMemo(() => filtrar(ds, filtros), [ds, filtros]);
  const rangoTxt = auto ? "Hoy " + rango.desde + " (automático)" : rango.desde || rango.hasta
    ? (rango.desde === rango.hasta ? "Día " + rango.desde : (rango.desde || "inicio") + " al " + (rango.hasta || "hoy"))
    : "Todo el historial";
  const actual = MENU.find((m) => m.id === page) || MENU[0];

  const props = { pass, ds, data, cargando, cargar, filtros, setFiltros, rangoTxt, rango, ir, toast };

  return (
    <div className="adm">
      <div className={"adm-overlay" + (menu ? " show" : "")} onClick={() => setMenu(false)} />
      <aside className={"adm-side" + (menu ? " open" : "")}>
        <div className="adm-brand">
          <img src="./logo.png" alt="" />
          <div><b>LICONSUMAR</b><small>Panel administrativo</small></div>
        </div>
        <nav>
          {MENU.map((m) => (
            <button key={m.id} className={"adm-link" + (page === m.id ? " active" : "")} onClick={() => ir(m.id)}>
              <span>{m.icon}</span>{m.label}
            </button>
          ))}
        </nav>
        <div className="adm-promo">
          <b>Operación en tiempo real</b>
          <small>Las entregas de los auxiliares se reflejan aquí al confirmarse.</small>
          <div className="adm-promo-truck">🚚</div>
        </div>
        <div className="adm-user">
          <div className="adm-avatar">A</div>
          <div><b>Administrador</b><small>Sesión activa</small></div>
          <button title="Cerrar sesión" onClick={onLogout}>⏻</button>
        </div>
      </aside>

      <main className="adm-main">
        <header className="adm-top">
          <button className="adm-burger" onClick={() => setMenu(true)}>☰</button>
          <div className="adm-search">
            <span>🔍</span>
            <input value={busqueda} onChange={(e) => { setBusqueda(e.target.value); setFiltros((f) => ({ ...f, cliente: e.target.value })); }} placeholder="Buscar cliente en entregas y devoluciones..." />
          </div>
          <div className="adm-rango">
            <label>Desde <input type="date" value={desde} max={hasta || undefined} onChange={(e) => { setAuto(false); setDesde(e.target.value); }} /></label>
            <label>Hasta <input type="date" value={hasta} min={desde || undefined} onChange={(e) => { setAuto(false); setHasta(e.target.value); }} /></label>
            <button className={auto ? "on" : ""} title="Día en curso (automático: se actualiza solo)" onClick={() => { setAuto(true); setDesde(todayStr()); setHasta(todayStr()); }}>Hoy</button>
            <button title="Ver todo el historial" onClick={() => { setAuto(false); setDesde(""); setHasta(""); }}>Todo</button>
          </div>
          <button className="adm-refresh" onClick={cargar} disabled={cargando} title="Actualizar">{cargando ? "…" : "⟳"}</button>
        </header>
        <h1 className="adm-title">{actual.icon} {actual.label}<small>{rangoTxt}</small></h1>

        {page === "dashboard" && <AdminDashboard {...props} />}
        {page === "rutas" && <AdminRutas {...props} />}
        {page === "facturas" && <AdminFacturas {...props} />}
        {page === "auxiliares" && <AdminAuxiliares {...props} />}
        {page === "productos" && <AdminProductos {...props} />}
        {page === "config" && <AdminConfig {...props} onLogout={onLogout} />}
      </main>
    </div>
  );
}
