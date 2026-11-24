import { useMemo, useState } from "react";
import { destacados } from "./analytics.js";

/* Quién entregó más, quién devolvió más, vendedor y cliente con más devoluciones y causal más usada,
   con cantidad y porcentaje, según el rango de fechas del dashboard.
   Al tocar una tarjeta se abre el listado completo (también los que están en 0). */
function Panel({ icono, titulo, unidad, d, detalle, onVer }) {
  const lider = d.items[0];
  return (
    <div className="dest-panel dest-click" role="button" tabIndex={0} onClick={onVer} onKeyDown={(e) => e.key === "Enter" && onVer()} title="Ver el listado completo">
      <div className="dest-h"><span>{icono}</span><b>{titulo}</b><small className="dest-ver">Ver todo ›</small></div>
      {lider ? (
        <div className="dest-lider"><small>{detalle}</small><b>{lider.nombre}</b><em>{lider.cantidad} {unidad} · {lider.pct}%</em></div>
      ) : <div className="empty">Sin datos en este rango</div>}
      <div className="dest-lista">
        {d.items.slice(0, 6).map((x, i) => (
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

function Detalle({ info, onClose }) {
  const [q, setQ] = useState("");
  const t = q.trim().toUpperCase();
  const l = info.d.todos.filter((x) => !t || x.nombre.toUpperCase().includes(t));
  return (
    <div className="ed-over" onClick={onClose}>
      <div className="ed-modal" style={{ width: "min(640px,100%)" }} onClick={(e) => e.stopPropagation()}>
        <div className="card-h"><h3>{info.icono} {info.titulo} <small className="muted">({info.d.todos.length} · total {info.d.total} {info.unidad})</small></h3>
          <button className="btn btn-xs btn-outline" onClick={onClose}>✕ Cerrar</button></div>
        <input className="inp sm" style={{ width: "100%", marginBottom: 8 }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." />
        <div className="ed-body">
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>#</th><th>Nombre</th><th>Cantidad</th><th>%</th></tr></thead>
            <tbody>
              {l.map((x) => <tr key={x.nombre} className={x.cantidad ? "" : "cero"}><td>{info.d.todos.indexOf(x) + 1}</td><td>{x.nombre}</td><td><b>{x.cantidad}</b></td><td>{x.pct}%</td></tr>)}
              {!l.length && <tr><td colSpan={4} className="empty">Sin resultados</td></tr>}
            </tbody>
          </table></div>
        </div>
      </div>
    </div>
  );
}

export default function Destacados({ data }) {
  const [asc, setAsc] = useState(false);
  const [ver, setVer] = useState(null);
  const d = useMemo(() => destacados(data, asc), [data, asc]);
  const P = {
    entregas: { icono: "🚚", titulo: "Más pedidos entregados", unidad: "entregas", detalle: "Auxiliar / conductor con más entregas" },
    devs: { icono: "↩️", titulo: "Más devoluciones", unidad: "devoluciones", detalle: "Auxiliar / conductor con más devoluciones" },
    vendedores: { icono: "🧑‍💼", titulo: "Vendedor con más devoluciones", unidad: "devoluciones", detalle: "Vendedor con más devoluciones" },
    clientes: { icono: "🏪", titulo: "Clientes con más devoluciones", unidad: "facturas", detalle: "Cliente con más devoluciones" },
    causales: { icono: "📋", titulo: "Causales de devolución", unidad: "facturas", detalle: "Causal más usada" }
  };
  const info = ver ? { ...P[ver], d: d[ver] } : null;
  return (
    <section className="card">
      <div className="card-h"><h3>🏅 Destacados del período</h3>
        <button className="btn btn-xs btn-outline" onClick={() => setAsc(!asc)}>{asc ? "↑ Menor a mayor" : "↓ Mayor a menor"}</button></div>
      <div className="dest-grid">
        {Object.keys(P).map((k) => <Panel key={k} {...P[k]} d={d[k]} onVer={() => setVer(k)} />)}
      </div>
      {info && <Detalle info={info} onClose={() => setVer(null)} />}
    </section>
  );
}
