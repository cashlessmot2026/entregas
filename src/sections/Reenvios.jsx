import { useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { money, num } from "../lib/utils.js";
import { ESTADOS_ENTREGA, FORMAS_PAGO } from "../lib/constants.js";

const VACIO = { numero: "", cliente: "", vendedor: "", valor: "", formaPago: "", estado: "Reenvío", observaciones: "" };

/* Facturas de reenvío: se registran con los mismos datos de una factura de la planilla (cliente, factura, vendedor,
   valor, forma de pago, estado...). Son solo un registro: NO suman al cuadre del día. Salen listadas en la casilla NOTA del PDF del cuadre. */
export default function Reenvios() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [f, setF] = useState(VACIO);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const total = state.reenvios.reduce((s, r) => s + num(r.valor), 0);

  const agregar = () => {
    if (!f.numero.trim() || !f.cliente.trim()) { toast("Ingresa el número de factura y el nombre del cliente", "error"); return; }
    if (!num(f.valor)) { toast("Ingresa el valor total de la factura", "error"); return; }
    actions.addReenvio({ numero: f.numero.trim(), cliente: f.cliente.trim(), vendedor: f.vendedor, valor: num(f.valor),
      formaPago: f.formaPago, estado: f.estado, observaciones: f.observaciones.trim() });
    setF(VACIO);
    toast("Factura de reenvío agregada", "success");
  };

  return (
    <div className="panel">
      <h2>📦 Facturas de reenvío (registro manual)</h2>
      <p className="hint">Se registran con los mismos datos de una factura, pero <b>no se suman</b> al cuadre del día: solo quedan como registro y se relacionan en la casilla NOTA del PDF del cuadre.</p>
      <div className="grid grid-3">
        <div className="field-row"><label>Número de factura *</label><input className="inp" value={f.numero} onChange={set("numero")} /></div>
        <div className="field-row"><label>Nombre del cliente *</label><input className="inp" list="clientesDatalist" value={f.cliente} onChange={set("cliente")} /></div>
        <div className="field-row"><label>Vendedor</label>
          <select className="inp" value={f.vendedor} onChange={set("vendedor")}>
            <option value="">Seleccionar...</option>
            {state.vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
        </div>
        <div className="field-row"><label>Valor total factura ($) *</label><input className="inp" type="number" inputMode="numeric" value={f.valor} onChange={set("valor")} /></div>
        <div className="field-row"><label>Forma de pago</label>
          <select className="inp" value={f.formaPago} onChange={set("formaPago")}>
            <option value="">Seleccionar...</option>
            {FORMAS_PAGO.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div className="field-row"><label>Estado</label>
          <select className="inp" value={f.estado} onChange={set("estado")}>
            {ESTADOS_ENTREGA.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
        </div>
      </div>
      <div className="field-row"><label>Observaciones</label><input className="inp" value={f.observaciones} onChange={set("observaciones")} placeholder="Opcional" /></div>
      <button className="btn btn-primary" onClick={agregar}>+ Agregar reenvío</button>
      <div className="tbl-scroll" style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="doc-tbl">
          <thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Vendedor</th><th>Forma de pago</th><th>Estado</th><th>Valor</th><th>Observaciones</th><th></th></tr></thead>
          <tbody>
            {!state.reenvios.length ? (
              <tr><td colSpan={9} className="empty-row">No hay facturas de reenvío registradas.</td></tr>
            ) : state.reenvios.map((r) => (
              <tr key={r.id}>
                <td>{r.fecha}</td><td>{r.numero}</td><td>{r.cliente || "-"}</td><td>{r.vendedor || "-"}</td><td>{r.formaPago || "-"}</td><td>{r.estado || "-"}</td>
                <td>{money(r.valor)}</td><td>{r.observaciones || ""}</td>
                <td><button className="btn btn-xs btn-danger" onClick={() => { if (confirm("¿Eliminar este reenvío?")) actions.deleteReenvio(r.id); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div className="field-row highlight"><label>Total reenvíos (informativo, no suma al cuadre)</label><div className="static-val">{money(total)}</div></div>
        <div className="field-row highlight"><label>Cantidad</label><div className="static-val">{state.reenvios.length}</div></div>
      </div>
    </div>
  );
}
