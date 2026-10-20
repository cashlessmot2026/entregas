import { useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { money, num } from "../lib/utils.js";

export default function Reenvios() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [numero, setNumero] = useState("");
  const [valor, setValor] = useState("");
  const total = state.reenvios.reduce((s, r) => s + num(r.valor), 0);

  const agregar = () => {
    if (!numero.trim() || !num(valor)) { toast("Ingresa número de factura y valor total", "error"); return; }
    actions.addReenvio(numero.trim(), num(valor));
    setNumero(""); setValor("");
    toast("Factura de reenvío agregada", "success");
  };

  return (
    <div className="panel">
      <h2>📦 Facturas de reenvío (registro manual)</h2>
      <p className="hint">Estas facturas llevan su propio consolidado y no afectan el cuadre principal de la sección 3.</p>
      <div className="grid grid-3">
        <div className="field-row"><label>Número de factura</label><input className="inp" value={numero} onChange={(e) => setNumero(e.target.value)} /></div>
        <div className="field-row"><label>Valor total factura</label><input className="inp" type="number" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
        <div className="field-row" style={{ alignSelf: "end" }}><button className="btn btn-primary" onClick={agregar} style={{ width: "100%", justifyContent: "center" }}>+ Agregar</button></div>
      </div>
      <table className="doc-tbl">
        <thead><tr><th>Fecha</th><th>Factura</th><th>Valor</th><th></th></tr></thead>
        <tbody>
          {!state.reenvios.length ? (
            <tr><td colSpan={4} className="empty-row">No hay facturas de reenvío manuales registradas.</td></tr>
          ) : state.reenvios.map((r) => (
            <tr key={r.id}>
              <td>{r.fecha}</td><td>{r.numero}</td><td>{money(r.valor)}</td>
              <td><button className="btn btn-xs btn-danger" onClick={() => actions.deleteReenvio(r.id)}>✕</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div className="field-row highlight"><label>Total reenvíos</label><div className="static-val">{money(total)}</div></div>
        <div className="field-row highlight"><label>Cantidad</label><div className="static-val">{state.reenvios.length}</div></div>
      </div>
    </div>
  );
}
