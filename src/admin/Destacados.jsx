import { useMemo, useState } from "react";
import { destacados } from "./analytics.js";

/* Quién entregó más, quién devolvió más, cliente con más devoluciones y causal más usada,
   con cantidad y porcentaje, según el rango de fechas del dashboard. */
function Panel({ icono, titulo, unidad, d, detalle }) {
  const lider = d.items[0];
  return (
    <div className="dest-panel">
      <div className="dest-h"><span>{icono}</span><b>{titulo}</b></div>
      {lider ? (
        <div className="dest-lider"><small>{detalle}</small><b>{lider.nombre}</b><em>{lider.cantidad} {unidad} · {lider.pct}%</em></div>
      ) : <div className="empty">Sin datos en este rango</div>}
      <div className="dest-lista">
        {d.items.map((x, i) => (
          <div key={x.nombre} className="dest-row">
            <span className="dest-n">{i + 1}</span>
            <div className="dest-b"><b title={x.nombre}>{x.nombre}</b><div className="dest-bar"><i style={{ width: Math.max(2, x.pct) + "%" }} /></div></div>
            <span className="dest-v"><b>{x.cantidad}</b><small>{x.pct}%</small></span>
          </div>
        ))}
      </div>
      {lider && <div className="dest-total">Total: <b>{d.total}</b> {unidad}</div>}
    </div>
  );
}

export default function Destacados({ data }) {
  const [asc, setAsc] = useState(false);
  const d = useMemo(() => destacados(data, asc), [data, asc]);
  return (
    <section className="card">
      <div className="card-h"><h3>🏅 Destacados del período</h3>
        <button className="btn btn-xs btn-outline" onClick={() => setAsc(!asc)}>{asc ? "↑ Menor a mayor" : "↓ Mayor a menor"}</button></div>
      <div className="dest-grid">
        <Panel icono="🚚" titulo="Más pedidos entregados" unidad="entregas" d={d.entregas} detalle="Auxiliar / conductor con más entregas" />
        <Panel icono="↩️" titulo="Más devoluciones" unidad="devoluciones" d={d.devs} detalle="Auxiliar / conductor con más devoluciones" />
        <Panel icono="🏪" titulo="Clientes con más devoluciones" unidad="facturas" d={d.clientes} detalle="Cliente con más devoluciones" />
        <Panel icono="📋" titulo="Causales de devolución" unidad="facturas" d={d.causales} detalle="Causal más usada" />
      </div>
    </section>
  );
}
