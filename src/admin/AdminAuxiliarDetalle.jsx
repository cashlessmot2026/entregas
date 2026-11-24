import { fotosPago, normReenvio } from "../lib/utils.js";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { CUADRE_BUCKETS } from "../lib/constants.js";
import { fmtMoney } from "./analytics.js";
import MapaBox from "./MapaBox.jsx";

const MapaGps = lazy(() => import("./MapaGps.jsx"));

const fmtHora = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
const BADGE = { OK: "b-green", "Dev Parcial": "b-orange", "Dev Total": "b-red", "Reenvío": "b-purple", Pendiente: "b-gray" };
const TABS = [
  { id: "cuadres", label: "🧾 Cuadres" },
  { id: "dias", label: "📅 Por día (registros y fotos)" },
  { id: "mapa", label: "📍 Mapa de clientes" },
  { id: "devoluciones", label: "↩️ Planilla de devoluciones" },
  { id: "novedades", label: "⚠️ Novedades" }
];

/* Convierte lo guardado en la ruta (jsonb) al formato que usa el generador de PDF */
const cuadreDe = (r) => ({
  buckets: Object.fromEntries(CUADRE_BUCKETS.map((b) => [b, { count: Number(r.cuadre?.[b]?.count) || 0, valor: Number(r.cuadre?.[b]?.valor) || 0 }])),
  valorTotalPlanilla: Number(r.valor_total_planilla) || 0,
  ctaTotalFacturas: r.facturas.length,
  totalEfectivo: Number(r.total_efectivo) || 0,
  totalALegalizar: Number(r.total_a_legalizar) || 0
});
const estadoFactura = (f) => (f.confirmada ? f.estado : "Pendiente");

export default function AdminAuxiliarDetalle({ pass, aux, onBack, toast }) {
  const [det, setDet] = useState(null);
  const [tab, setTab] = useState("cuadres");
  const [abierta, setAbierta] = useState(null); // ruta con el cuadre desplegado
  const [fotos, setFotos] = useState({});        // rutaId -> lista de fotos (se piden al abrir)
  const [verFoto, setVerFoto] = useState(null);

  useEffect(() => {
    let vivo = true;
    setDet(null);
    adminApi.auxiliarDetalle(pass, aux.id).then((d) => { if (vivo) setDet(d); }).catch((e) => toast("No se pudo cargar: " + e.message, "error"));
    return () => { vivo = false; };
  }, [pass, aux.id, toast]);

  const rutas = det ? det.rutas : [];
  const resumen = useMemo(() => {
    const fs = rutas.flatMap((r) => r.facturas);
    return {
      rutas: rutas.length,
      facturas: fs.length,
      entregadas: fs.filter((f) => f.confirmada && (f.estado === "OK" || f.estado === "Dev Parcial")).length,
      devoluciones: rutas.reduce((s, r) => s + r.devoluciones.length, 0),
      legalizado: rutas.reduce((s, r) => s + (Number(r.total_a_legalizar) || 0), 0)
    };
  }, [rutas]);

  const porDia = useMemo(() => {
    const m = new Map();
    rutas.forEach((r) => { const k = r.fecha || "Sin fecha"; if (!m.has(k)) m.set(k, []); m.get(k).push(r); });
    return [...m.entries()];
  }, [rutas]);

  const puntos = useMemo(() => rutas.flatMap((r) => r.facturas
    .filter((f) => f.lat != null && f.lng != null)
    .map((f) => ({ lat: f.lat, lng: f.lng, cliente: f.cliente, numero: f.numero, estado: estadoFactura(f), ruta: { auxiliar: aux.nombre, placa: r.placa } }))), [rutas, aux.nombre]);

  const novedades = useMemo(() => rutas.flatMap((r) => r.facturas
    .filter((f) => f.confirmada && (f.estado !== "OK" || f.observaciones || f.obsequio))
    .map((f) => ({ ...f, ruta: r }))), [rutas]);

  const pdfCuadre = async (r) => {
    try {
      const { pdfCuadre: gen } = await import("../lib/pdfDocs.js");
      await gen({ auxiliar: aux.nombre, conductor: r.conductor, placa: r.placa, fecha: r.fecha, planilla: r.planilla }, cuadreDe(r), `cuadre_${r.placa || "ruta"}_${r.fecha || ""}`, r.reenvios || []);
    } catch (e) { toast("No se pudo generar el PDF: " + e.message, "error"); }
  };

  const pdfDevolucion = async (r) => {
    try {
      const { pdfDevolucion: gen } = await import("../lib/pdfDocs.js");
      const rs = new Map((r.facturas || []).map((f) => [String(f.numero), f.razon_social]));
      const devs = r.devoluciones.map((d) => ({ fecha: d.fecha, placa: r.placa, cliente: rs.get(String(d.factura)) || d.cliente, factura: d.factura, asesor: d.asesor,
        causal: d.causal, codigoProducto: d.codigo_producto, descripcion: d.descripcion, cantidad: d.cantidad, valor: d.valor }));
      await gen({ auxiliar: aux.nombre, conductor: r.conductor, placa: r.placa, fecha: r.fecha, planilla: r.planilla }, devs, `devolucion_${r.placa || "ruta"}_${r.fecha || ""}`);
    } catch (e) { toast("No se pudo generar el PDF: " + e.message, "error"); }
  };

  const cargarFotos = async (r) => {
    if (fotos[r.id]) { setFotos((x) => { const c = { ...x }; delete c[r.id]; return c; }); return; }
    try { const l = await adminApi.rutaFotos(pass, r.id); setFotos((x) => ({ ...x, [r.id]: l })); }
    catch (e) { toast("No se pudieron cargar las fotos: " + e.message, "error"); }
  };

  return (
    <>
      <button className="btn btn-outline btn-sm aux-back" onClick={onBack}>← Volver a auxiliares</button>
      <section className="card">
        <div className="aux-head">
          <div>
            <h2>🧑‍✈️ {aux.nombre}</h2>
            <small className="muted">Usuario: {aux.usuario}{aux.telefono ? " · Tel. " + aux.telefono : ""}</small>
          </div>
          {det && (
            <div className="chips">
              <span className="bdg b-blue">{resumen.rutas} ruta(s)</span>
              <span className="bdg b-gray">{resumen.facturas} facturas</span>
              <span className="bdg b-green">{resumen.entregadas} entregadas</span>
              <span className="bdg b-orange">{resumen.devoluciones} devoluciones</span>
              <span className="bdg b-gray">Legalizado {fmtMoney(resumen.legalizado)}</span>
            </div>
          )}
        </div>
        <div className="aux-tabs">
          {TABS.map((t) => <button key={t.id} className={tab === t.id ? "active" : ""} onClick={() => setTab(t.id)}>{t.label}</button>)}
        </div>

        {!det && <div className="empty">Cargando información del auxiliar...</div>}

        {det && tab === "cuadres" && (
          <div className="tbl-wrap"><table className="tbl">
            <thead><tr><th>Fecha</th><th>Planilla</th><th>Placa</th><th>Estado</th><th>Valor planilla</th><th>A legalizar</th><th>Efectivo</th><th>Diferencia</th><th></th></tr></thead>
            <tbody>
              {rutas.map((r) => {
                const dif = Math.round((Number(r.valor_total_planilla) || 0) - (Number(r.total_a_legalizar) || 0));
                const c = cuadreDe(r);
                return [
                  <tr key={r.id} className="clickable" onClick={() => setAbierta(abierta === r.id ? null : r.id)}>
                    <td>{r.fecha || "-"}</td><td>{r.planilla || "-"}</td><td>{r.placa || "-"}</td>
                    <td><span className={"bdg " + (r.estado === "cerrada" ? "b-green" : "b-orange")}>{r.estado === "cerrada" ? "Terminada" : "En curso"}</span></td>
                    <td>{fmtMoney(r.valor_total_planilla)}</td><td>{fmtMoney(r.total_a_legalizar)}</td><td>{fmtMoney(r.total_efectivo)}</td>
                    <td className={dif ? "neg" : ""}>{dif ? fmtMoney(dif) : "✔ Cuadra"}</td>
                    <td className="nowrap"><button className="btn btn-xs btn-primary" onClick={(e) => { e.stopPropagation(); pdfCuadre(r); }}>📄 PDF</button></td>
                  </tr>,
                  abierta === r.id && (
                    <tr key={r.id + "d"}><td colSpan={9}>
                      <table className="tbl"><thead><tr><th>Concepto</th><th>Cta. facturas</th><th>Valor</th></tr></thead>
                        <tbody>{CUADRE_BUCKETS.map((b) => <tr key={b}><td>{b}</td><td>{c.buckets[b].count}</td><td>{fmtMoney(c.buckets[b].valor)}</td></tr>)}</tbody></table>
                      {(r.reenvios || []).length > 0 && (
                        <>
                          <h4 style={{ margin: "10px 0 4px" }}>📦 Facturas de reenvío (registro, no suman al cuadre)</h4>
                          <table className="tbl"><thead><tr><th>Factura</th><th>Cliente</th><th>Vendedor</th><th>Forma de pago</th><th>Estado</th><th>Valor</th><th>Observaciones</th></tr></thead>
                            <tbody>{r.reenvios.map((z, i) => { const n = normReenvio(z); return <tr key={i}><td>{n.numero}</td><td>{n.cliente}</td><td>{n.vendedor}</td><td>{n.formaPago}</td><td>{n.estado}</td><td>{fmtMoney(n.valor)}</td><td>{n.observaciones}</td></tr>; })}</tbody></table>
                        </>
                      )}
                    </td></tr>
                  )
                ];
              })}
              {!rutas.length && <tr><td colSpan={9} className="empty">Este auxiliar aún no tiene rutas</td></tr>}
            </tbody>
          </table></div>
        )}

        {det && tab === "dias" && (
          <>
            {!porDia.length && <div className="empty">Sin registros</div>}
            {porDia.map(([dia, rs]) => {
              const fs = rs.flatMap((r) => r.facturas);
              return (
                <details key={dia} className="dia-bloque">
                  <summary>📅 {dia} <small>{rs.length} ruta(s) · {fs.length} facturas · {fs.filter((f) => f.confirmada).length} gestionadas · {rs.reduce((s, r) => s + r.devoluciones.length, 0)} devoluciones</small></summary>
                  <div className="dia-body">
                    {rs.map((r) => (
                      <div key={r.id} style={{ marginBottom: 14 }}>
                        <div className="card-h"><h3>Planilla {r.planilla || "-"} · {r.placa || "-"}</h3>
                          <button className="btn btn-xs btn-outline" onClick={() => cargarFotos(r)}>{fotos[r.id] ? "Ocultar fotos" : "🖼 Ver fotos (firmas y comprobantes)"}</button></div>
                        <div className="tbl-wrap"><table className="tbl">
                          <thead><tr><th>Factura</th><th>Cliente</th><th>Estado</th><th>Valor</th><th>Pagó</th><th>Forma de pago</th><th>Hora</th><th>Fotos</th></tr></thead>
                          <tbody>{r.facturas.map((f) => (
                            <tr key={f.numero}>
                              <td><b>{f.numero}</b>{f.obsequio && " 🎁"}</td><td>{f.cliente}</td>
                              <td><span className={"bdg " + (BADGE[estadoFactura(f)] || "b-gray")}>{estadoFactura(f)}</span></td>
                              <td>{fmtMoney(f.valor)}</td><td>{f.confirmada ? fmtMoney(f.valor_pagado) : "—"}</td><td>{f.forma_pago || "—"}</td>
                              <td>{f.confirmada ? fmtHora(f.entregada_at) : "—"}</td>
                              <td>{f.tiene_firma ? "✍️" : ""}{f.tiene_comprobante ? " 🧾" : ""}</td>
                            </tr>))}</tbody>
                        </table></div>
                        {fotos[r.id] && (
                          fotos[r.id].length ? (
                            <div className="foto-grid" style={{ marginTop: 10 }}>
                              {fotos[r.id].flatMap((f) => [
                                f.firma && { k: f.numero + "f", src: f.firma, t: "Firma", f },
                                ...fotosPago(f.comprobante).map((src, i) => ({ k: f.numero + "c" + i, src, t: "Comprobante " + (i + 1), f }))
                              ]).filter(Boolean).map((x) => (
                                <div key={x.k} className="foto-item">
                                  <img src={x.src} alt={x.t} onClick={() => setVerFoto(x)} />
                                  <b>{x.t} · {x.f.numero}</b>{x.f.cliente}
                                </div>
                              ))}
                            </div>
                          ) : <div className="empty">Esta ruta no tiene firmas ni comprobantes guardados</div>
                        )}
                      </div>
                    ))}
                  </div>
                </details>
              );
            })}
          </>
        )}

        {det && tab === "mapa" && (
          puntos.length
            ? <Suspense fallback={<div className="empty">Cargando mapa...</div>}>
                <p className="hint">Ubicación GPS de todos los clientes atendidos por este auxiliar ({puntos.length} punto(s)). Color según el estado de la entrega.</p>
                <MapaBox height={420}>{(h) => <MapaGps facturas={puntos} height={h} />}</MapaBox>
              </Suspense>
            : <div className="empty">Este auxiliar aún no tiene clientes con ubicación GPS.</div>
        )}

        {det && tab === "devoluciones" && (
          <>
            {!rutas.some((r) => r.devoluciones.length) && <div className="empty">Sin devoluciones registradas</div>}
            {rutas.filter((r) => r.devoluciones.length).map((r) => (
              <div key={r.id} style={{ marginBottom: 14 }}>
                <div className="card-h"><h3>{r.fecha} · Planilla {r.planilla || "-"} · {r.placa || "-"} — {fmtMoney(r.devoluciones.reduce((s, d) => s + (Number(d.valor) || 0), 0))}</h3>
                  <button className="btn btn-xs btn-primary" onClick={() => pdfDevolucion(r)}>📄 PDF devolución</button></div>
                <div className="tbl-wrap"><table className="tbl">
                  <thead><tr><th>Cliente</th><th>Factura</th><th>Causal</th><th>Producto</th><th>Cant.</th><th>Valor</th><th>Firma</th></tr></thead>
                  <tbody>{r.devoluciones.map((d, i) => (
                    <tr key={i}><td>{d.cliente}</td><td>{d.factura}</td><td>{d.causal}</td><td>{d.descripcion}</td><td>{d.cantidad ?? ""}</td><td>{fmtMoney(d.valor)}</td><td>{d.tiene_firma ? "✍️" : "—"}</td></tr>
                  ))}</tbody>
                </table></div>
              </div>
            ))}
          </>
        )}

        {det && tab === "novedades" && (
          <>
            {!novedades.length && <div className="empty">Sin novedades</div>}
            {novedades.map((f, i) => (
              <div key={i} className={"novedad" + (f.estado === "Dev Total" ? " rojo" : "")}>
                <b>{f.cliente}</b> · factura {f.numero} · <span className={"bdg " + (BADGE[f.estado] || "b-gray")}>{f.estado}</span> · {f.ruta.fecha} · {f.ruta.placa}
                {f.causal && <><br /><small>Causal: {f.causal}</small></>}
                {f.obsequio && <><br /><small>🎁 Obsequio/combo: {f.obsequio_detalle || "sí"}</small></>}
                {f.observaciones && <><br /><small>📝 {f.observaciones}</small></>}
              </div>
            ))}
          </>
        )}
      </section>

      {verFoto && (
        <div className="adm-modal" onClick={() => setVerFoto(null)}>
          <div className="adm-modal-box" style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
            <div className="adm-modal-h"><h3>{verFoto.t} · {verFoto.f.numero}</h3><button className="btn btn-sm btn-outline" onClick={() => setVerFoto(null)}>Cerrar</button></div>
            <img src={verFoto.src} alt={verFoto.t} style={{ maxWidth: "100%", maxHeight: "75vh" }} />
          </div>
        </div>
      )}
    </>
  );
}
