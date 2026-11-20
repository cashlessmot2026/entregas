import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "../store.jsx";
import { adminApi } from "../lib/supabase.js";
import { todayStr } from "../lib/utils.js";
import { filtrar } from "./analytics.js";
import AdminDashboard from "./AdminDashboard.jsx";
import AdminRutas from "./AdminRutas.jsx";
import AdminAuxiliares from "./AdminAuxiliares.jsx";
import AdminConfig from "./AdminConfig.jsx";
import "./admin.css";

const AdminReportes = lazy(() => import("./AdminReportes.jsx"));

const MENU = [
  { id: "dashboard", icon: "🏠", label: "Dashboard" },
  { id: "rutas", icon: "🗺️", label: "Rutas" },
  { id: "auxiliares", icon: "🧑‍✈️", label: "Auxiliares" },
  { id: "reportes", icon: "📊", label: "Reportes" },
  { id: "config", icon: "⚙️", label: "Configuración" }
];

const PRESETS = [
  { id: "hoy", label: "Hoy", dias: 0 },
  { id: "7", label: "7 días", dias: 6 },
  { id: "30", label: "30 días", dias: 29 },
  { id: "90", label: "90 días", dias: 89 },
  { id: "todo", label: "Todo", dias: null }
];

function rangoDe(preset) {
  const p = PRESETS.find((x) => x.id === preset);
  if (!p || p.dias == null) return { desde: null, hasta: null };
  const d = new Date(); d.setDate(d.getDate() - p.dias);
  return { desde: d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"), hasta: todayStr() };
}

export default function AdminApp({ pass, onLogout }) {
  const toast = useToast();
  const [page, setPage] = useState(() => sessionStorage.getItem("rl_admin_page") || "dashboard");
  const [menu, setMenu] = useState(false);
  const [preset, setPreset] = useState("30");
  const [ds, setDs] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [filtros, setFiltros] = useState({ aux: "", cliente: "" });
  const [busqueda, setBusqueda] = useState("");

  const rango = useMemo(() => rangoDe(preset), [preset]);

  const cargar = useCallback(async () => {
    setCargando(true);
    try { setDs(await adminApi.dataset(pass, rango.desde, rango.hasta)); }
    catch (e) { toast("No se pudieron cargar los datos: " + e.message, "error"); }
    finally { setCargando(false); }
  }, [pass, rango, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const ir = (id) => { setPage(id); sessionStorage.setItem("rl_admin_page", id); setMenu(false); window.scrollTo({ top: 0 }); };
  const data = useMemo(() => filtrar(ds, filtros), [ds, filtros]);
  const rangoTxt = rango.desde ? rango.desde + " al " + rango.hasta : "Todo el historial";
  const actual = MENU.find((m) => m.id === page) || MENU[0];

  const props = { pass, ds, data, cargando, cargar, filtros, setFiltros, rangoTxt, ir, toast };

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
          <div className="adm-presets">
            {PRESETS.map((p) => <button key={p.id} className={preset === p.id ? "active" : ""} onClick={() => setPreset(p.id)}>{p.label}</button>)}
          </div>
          <button className="adm-refresh" onClick={cargar} disabled={cargando} title="Actualizar">{cargando ? "…" : "⟳"}</button>
        </header>
        <h1 className="adm-title">{actual.icon} {actual.label}<small>{rangoTxt}</small></h1>

        {page === "dashboard" && <AdminDashboard {...props} />}
        {page === "rutas" && <AdminRutas {...props} />}
        {page === "auxiliares" && <AdminAuxiliares {...props} />}
        {page === "reportes" && <Suspense fallback={<div className="loading">Cargando reportes...</div>}><AdminReportes {...props} /></Suspense>}
        {page === "config" && <AdminConfig {...props} onLogout={onLogout} />}
      </main>
    </div>
  );
}
