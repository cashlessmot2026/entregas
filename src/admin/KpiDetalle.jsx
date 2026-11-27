import { useMemo, useState } from "react";
import { fmtMoney } from "./analytics.js";

/* Detalle de las tarjetas de colores del dashboard: explica de dónde sale el número
   y lista los registros que lo forman (facturas o clientes). */
const key = (s) => String(s || "").trim().toUpperCase();
const hora = (t) => (t ? new Date(t).toLocaleString("es-CO", { hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short" }) : "-");
const ENTREGADA = (f) => f.confirmada && (f.estado === "OK" || f.estado === "Dev Parcial");

function TablaFacturas({ filas, conCausal }) {
  return (
    <div className="tbl-wrap"><table className="tbl">
      <thead><tr><th>Factura</th><th>Cliente</th><th>Auxiliar · Placa</th><th>Planilla</th><th>Estado</th>{conCausal && <th>Causal</th>}<th>Valor</th><th>Registrado</th></tr></thead>
      <tbody>
        {filas.map((f, i) => (
          <tr key={(f.ruta_id || "") + "|" + f.numero + "|" + i}>
            <td><b>{f.numero || "-"}</b></td>
            <td>{f.razon_social || f.cliente || "-"}{f.razon_social && f.cliente && key(f.razon_social) !== key(f.cliente) && <small className="d-block">{f.cliente}</small>}</td>
            <td>{(f.ruta && f.ruta.auxiliar) || "-"}<small className="d-block">{(f.ruta && f.ruta.placa) || ""}</small></td>
            <td className="nowrap">{(f.ruta && f.ruta.planilla) || "-"}<small className="d-block">{(f.ruta && f.ruta.fecha) || ""}</small></td>
            <td className="nowrap">{f.confirmada ? f.estado : "Pendiente"}</td>
            {conCausal && <td>{f.causal || "-"}</td>}
            <td className="nowrap">{fmtMoney(f.valor)}</td>
            <td className="nowrap">{f.confirmada ? hora(f.entregada_at) : "-"}</td>
          </tr>
        ))}
        {!filas.length && <tr><td colSpan={conCausal ? 8 : 7} className="empty">Sin registros</td></tr>}
      </tbody>
    </table></div>
  );
}

export default function KpiDetalle({ tipo, data, hoy, r, rangoTxt, onClose }) {
  const [q, setQ] = useState("");
  const t = key(q);

  const info = useMemo(() => {
    const fs = data.facturas;
    if (tipo === "devHoy") return {
      titulo: "↩️ Devoluciones del día", filas: hoy.devs, conCausal: true,
      fuente: `Facturas de las planillas con fecha de hoy (${hoy.fecha}) que el auxiliar confirmó con estado Dev Parcial o Dev Total. No depende del rango de fechas elegido arriba.`
    };
    if (tipo === "reenvHoy") return {
      titulo: "🔁 Reenvíos del día", filas: hoy.reenvios,
      fuente: `Facturas de las planillas con fecha de hoy (${hoy.fecha}) que el auxiliar confirmó con estado Reenvío. No depende del rango de fechas elegido arriba.`
    };
    if (tipo === "entregas") return {
      titulo: "✅ Entregas realizadas", filas: fs.filter(ENTREGADA), conCausal: true,
      fuente: `Facturas de las rutas del período (${rangoTxt}) confirmadas por el auxiliar como OK o Dev Parcial (el pedido se entregó, aunque fuera con devolución de algún producto). Efectividad ${r.efectividad}% = entregas ÷ facturas gestionadas (todas las confirmadas, incluidas Dev Total y Reenvío).`
    };
    if (tipo === "pendientes") return {
      titulo: "⏳ Facturas pendientes", filas: fs.filter((f) => !f.confirmada),
      fuente: `Facturas de las rutas del período (${rangoTxt}) que el auxiliar todavía no ha confirmado. Total de facturas cargadas en el período: ${r.facturas}.`
    };
    // clientes con novedades: agrupa los registros de devolución por cliente
    const m = new Map();
    data.devoluciones.forEach((d) => {
      const c = key(d.cliente) || "SIN CLIENTE";
      if (!m.has(c)) m.set(c, { cliente: c, registros: 0, facturas: new Set(), totales: 0, valor: 0, auxiliares: new Set() });
      const x = m.get(c);
      x.registros++; x.valor += Number(d.valor) || 0;
      if (d.factura) x.facturas.add(d.factura);
      if (d.tipo === "total") x.totales++;
      if (d.auxiliar) x.auxiliares.add(key(d.auxiliar));
    });
    return {
      titulo: "📦 Clientes con novedades", clientes: [...m.values()].sort((a, b) => b.facturas.size - a.facturas.size || b.valor - a.valor),
      fuente: `Clientes distintos que tienen al menos un registro de devolución (parcial o total) en las rutas del período (${rangoTxt}). La etiqueta "${r.conDevolucion} dev." son las facturas confirmadas como Dev Parcial o Dev Total.`
    };
  }, [tipo, data, hoy, r, rangoTxt]);

  const filas = info.filas ? info.filas.filter((f) => !t || [f.numero, f.cliente, f.razon_social, f.ruta && f.ruta.auxiliar, f.ruta && f.ruta.placa, f.estado, f.causal].some((v) => key(v).includes(t))) : null;
  const clientes = info.clientes ? info.clientes.filter((c) => !t || c.cliente.includes(t) || [...c.auxiliares].some((a) => a.includes(t))) : null;
  const n = filas ? filas.length : clientes.length;

  return (
    <div className="ed-over" onClick={onClose}>
      <div className="ed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-h"><h3>{info.titulo} <small className="muted">({n})</small></h3>
          <button className="btn btn-xs btn-outline" onClick={onClose}>✕ Cerrar</button></div>
        <div className="kpi-fuente"><b>¿De dónde sale este dato?</b> {info.fuente}</div>
        <input className="inp sm" style={{ width: "100%", margin: "8px 0" }} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar factura, cliente, auxiliar, placa..." />
        <div className="ed-body">
          {filas && <TablaFacturas filas={filas} conCausal={info.conCausal} />}
          {clientes && (
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>#</th><th>Cliente</th><th>Facturas</th><th>Registros</th><th>Dev. totales</th><th>Valor devuelto</th><th>Auxiliar</th></tr></thead>
              <tbody>
                {clientes.map((c, i) => (
                  <tr key={c.cliente}><td>{i + 1}</td><td><b>{c.cliente}</b><small className="d-block">{[...c.facturas].join(", ")}</small></td>
                    <td>{c.facturas.size}</td><td>{c.registros}</td><td>{c.totales}</td><td className="nowrap">{fmtMoney(c.valor)}</td><td>{[...c.auxiliares].join(", ") || "-"}</td></tr>
                ))}
                {!clientes.length && <tr><td colSpan={7} className="empty">Sin registros</td></tr>}
              </tbody>
            </table></div>
          )}
        </div>
      </div>
    </div>
  );
}
