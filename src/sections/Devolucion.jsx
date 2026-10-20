import { useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { CAUSALES } from "../lib/constants.js";
import { money, num } from "../lib/utils.js";
import { printWithClass } from "../lib/exporters.js";

const VACIO = { fecha: "", placa: "", cliente: "", factura: "", asesor: "", causal: "", codigoProducto: "", descripcion: "", cantidad: "", valor: "" };

export default function Devolucion() {
  const { state, actions } = useStore();
  const toast = useToast();
  const { route, devoluciones, vendedores } = state;
  const [form, setForm] = useState(VACIO);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const agregar = () => {
    if (!form.cliente.trim() || !form.factura.trim() || !form.descripcion.trim() || !num(form.cantidad)) {
      toast("Completa cliente, factura, descripción y cantidad", "error");
      return;
    }
    const fac = state.facturas.find((f) => String(f.numero) === form.factura.trim());
    actions.addDevolucion({
      ...form,
      tipo: "manual",
      facturaId: fac ? fac.id : null,
      fecha: form.fecha || route.fecha,
      placa: form.placa || route.placa,
      cantidad: num(form.cantidad),
      valor: num(form.valor)
    });
    setForm((f) => ({ ...VACIO, fecha: f.fecha, placa: f.placa }));
    toast("Devolución agregada al documento", "success");
  };

  const total = devoluciones.reduce((s, d) => s + num(d.valor), 0);

  return (
    <>
      <div className="panel no-print">
        <h2>↩️ Agregar devolución manual</h2>
        <div className="grid grid-4">
          <div className="field-row"><label>Fecha</label><input className="inp" type="date" value={form.fecha || route.fecha} onChange={set("fecha")} /></div>
          <div className="field-row"><label>Placa</label><input className="inp" value={form.placa || route.placa} onChange={set("placa")} /></div>
          <div className="field-row"><label>Cliente</label><input className="inp" list="clientesDatalist" value={form.cliente} onChange={set("cliente")} /></div>
          <div className="field-row"><label>Factura</label><input className="inp" value={form.factura} onChange={set("factura")} /></div>
          <div className="field-row"><label>Asesor comercial</label>
            <select className="inp" value={form.asesor} onChange={set("asesor")}>
              <option value="">Seleccionar...</option>
              {vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
          <div className="field-row"><label>Causal</label>
            <select className="inp" value={form.causal} onChange={set("causal")}>
              <option value="">Seleccionar...</option>
              {CAUSALES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div className="field-row"><label>Código producto</label><input className="inp" value={form.codigoProducto} onChange={set("codigoProducto")} /></div>
          <div className="field-row"><label>Descripción</label><input className="inp" list="productosDatalist" value={form.descripcion} onChange={set("descripcion")} /></div>
          <div className="field-row"><label>Cantidad</label><input className="inp" type="number" value={form.cantidad} onChange={set("cantidad")} /></div>
          <div className="field-row"><label>Valor ($)</label><input className="inp" type="number" value={form.valor} onChange={set("valor")} /></div>
        </div>
        <button className="btn btn-primary" onClick={agregar}>+ Agregar al documento</button>
      </div>

      <div className="panel" id="printDevolucion">
        <h2 style={{ margin: 0 }}>📄 Formato Devolución de Pedidos — F-GL-001</h2>
        <p className="hint">
          LICONSUMAR Del Magdalena · Fecha: {route.fecha || "-"} · Placa: {route.placa || "-"} · Conductor: {route.conductor || "-"} · Auxiliar: {route.auxiliar || "-"} · Planilla: {route.planilla || "-"}
        </p>
        <table className="doc-tbl">
          <thead><tr>
            <th>Fecha</th><th>Placa</th><th>Cliente</th><th>Factura</th><th>Asesor</th><th>Causal</th><th>Cód. Producto</th><th>Descripción</th><th>Cant.</th><th>Valor</th><th>Firma</th><th className="no-print"></th>
          </tr></thead>
          <tbody>
            {!devoluciones.length ? (
              <tr><td colSpan={12} className="empty-row">Aún no se han registrado devoluciones en esta ruta.</td></tr>
            ) : devoluciones.map((d) => (
              <tr key={d.id}>
                <td>{d.fecha}</td><td>{d.placa}</td><td>{d.cliente}</td><td>{d.factura}</td><td>{d.asesor}</td>
                <td>{d.causal}</td><td>{d.codigoProducto}</td><td>{d.descripcion}</td><td>{d.cantidad}</td><td>{money(d.valor)}</td>
                <td>{d.firma ? <span className="badge badge-ok">✔ Firmado</span> : <span className="badge badge-danger">Sin firma</span>}</td>
                <td className="no-print">
                  <button className="btn btn-xs btn-danger" title="Eliminar" onClick={() => {
                    const msg = d.tipo === "total" ? "Esto quitará la Dev Total y la factura volverá a estado OK. ¿Continuar?" : "¿Eliminar esta devolución?";
                    if (confirm(msg)) actions.deleteDevolucion(d.id);
                  }}>✕</button>
                </td>
              </tr>
            ))}
            {devoluciones.length > 0 && (
              <tr className="cuadre-sum"><td colSpan={9}>Total devuelto</td><td colSpan={3}>{money(total)}</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="panel no-print" style={{ textAlign: "right" }}>
        <button className="btn btn-primary" onClick={() => printWithClass("printing-devolucion")}>🖨️ Confirmar y generar PDF (tamaño carta)</button>
      </div>
    </>
  );
}
