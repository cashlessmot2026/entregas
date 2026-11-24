import { useMemo, useState } from "react";
import { resumen, rankingAuxiliares, rankingClientes, detalleDevoluciones, fmtMoney } from "./analytics.js";
import { exportarExcel, exportarPdf } from "./reportes.js";

const TABS = [
  { id: "ranking", label: "🏆 Ranking de auxiliares" },
  { id: "clientes", label: "👥 Clientes con devoluciones" },
  { id: "devoluciones", label: "↩️ Detalle de devoluciones" }
];

export default function AdminReportes({ ds, data, filtros, setFiltros, rangoTxt, toast }) {
  const [tab, setTab] = useState("ranking");
  const [bajando, setBajando] = useState("");

  const rep = useMemo(() => ({
    ranking: rankingAuxiliares(data), clientes: rankingClientes(data), detalle: detalleDevoluciones(data), resumen: resumen(data)
  }), [data]);
  const r = rep.resumen;
  const auxNombres = useMemo(() => [...new Set((ds ? ds.rutas : []).map((x) => x.auxiliar).filter(Boolean))].sort(), [ds]);
  const descripcion = rangoTxt + (filtros.aux ? " · Auxiliar: " + filtros.aux : "") + (filtros.cliente ? " · Cliente: " + filtros.cliente : "");

  const bajar = async (fmt, kinds) => {
    setBajando(fmt + kinds.join());
    try {
      if (fmt === "pdf") await exportarPdf(kinds, rep, descripcion);
      else await exportarExcel(kinds, rep, descripcion);
    } catch (e) { console.error(e); toast("No se pudo generar el archivo", "error"); }
    finally { setBajando(""); }
  };
  const botones = (kinds, etiqueta) => (
    <div className="dl">
      <button className="btn btn-sm btn-outline" disabled={!!bajando} onClick={() => bajar("pdf", kinds)}>📄 {etiqueta} PDF</button>
      <button className="btn btn-sm btn-primary" disabled={!!bajando} onClick={() => bajar("xlsx", kinds)}>📊 {etiqueta} Excel</button>
    </div>
  );

  if (!ds) return <div className="empty">Cargando datos...</div>;

  return (
    <section id="reportes-sec" className="rep-sec">
      <h2 className="rep-title">📊 Reportes <small className="muted">{rangoTxt}</small></h2>
      <div className="kpis kpis-s">
        <div className="kpi k-red"><b>{r.conDevolucion}</b><small>Facturas con devolución</small></div>
        <div className="kpi k-orange"><b>{r.unidadesDevueltas}</b><small>Unidades devueltas</small></div>
        <div className="kpi k-purple"><b>{fmtMoney(r.valorDevuelto)}</b><small>Valor devuelto</small></div>
        <div className="kpi k-blue"><b>{r.efectividad}%</b><small>Efectividad de entrega</small></div>
      </div>

      <section className="card">
        <div className="filtros">
          <div><label>Auxiliar</label>
            <select className="inp sm" value={filtros.aux} onChange={(e) => setFiltros((f) => ({ ...f, aux: e.target.value }))}>
              <option value="">Todos</option>{auxNombres.map((n) => <option key={n}>{n}</option>)}
            </select></div>
          <div><label>Cliente</label>
            <input className="inp sm" value={filtros.cliente} onChange={(e) => setFiltros((f) => ({ ...f, cliente: e.target.value }))} placeholder="Nombre del cliente" /></div>
          <div className="grow" />
          {botones(["resumen", "ranking", "clientes", "devoluciones"], "Reporte completo")}
        </div>
      </section>

      <div className="tabs">{TABS.map((t) => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}</div>

      <section className="card">
        <div className="card-h"><h3>{TABS.find((t) => t.id === tab).label.slice(3)}</h3>{botones([tab], "Este reporte")}</div>

        {tab === "ranking" && (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Auxiliar</th><th>Rutas</th><th>Entregas OK</th><th>Dev. parc.</th><th>Dev. tot.</th><th>% Efectividad</th><th>% Devolución</th><th>Unid. devueltas</th><th>Valor devuelto</th></tr></thead>
            <tbody>
              {rep.ranking.map((a) => (
                <tr key={a.auxiliar}>
                  <td><span className={"medal m" + Math.min(a.puesto, 4)}>{a.puesto}</span></td>
                  <td><b>{a.auxiliar}</b><small className="d-block">{a.entregadas}/{a.gestionadas} gestionadas · {a.pendientes} pendientes</small></td>
                  <td>{a.rutas}</td><td>{a.entregadas}</td><td>{a.devParciales}</td><td>{a.devTotales}</td>
                  <td><span className={"bdg " + (a.pctEfectividad >= 90 ? "b-green" : a.pctEfectividad >= 75 ? "b-orange" : "b-red")}>{a.pctEfectividad}%</span></td>
                  <td>{a.pctDevolucion}%</td><td>{a.unidades}</td><td>{fmtMoney(a.valorDev)}</td>
                </tr>
              ))}
              {!rep.ranking.length && <tr><td colSpan={10} className="empty">Sin datos en el período</td></tr>}
            </tbody>
          </table></div>
        )}

        {tab === "clientes" && (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Cliente</th><th>Facturas con devolución</th><th>Unidades</th><th>Valor devuelto</th><th>Última</th><th>Auxiliar(es)</th></tr></thead>
            <tbody>
              {rep.clientes.map((c, i) => (
                <tr key={c.cliente}><td>{i + 1}</td><td><b>{c.cliente}</b></td><td>{c.facturas}</td><td>{c.unidades}</td><td>{fmtMoney(c.valor)}</td><td>{c.ultima}</td><td>{c.auxiliares}</td></tr>
              ))}
              {!rep.clientes.length && <tr><td colSpan={7} className="empty">No hay devoluciones en el período</td></tr>}
            </tbody>
          </table></div>
        )}

        {tab === "devoluciones" && (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Fecha</th><th>Auxiliar</th><th>Planilla</th><th>Vehículo</th><th>Cliente</th><th>Factura</th><th>Tipo</th><th>Causal</th><th>Producto</th><th>Cant.</th><th>Valor</th></tr></thead>
            <tbody>
              {rep.detalle.map((d, i) => (
                <tr key={i}><td>{d.fecha}</td><td>{d.auxiliar}</td><td>{d.planilla}</td><td>{d.placa}</td><td>{d.cliente}</td><td>{d.factura}</td>
                  <td><span className={"bdg " + (d.tipo === "Total" ? "b-red" : "b-orange")}>{d.tipo}</span></td><td>{d.causal}</td><td>{d.producto}</td><td>{d.cantidad}</td><td>{fmtMoney(d.valor)}</td></tr>
              ))}
              {!rep.detalle.length && <tr><td colSpan={11} className="empty">No hay devoluciones en el período</td></tr>}
            </tbody>
          </table></div>
        )}
      </section>
    </section>
  );
}
