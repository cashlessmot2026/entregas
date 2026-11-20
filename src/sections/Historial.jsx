import { useCallback, useEffect, useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { auxApi } from "../lib/supabase.js";
import { CUADRE_BUCKETS } from "../lib/constants.js";
import { cuadreGuardado } from "../lib/calc.js";
import { money } from "../lib/utils.js";

const BADGE = { OK: "badge-ok", "Dev Parcial": "badge-warn", "Dev Total": "badge-danger", "Reenvío": "badge-warn" };
const hora = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");

/* Historial de rutas del auxiliar (todas las que tiene en el servidor, no solo la de hoy) */
export default function Historial() {
  const { state } = useStore();
  const toast = useToast();
  const [rutas, setRutas] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [abierta, setAbierta] = useState(null);
  const { usuario, pin, auxiliar } = state.session;

  const cargar = useCallback(async () => {
    if (!navigator.onLine) { toast("Necesitas internet para ver el historial", "error"); return; }
    setCargando(true);
    try { setRutas(await auxApi.historial(usuario, pin)); }
    catch (e) { toast("No se pudo cargar el historial: " + e.message, "error"); }
    finally { setCargando(false); }
  }, [usuario, pin, toast]);

  useEffect(() => { cargar(); }, [cargar]);

  const ruta = (r) => ({ auxiliar, conductor: r.conductor, placa: r.placa, fecha: r.fecha, planilla: r.planilla });

  const pdfCuadre = async (r) => {
    try {
      const { pdfCuadre: gen } = await import("../lib/pdfDocs.js");
      await gen(ruta(r), cuadreGuardado(r), `cuadre_${r.placa || "ruta"}_${r.fecha || ""}`);
    } catch (e) { toast("No se pudo generar el PDF: " + (e.message || e), "error"); }
  };

  const pdfDev = async (r) => {
    try {
      const { pdfDevolucion } = await import("../lib/pdfDocs.js");
      const devs = r.devoluciones.map((d) => ({ fecha: d.fecha, placa: r.placa, cliente: d.cliente, factura: d.factura, asesor: d.asesor,
        causal: d.causal, codigoProducto: d.codigo_producto, descripcion: d.descripcion, cantidad: d.cantidad, valor: d.valor }));
      await pdfDevolucion(ruta(r), devs, `devolucion_${r.placa || "ruta"}_${r.fecha || ""}`);
    } catch (e) { toast("No se pudo generar el PDF: " + (e.message || e), "error"); }
  };

  return (
    <div className="panel">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>🗂️ Historial de mis rutas</h2>
        <button className="btn btn-outline btn-sm" onClick={cargar} disabled={cargando}>{cargando ? "Actualizando..." : "⟳ Actualizar"}</button>
      </div>
      <p className="hint">Todas tus rutas guardadas, de la más reciente a la más antigua. Toca una ruta para ver sus facturas, el cuadre y las devoluciones.</p>

      {!rutas && <div className="empty">{cargando ? "Cargando historial..." : "Sin datos"}</div>}
      {rutas && !rutas.length && <div className="empty">Aún no tienes rutas en el historial.</div>}

      {rutas && rutas.map((r) => {
        const fs = r.facturas || [];
        const gest = fs.filter((f) => f.confirmada).length;
        const dif = Math.round((Number(r.valor_total_planilla) || 0) - (Number(r.total_a_legalizar) || 0));
        const open = abierta === r.id;
        const c = open ? cuadreGuardado(r) : null;
        return (
          <div key={r.id} className="panel" style={{ margin: "10px 0", padding: 12 }}>
            <div style={{ cursor: "pointer", display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }} onClick={() => setAbierta(open ? null : r.id)}>
              <div>
                <b>📅 {r.fecha || "Sin fecha"}</b> · Planilla {r.planilla || "-"} · {r.placa || "-"}
                <div className="hint" style={{ margin: 0 }}>{gest}/{fs.length} facturas gestionadas · {(r.devoluciones || []).length} devolución(es) · A legalizar {money(r.total_a_legalizar)}</div>
              </div>
              <div>
                <span className={"badge " + (r.estado === "cerrada" ? "badge-ok" : "badge-warn")}>{r.estado === "cerrada" ? "Terminada" : r.estado === "en_curso" ? "En curso" : "Asignada"}</span>{" "}
                {r.estado !== "asignada" && (dif ? <span className="badge badge-warn">Dif. {money(dif)}</span> : <span className="badge badge-ok">Cuadra</span>)}
              </div>
            </div>

            {open && (
              <div style={{ marginTop: 10 }}>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
                  <button className="btn btn-xs btn-primary" onClick={() => pdfCuadre(r)}>📄 PDF cuadre</button>
                  {(r.devoluciones || []).length > 0 && <button className="btn btn-xs btn-primary" onClick={() => pdfDev(r)}>📄 PDF devolución</button>}
                </div>

                <h4 style={{ margin: "8px 0 4px" }}>Cuadre</h4>
                <table className="doc-tbl">
                  <thead><tr><th>Concepto</th><th>Cta.</th><th>Valor</th></tr></thead>
                  <tbody>
                    {CUADRE_BUCKETS.map((b) => <tr key={b}><td>{b}</td><td>{c.buckets[b].count}</td><td>{money(c.buckets[b].valor)}</td></tr>)}
                    <tr className="cuadre-sum"><td>Total efectivo</td><td></td><td>{money(c.totalEfectivo)}</td></tr>
                    <tr className="cuadre-sum highlight"><td>Total a legalizar</td><td></td><td>{money(c.totalALegalizar)}</td></tr>
                  </tbody>
                </table>

                <h4 style={{ margin: "12px 0 4px" }}>Facturas</h4>
                <div style={{ overflowX: "auto" }}>
                  <table className="doc-tbl">
                    <thead><tr><th>Factura</th><th>Cliente</th><th>Estado</th><th>Valor</th><th>Pagó</th><th>Forma pago</th><th>Hora</th></tr></thead>
                    <tbody>
                      {fs.map((f) => {
                        const est = f.confirmada ? f.estado : "Pendiente";
                        return (
                          <tr key={f.numero}>
                            <td>#{f.numero}{f.obsequio && " 🎁"}</td><td>{f.cliente || "-"}</td>
                            <td><span className={"badge " + (BADGE[est] || "")}>{est}</span></td>
                            <td>{money(f.valor)}</td><td>{f.confirmada ? money(f.valor_pagado) : "—"}</td><td>{f.forma_pago || "—"}</td><td>{f.confirmada ? hora(f.entregada_at) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {(r.devoluciones || []).length > 0 && (
                  <>
                    <h4 style={{ margin: "12px 0 4px" }}>Devoluciones</h4>
                    <div style={{ overflowX: "auto" }}>
                      <table className="doc-tbl">
                        <thead><tr><th>Cliente</th><th>Factura</th><th>Causal</th><th>Producto</th><th>Cant.</th><th>Valor</th></tr></thead>
                        <tbody>
                          {r.devoluciones.map((d, i) => <tr key={i}><td>{d.cliente}</td><td>{d.factura}</td><td>{d.causal}</td><td>{d.descripcion}</td><td>{d.cantidad ?? ""}</td><td>{money(d.valor)}</td></tr>)}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
