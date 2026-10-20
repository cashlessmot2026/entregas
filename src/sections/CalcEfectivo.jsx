import { useMemo } from "react";
import { useStore } from "../store.jsx";
import { DENOMINACIONES_EFECTIVO } from "../lib/constants.js";
import { computeCuadre } from "../lib/calc.js";
import { money, num } from "../lib/utils.js";

export default function CalcEfectivo() {
  const { state, actions } = useStore();
  const totalRuta = useMemo(() => computeCuadre(state.facturas, state.devoluciones).totalEfectivo, [state.facturas, state.devoluciones]);
  const totalContado = DENOMINACIONES_EFECTIVO.reduce((s, d) => s + d * num(state.calcEfectivo[d]), 0);
  const diff = Math.round(totalContado - totalRuta);

  return (
    <div className="panel">
      <h2>💵 Calculadora de monedas y billetes</h2>
      <p className="hint">Ingresa la cantidad recaudada de cada denominación para calcular el total en efectivo y compararlo con el total de efectivo de la ruta.</p>
      <table className="doc-tbl">
        <thead><tr><th>Denominación</th><th>Cantidad</th><th>Subtotal</th></tr></thead>
        <tbody>
          {DENOMINACIONES_EFECTIVO.map((den) => {
            const cant = num(state.calcEfectivo[den]);
            return (
              <tr key={den}>
                <td>{money(den)}</td>
                <td><input className="cellinput sm" type="number" min="0" inputMode="numeric" value={cant || ""} onChange={(e) => actions.setCalc(den, e.target.value)} /></td>
                <td>{money(den * cant)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div className="grid grid-3" style={{ marginTop: 12 }}>
        <div className="field-row highlight"><label>Total contado</label><div className="static-val">{money(totalContado)}</div></div>
        <div className="field-row highlight"><label>Total efectivo de la ruta</label><div className="static-val">{money(totalRuta)}</div></div>
        <div className="field-row highlight"><label>Diferencia</label><div className="static-val">{money(diff)}</div></div>
      </div>
      <div style={{ marginTop: 10 }}>
        {Math.abs(diff) < 1 ? <span className="badge badge-ok">✔ El efectivo contado coincide con el total de efectivo de la ruta</span>
          : diff > 0 ? <span className="badge badge-warn">⚠ Hay {money(diff)} de más respecto al efectivo de la ruta</span>
            : <span className="badge badge-danger">⚠ Faltan {money(Math.abs(diff))} respecto al efectivo de la ruta</span>}
      </div>
      <button className="btn btn-outline" style={{ marginTop: 10 }} onClick={actions.clearCalc}>🧹 Limpiar cantidades</button>
    </div>
  );
}
