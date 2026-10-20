import { useMemo } from "react";
import { useStore } from "../store.jsx";
import { money } from "../lib/utils.js";
import { facturaValor, facturaSaldoAPagar, facturaTotalDescuentos } from "../lib/calc.js";

export default function Dashboard({ onNavigate }) {
  const { state, actions } = useStore();
  const { route, facturas, devoluciones } = state;

  const k = useMemo(() => {
    const by = (e) => facturas.filter((f) => f.estado === e).length;
    return {
      total: facturas.length,
      ok: by("OK"),
      devP: by("Dev Parcial"),
      devT: by("Dev Total"),
      reenv: by("Reenvío"),
      entregadas: facturas.filter((f) => f.confirmada).length,
      valorTotal: facturas.reduce((s, f) => s + facturaValor(f), 0),
      descuentos: facturas.reduce((s, f) => s + facturaTotalDescuentos(f), 0),
      recaudo: facturas.reduce((s, f) => s + facturaSaldoAPagar(f, devoluciones), 0),
      sinValor: facturas.filter((f) => !facturaValor(f)).length
    };
  }, [facturas, devoluciones]);

  const field = (key, label, props = {}) => (
    <div className="field-row">
      <label>{label}</label>
      <input className="inp" value={route[key] || ""} onChange={(e) => actions.updateRoute(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <>
      <div className="panel">
        <h2>🚚 Datos de la ruta</h2>
        <p className="hint">Se llenan automáticamente al cargar la planilla de facturas. Puedes corregirlos aquí.</p>
        <div className="grid grid-5">
          <div className="field-row"><label>Auxiliar</label><div className="static-val">{route.auxiliar || "-"}</div></div>
          {field("conductor", "Nombre del conductor", { placeholder: "Ej: Carlos Pérez" })}
          {field("placa", "Vehículo (placa)", { placeholder: "Ej: BHK-744" })}
          {field("fecha", "Fecha", { type: "date" })}
          {field("planilla", "Número de planilla", { placeholder: "Ej: 4633" })}
        </div>
        {!facturas.length && (
          <button className="btn btn-primary" onClick={() => onNavigate("entregas")}>📥 Cargar planilla de facturas</button>
        )}
      </div>

      <div className="panel">
        <h2>📊 Consolidado por estado</h2>
        <div className="dash-cards">
          <div className="dash-card"><div className="val">{k.total}</div><div className="lbl">Total facturas</div></div>
          <div className="dash-card"><div className="val">{k.entregadas}/{k.total}</div><div className="lbl">Entregas confirmadas</div></div>
          <div className="dash-card"><div className="val">{k.ok}</div><div className="lbl">OK</div></div>
          <div className="dash-card"><div className="val">{k.devP}</div><div className="lbl">Dev. Parcial</div></div>
          <div className="dash-card"><div className="val">{k.devT}</div><div className="lbl">Dev. Total</div></div>
          <div className="dash-card"><div className="val">{k.reenv}</div><div className="lbl">Reenvío</div></div>
          <div className="dash-card"><div className="val">{money(k.valorTotal)}</div><div className="lbl">Valor total facturado</div></div>
          <div className="dash-card"><div className="val">{money(k.descuentos)}</div><div className="lbl">Descuentos</div></div>
          <div className="dash-card"><div className="val">{money(k.recaudo)}</div><div className="lbl">Valor a recaudar</div></div>
        </div>
        {k.sinValor > 0 && (
          <div style={{ marginTop: 12 }}>
            <span className="badge badge-warn">⚠ {k.sinValor} factura(s) sin valor digitado</span>
          </div>
        )}
      </div>
    </>
  );
}
