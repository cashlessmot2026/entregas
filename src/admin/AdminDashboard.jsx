import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { resumen, rankingAuxiliares, entregasPorDia, porEstado, vehiculos, fmtMoney, filtrar } from "./analytics.js";
import { BarChart, Donut, Progress } from "./charts.jsx";
import Destacados from "./Destacados.jsx";
import KpiDetalle from "./KpiDetalle.jsx";
import IndicadoresTrimestrales from "./IndicadoresTrimestrales.jsx";
import AdminReportes from "./AdminReportes.jsx";

const hoyStr = () => { const d = new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };
const esDev = (f) => f.estado === "Dev Parcial" || f.estado === "Dev Total";

export default function AdminDashboard({ pass, ds, data, cargando, ir, filtros, setFiltros, rangoTxt, toast }) {
  const irReportes = () => { const el = document.getElementById("reportes-sec"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); };
  // planillas de hoy, independiente del rango de fechas elegido arriba (tarjetas "del día")
  const [hoyDs, setHoyDs] = useState(null);
  useEffect(() => {
    const h = hoyStr();
    adminApi.dataset(pass, h, h).then(setHoyDs).catch(() => {});
  }, [pass, ds]);
  const hoyData = useMemo(() => filtrar(hoyDs), [hoyDs]);
  const hoyDevs = useMemo(() => hoyData.facturas.filter((f) => f.confirmada && esDev(f)), [hoyData]);
  const hoyReenv = useMemo(() => hoyData.facturas.filter((f) => f.confirmada && f.estado === "Reenvío"), [hoyData]);
  const [kpi, setKpi] = useState(null);

  const r = useMemo(() => resumen(data), [data]);
  const ranking = useMemo(() => rankingAuxiliares(data), [data]);
  const dias = useMemo(() => entregasPorDia(data), [data]);
  const estados = useMemo(() => porEstado(data), [data]);
  const vehs = useMemo(() => vehiculos(data), [data]);
  const novedades = useMemo(() => [...data.devoluciones].sort((a, b) => String(b.fecha || "").localeCompare(String(a.fecha || ""))), [data]);
  const fmtDia = (d) => d.slice(8) + "/" + d.slice(5, 7);

  if (!ds) return <div className="empty">{cargando ? "Cargando datos..." : "Sin datos"}</div>;

  const top = ranking.filter((a) => a.gestionadas > 0);

  return (
    <>
      <div className="kpis k5">
        <button className="kpi kpi-btn k-blue" onClick={() => setKpi("devHoy")} title="Ver de dónde sale este dato"><span className="kpi-ic">↩️</span><b>{hoyDevs.length}</b><small>Devoluciones del día</small><em>hoy</em><i className="kpi-ver">Ver detalle ›</i></button>
        <button className="kpi kpi-btn k-teal" onClick={() => setKpi("reenvHoy")} title="Ver de dónde sale este dato"><span className="kpi-ic">🔁</span><b>{hoyReenv.length}</b><small>Reenvíos del día</small><em>hoy</em><i className="kpi-ver">Ver detalle ›</i></button>
        <button className="kpi kpi-btn k-green" onClick={() => setKpi("entregas")} title="Ver de dónde sale este dato"><span className="kpi-ic">✅</span><b>{r.entregadas}</b><small>Entregas realizadas</small><em>{r.efectividad}%</em><i className="kpi-ver">Ver detalle ›</i></button>
        <button className="kpi kpi-btn k-orange" onClick={() => setKpi("pendientes")} title="Ver de dónde sale este dato"><span className="kpi-ic">⏳</span><b>{r.pendientes}</b><small>Pendientes</small><em>{r.facturas} facturas</em><i className="kpi-ver">Ver detalle ›</i></button>
        <button className="kpi kpi-btn k-purple" onClick={() => setKpi("clientes")} title="Ver de dónde sale este dato"><span className="kpi-ic">📦</span><b>{r.clientesNovedad}</b><small>Clientes con novedades</small><em>{r.conDevolucion} dev.</em><i className="kpi-ver">Ver detalle ›</i></button>
      </div>
      {kpi && <KpiDetalle tipo={kpi} data={data} hoy={{ fecha: hoyStr(), devs: hoyDevs, reenvios: hoyReenv }} r={r} rangoTxt={rangoTxt} onClose={() => setKpi(null)} />}

      <Destacados data={data} />

      <div className="adm-grid g-main">
        <section className="card">
          <div className="card-h"><h3>Entregas vs devoluciones por día</h3>
            <span className="legend-i"><i style={{ background: "#2f6bff" }} />Entregas <i style={{ background: "#f59e0b" }} />Devoluciones</span></div>
          <BarChart data={dias.map((d) => ({ l: fmtDia(d.fecha), a: d.entregas, b: d.devoluciones }))} />
        </section>
        <section className="card">
          <div className="card-h"><h3>Rutas del período <small className="muted">({vehs.length})</small></h3><button className="link" onClick={() => ir("rutas")}>Ver todas →</button></div>
          {!vehs.length && <div className="empty">No hay rutas en este rango de fechas</div>}
          <div className="scroll-card">{vehs.map((v) => (
            <div key={v.id} className="veh">
              <div className="veh-ic">🚚</div>
              <div className="veh-b">
                <b>{(v.placa || "-")} · {v.auxiliar || v.conductor}</b>
                <small>{v.fecha ? v.fecha + " · " : ""}Planilla {v.planilla || "-"} · {v.hechas}/{v.total} entregas</small>
                <Progress pct={v.pct} color={v.pct >= 100 ? "#22c55e" : "#2f6bff"} />
              </div>
              <span className="veh-pct">{v.pct}%</span>
            </div>
          ))}</div>
        </section>
      </div>

      <div className="adm-grid g-3">
        <section className="card">
          <div className="card-h"><h3>🏆 Mejores entregadores</h3><button className="link" onClick={irReportes}>Ranking →</button></div>
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
          <div className="card-h"><h3>⚠️ Novedades <small className="muted">({novedades.length})</small></h3><button className="link" onClick={irReportes}>Ver reportes →</button></div>
          {!novedades.length && <div className="empty">Sin novedades en el período</div>}
          <div className="scroll-card">{novedades.map((d, i) => (
            <div key={i} className={"novedad" + (d.tipo === "total" ? " rojo" : "")}>
              <b>{d.cliente || "-"}</b> · factura {d.factura || "-"} · {d.tipo === "total" ? "Devolución total" : "Devolución"}
              <br /><small>{d.causal || "Sin causal"}{d.producto && d.producto !== "DEVOLUCIÓN TOTAL DE FACTURA" ? " · " + d.producto : ""} · {fmtMoney(d.valor)} · {d.auxiliar || ""} {d.placa ? "(" + d.placa + ")" : ""}</small>
            </div>
          ))}</div>
        </section>
      </div>

      <AdminReportes ds={ds} data={data} filtros={filtros} setFiltros={setFiltros} rangoTxt={rangoTxt} toast={toast} />

      <IndicadoresTrimestrales pass={pass} toast={toast} />
    </>
  );
}
