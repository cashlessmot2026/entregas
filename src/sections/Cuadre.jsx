import { useMemo, useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { CUADRE_BUCKETS } from "../lib/constants.js";
import { computeCuadre } from "../lib/calc.js";
import { money } from "../lib/utils.js";
import Modal from "../components/Modal.jsx";

export default function Cuadre() {
  const { state } = useStore();
  const { route, facturas, devoluciones, reenvios } = state;
  const c = useMemo(() => computeCuadre(facturas, devoluciones), [facturas, devoluciones]);
  const [bucket, setBucket] = useState(null);
  const diff = Math.round(c.valorTotalPlanilla - c.totalALegalizar);
  const toast = useToast();
  const [generando, setGenerando] = useState(false);

  const generarPdf = async () => {
    setGenerando(true);
    try {
      const { pdfCuadre } = await import("../lib/pdfDocs.js");
      await pdfCuadre(route, c, `cuadre_${route.placa || "ruta"}_${route.fecha || ""}`, reenvios);
    } catch (e) {
      console.error(e);
      toast("No se pudo generar el PDF: " + (e.message || e), "error");
    } finally { setGenerando(false); }
  };

  return (
    <>
      <div className="panel" id="printCuadre">
        <h2>🧾 Cuadre de Ruta — LICONSUMAR Del Magdalena</h2>
        <div className="grid grid-5">
          <div><label>Auxiliar</label><div className="static-val">{route.auxiliar || "-"}</div></div>
          <div><label>Conductor</label><div className="static-val">{route.conductor || "-"}</div></div>
          <div><label>Vehículo</label><div className="static-val">{route.placa || "-"}</div></div>
          <div><label>Fecha</label><div className="static-val">{route.fecha || "-"}</div></div>
          <div><label>Planilla</label><div className="static-val">{route.planilla || "-"}</div></div>
        </div>
        <div className="grid grid-2" style={{ marginTop: 8 }}>
          <div className="field-row highlight"><label>Valor total planilla</label><div className="static-val">{money(c.valorTotalPlanilla)}</div></div>
          <div className="field-row highlight"><label>Cta. total facturas</label><div className="static-val">{c.ctaTotalFacturas}</div></div>
        </div>
        <table className="doc-tbl" style={{ marginTop: 12 }}>
          <thead><tr><th>Concepto</th><th>Cta. Facturas</th><th>Valor</th></tr></thead>
          <tbody>
            {CUADRE_BUCKETS.map((b) => (
              <tr key={b}>
                <td>{b}</td>
                <td className="cuadre-count-cell" onClick={() => setBucket(b)} title="Ver facturas de este concepto">{c.buckets[b].count}</td>
                <td>{money(c.buckets[b].valor)}</td>
              </tr>
            ))}
            <tr className="cuadre-sum"><td>Total Efectivo</td><td></td><td>{money(c.totalEfectivo)}</td></tr>
            <tr className="cuadre-sum highlight"><td>Total a Legalizar</td><td></td><td>{money(c.totalALegalizar)}</td></tr>
          </tbody>
        </table>
        <div style={{ marginTop: 12 }}>
          {Math.abs(diff) < 1 ? (
            <span className="badge badge-ok">✔ Cuadre correcto — el total a legalizar ({money(c.totalALegalizar)}) coincide con el valor total de la planilla ({money(c.valorTotalPlanilla)})</span>
          ) : (
            <span className="badge badge-warn">⚠ Hay diferencia de {money(diff)} entre el total a legalizar ({money(c.totalALegalizar)}) y el valor total de la planilla ({money(c.valorTotalPlanilla)})</span>
          )}
        </div>
        {(c.sinFormaPago.length > 0 || c.sinValor.length > 0) && (
          <div className="cuadre-alertas no-print">
            {c.sinFormaPago.length > 0 && <div>⚠ Sin forma de pago: {c.sinFormaPago.map((f) => "#" + f.numero).join(", ")}</div>}
            {c.sinValor.length > 0 && <div>⚠ Sin valor digitado: {c.sinValor.map((f) => "#" + f.numero).join(", ")}</div>}
          </div>
        )}
      </div>
      <div className="panel no-print" style={{ textAlign: "right" }}>
        <button className="btn btn-primary" disabled={generando} onClick={generarPdf}>{generando ? "Generando PDF..." : "🖨️ Generar PDF (tamaño carta)"}</button>
      </div>

      <Modal open={!!bucket} title={"Facturas — " + (bucket || "")} onClose={() => setBucket(null)}>
        {bucket && !c.buckets[bucket].facturas.length ? (
          <div className="empty">No hay facturas registradas en este concepto.</div>
        ) : bucket && (
          <table className="doc-tbl">
            <thead><tr><th>Factura</th><th>Cliente</th><th>Valor</th></tr></thead>
            <tbody>
              {c.buckets[bucket].facturas.map((f, i) => (
                <tr key={f.id + i}><td>#{f.numero}</td><td>{f.cliente || "-"}</td><td>{money(f.valor)}</td></tr>
              ))}
            </tbody>
          </table>
        )}
      </Modal>
    </>
  );
}
