import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { resumen, rankingAuxiliares, entregasPorDia, porEstado, vehiculos, actividadReciente, fmtMoney } from "./analytics.js";
import { AreaChart, BarChart, Donut, Progress } from "./charts.jsx";

const MapaGps = lazy(() => import("./MapaGps.jsx"));
const MapaVivo = lazy(() => import("./MapaVivo.jsx"));

const ICON = { OK: "✅", "Dev Parcial": "⚠️", "Dev Total": "❌", "Reenvío": "🔁" };

export default function AdminDashboard({ pass, ds, data, cargando, ir }) {
  const [camiones, setCamiones] = useState([]);
  const [foco, setFoco] = useState(null);
  useEffect(() => {
    let vivo = true;
    const tick = () => adminApi.ubicaciones(pass, 30).then((l) => { if (vivo) setCamiones(l); }).catch(() => {});
    tick();
    const t = setInterval(tick, 15000);
    return () => { vivo = false; clearInterval(t); };
  }, [pass]);

  const r = useMemo(() => resumen(data), [data]);
  const ranking = useMemo(() => rankingAuxiliares(data), [data]);
  const dias = useMemo(() => entregasPorDia(data), [data]);
  const estados = useMemo(() => porEstado(data), [data]);
  const vehs = useMemo(() => vehiculos(data).filter((v) => v.estado !== "cerrada").slice(0, 5), [data]);
  const actividad = useMemo(() => actividadReciente(data), [data]);
  const conGps = useMemo(() => data.facturas.filter((f) => f.lat != null), [data]);
  const fmtDia = (d) => d.slice(8) + "/" + d.slice(5, 7);

  if (!ds) return <div className="empty">{cargando ? "Cargando datos..." : "Sin datos"}</div>;

  const top = ranking.filter((a) => a.gestionadas > 0);

  return (
    <>
      <div className="kpis">
        <div className="kpi k-blue"><span className="kpi-ic">🚚</span><b>{r.vehiculosActivos}</b><small>Vehículos activos</small><em>{r.rutas} rutas</em></div>
        <div className="kpi k-green"><span className="kpi-ic">✅</span><b>{r.entregadas}</b><small>Entregas realizadas</small><em>{r.efectividad}%</em></div>
        <div className="kpi k-orange"><span className="kpi-ic">⏳</span><b>{r.pendientes}</b><small>Pendientes</small><em>{r.facturas} facturas</em></div>
        <div className="kpi k-purple"><span className="kpi-ic">📦</span><b>{r.clientesNovedad}</b><small>Clientes con novedades</small><em>{r.conDevolucion} dev.</em></div>
      </div>

      <section className="card">
        <div className="card-h"><h3>📡 Seguimiento en vivo <span className="live-dot" /> <small className="muted">{camiones.length} vehículo(s) compartiendo ubicación</small></h3>
          <span className="legend-i">Se actualiza cada 15 s</span></div>
        {camiones.length ? (
          <div className="vivo">
            <Suspense fallback={<div className="empty">Cargando mapa...</div>}><MapaVivo camiones={camiones} foco={foco} /></Suspense>
            <div className="vivo-list">
              {camiones.map((c) => (
                <button key={c.auxiliar} className="vivo-item" onClick={() => setFoco({ lat: c.lat, lng: c.lng, t: Date.now() })}>
                  <span className={"dot " + (c.segundos > 120 ? "old" : "on")} />
                  <div><b>{c.placa || "Sin placa"} · {c.auxiliar}</b>
                    <small>{c.velocidad != null ? c.velocidad + " km/h · " : ""}hace {c.segundos < 60 ? c.segundos + " s" : Math.round(c.segundos / 60) + " min"}</small></div>
                </button>
              ))}
            </div>
          </div>
        ) : <div className="empty">Ningún auxiliar tiene el seguimiento activo. Cada auxiliar puede activarlo en su app (Inicio → "Seguimiento en vivo").</div>}
      </section>

      <div className="adm-grid g-main">
        <section className="card">
          <div className="card-h"><h3>Entregas vs devoluciones por día</h3>
            <span className="legend-i"><i style={{ background: "#2f6bff" }} />Entregas <i style={{ background: "#f59e0b" }} />Devoluciones</span></div>
          <BarChart data={dias.map((d) => ({ l: fmtDia(d.fecha), a: d.entregas, b: d.devoluciones }))} />
        </section>
        <section className="card">
          <div className="card-h"><h3>Vehículos en operación</h3><button className="link" onClick={() => ir("rutas")}>Ver todos →</button></div>
          {!vehs.length && <div className="empty">No hay rutas abiertas</div>}
          {vehs.map((v) => (
            <div key={v.id} className="veh">
              <div className="veh-ic">🚚</div>
              <div className="veh-b">
                <b>{(v.placa || "-")} · {v.auxiliar || v.conductor}</b>
                <small>Planilla {v.planilla || "-"} · {v.hechas}/{v.total} entregas</small>
                <Progress pct={v.pct} color={v.pct >= 100 ? "#22c55e" : "#2f6bff"} />
              </div>
              <span className="veh-pct">{v.pct}%</span>
            </div>
          ))}
        </section>
      </div>

      <div className="adm-grid g-3">
        <section className="card">
          <div className="card-h"><h3>🏆 Mejores entregadores</h3><button className="link" onClick={() => ir("reportes")}>Ranking →</button></div>
          {!top.length && <div className="empty">Aún no hay entregas confirmadas</div>}
          {top.slice(0, 5).map((a) => (
            <div key={a.auxiliar} className="rank-row">
              <span className={"medal m" + Math.min(a.puesto, 4)}>{a.puesto}</span>
              <div className="rank-b"><b>{a.auxiliar}</b><small>{a.entregadas}/{a.gestionadas} entregas · {a.devoluciones} dev.</small></div>
              <span className="rank-pct">{a.pctEfectividad}%</span>
            </div>
          ))}
        </section>
        <section className="card">
          <div className="card-h"><h3>Estado de las facturas</h3></div>
          <Donut total={r.facturas} parts={Object.entries(estados).map(([l, v]) => ({ l, v }))} />
        </section>
        <section className="card">
          <div className="card-h"><h3>Actividad reciente</h3></div>
          {!actividad.length && <div className="empty">Sin actividad</div>}
          {actividad.map((f, i) => (
            <div key={i} className="act">
              <span className="act-ic">{ICON[f.estado] || "✅"}</span>
              <div><b>{f.estado === "OK" ? "Entrega confirmada" : f.estado}</b> — {f.cliente}<small>{new Date(f.entregada_at).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" })} · {f.ruta && (f.ruta.placa || f.ruta.auxiliar)}</small></div>
            </div>
          ))}
        </section>
      </div>

      <div className="adm-grid g-2">
        <section className="card">
          <div className="card-h"><h3>📍 Seguimiento GPS de entregas</h3>
            <span className="legend-i"><i style={{ background: "#22c55e" }} />OK <i style={{ background: "#f59e0b" }} />Parcial <i style={{ background: "#ef4444" }} />Total</span></div>
          {conGps.length
            ? <Suspense fallback={<div className="empty">Cargando mapa...</div>}><MapaGps facturas={conGps} /></Suspense>
            : <div className="empty">Aún no hay entregas con coordenadas GPS. Se guardan cuando el auxiliar confirma una entrega con la ubicación activada.</div>}
        </section>
        <section className="card">
          <div className="card-h"><h3>Resumen económico</h3></div>
          <div className="money-grid">
            <div><small>Valor facturado</small><b>{fmtMoney(r.valorFacturado)}</b></div>
            <div><small>Valor a recaudar (entregado)</small><b>{fmtMoney(r.recaudo)}</b></div>
            <div><small>Valor devuelto</small><b className="neg">{fmtMoney(r.valorDevuelto)}</b></div>
            <div><small>Unidades devueltas</small><b>{r.unidadesDevueltas}</b></div>
          </div>
          <div className="card-h" style={{ marginTop: 14 }}><h3>Tendencia de entregas</h3></div>
          <AreaChart data={dias.map((d) => ({ l: fmtDia(d.fecha), v: d.entregas }))} height={150} />
        </section>
      </div>
    </>
  );
}
