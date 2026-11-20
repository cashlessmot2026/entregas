import { useCallback, useEffect, useMemo, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { fmtMoney } from "./analytics.js";

const ESTADOS = ["OK", "Dev Parcial", "Dev Total", "Reenvío", "Pendiente"];
const BADGE = { OK: "b-green", "Dev Parcial": "b-orange", "Dev Total": "b-red", "Reenvío": "b-blue", Pendiente: "b-gray" };
const PAGE = 100;

const fmtFechaHora = (iso) => (iso ? new Date(iso).toLocaleString("es-CO", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function Linea({ k, v }) {
  return <div className="dt-line"><span>{k}</span><b>{v === "" || v == null ? "—" : v}</b></div>;
}

/* Ventana con todo el detalle de una factura */
function DetalleFactura({ pass, item, onClose }) {
  const [d, setD] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let vivo = true;
    adminApi.facturaDetalle(pass, item.ruta_id, item.numero).then((x) => { if (vivo) setD(x); }).catch((e) => vivo && setErr(e.message));
    return () => { vivo = false; };
  }, [pass, item]);

  const estado = item.estado;
  const descuentos = d && Array.isArray(d.descuentos) ? d.descuentos : [];
  const devs = d ? d.devoluciones || [] : [];

  return (
    <div className="adm-modal" onClick={onClose}>
      <div className="adm-modal-box" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-h">
          <div><h3>Factura {item.numero}</h3><span className={"bdg " + (BADGE[estado] || "b-gray")}>{estado}</span>{item.obsequio && <span className="bdg b-purple">🎁 Combos / obsequios</span>}</div>
          <button className="adm-x" onClick={onClose}>✕</button>
        </div>
        {err && <div className="warn">{err}</div>}
        {!d && !err && <div className="empty">Cargando detalle...</div>}
        {d && (
          <div className="dt-grid">
            <section>
              <h4>🚚 Entrega</h4>
              <Linea k="Entregada por" v={d.ruta.auxiliar} />
              <Linea k="Fecha y hora de entrega" v={d.confirmada ? fmtFechaHora(d.entregada_at) : "Aún sin confirmar"} />
              <Linea k="Vehículo (placa)" v={d.ruta.placa} />
              <Linea k="Planilla" v={d.ruta.planilla} />
              <Linea k="Fecha de la planilla" v={d.ruta.fecha} />
              <Linea k="Ruta" v={d.ruta.estado === "cerrada" ? "Terminada" : "En curso"} />
              {d.lat != null && <div className="dt-line"><span>Ubicación GPS</span><b><a target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${d.lat},${d.lng}`}>📍 Ver en el mapa</a></b></div>}
            </section>
            <section>
              <h4>👤 Cliente</h4>
              <Linea k="Cliente" v={d.cliente} />
              <Linea k="Sucursal despacho" v={d.sucursal_despacho} />
              <Linea k="Vendedor" v={d.vendedor} />
              <Linea k="Dirección" v={[d.direccion, d.barrio, d.ciudad].filter(Boolean).join(", ")} />
              <Linea k="Teléfono" v={d.telefono} />
            </section>
            <section>
              <h4>💰 Valores y pago</h4>
              <Linea k="Valor factura" v={fmtMoney(d.valor_factura)} />
              {descuentos.length > 0
                ? descuentos.map((x, i) => <Linea key={i} k={"Descuento — " + x.concepto + (x.porcentaje ? " (" + x.porcentaje + "%)" : "")} v={"-" + fmtMoney(x.valor)} />)
                : <Linea k="Descuentos" v="Ninguno" />}
              <Linea k="Retención" v={fmtMoney(d.retencion)} />
              <Linea k="Saldo a favor" v={fmtMoney(d.saldo_favor)} />
              <Linea k="Valor devuelto" v={fmtMoney(d.valor_devuelto)} />
              <Linea k="Saldo a pagar" v={fmtMoney(d.valor_pagado)} />
              <Linea k="Forma de pago" v={d.forma_pago} />
              {d.forma_pago && d.forma_pago.startsWith("Mixta") && <Linea k="Transferencia / Efectivo" v={fmtMoney(d.mixto_transferencia) + " / " + fmtMoney(d.mixto_efectivo)} />}
            </section>
            <section>
              <h4>⚠️ Novedades</h4>
              <Linea k="Estado de entrega" v={estado} />
              <Linea k="Causal" v={d.causal} />
              <Linea k="Observaciones" v={d.observaciones} />
              {d.obsequio && <Linea k="Combos / obsequios" v={d.obsequio_detalle || "Sí"} />}
              {devs.length > 0 && (
                <table className="tbl tbl-s">
                  <thead><tr><th>Producto devuelto</th><th>Cant.</th><th>Valor</th></tr></thead>
                  <tbody>{devs.map((x, i) => <tr key={i}><td>{x.producto}</td><td>{x.cantidad ?? ""}</td><td>{fmtMoney(x.valor)}</td></tr>)}</tbody>
                </table>
              )}
            </section>
            {(d.firma_digital || d.comprobante_pago) && (
              <section className="dt-media">
                {d.firma_digital && <div><h4>✍️ Firma del cliente</h4><img src={d.firma_digital} alt="firma" /></div>}
                {d.comprobante_pago && <div><h4>🧾 Comprobante de pago</h4><img src={d.comprobante_pago} alt="comprobante" /></div>}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminFacturas({ pass, rango, toast }) {
  const [f, setF] = useState({ desde: rango.desde || "", hasta: rango.hasta || "", numero: "", conductor: "", placa: "", cliente: "", estado: "" });
  const [res, setRes] = useState({ total: 0, rows: [] });
  const [cargando, setCargando] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [sel, setSel] = useState(null);

  const buscar = useCallback(async (filtros, pag) => {
    setCargando(true);
    try { setRes(await adminApi.facturas(pass, filtros, PAGE, pag * PAGE)); }
    catch (e) { toast("No se pudo consultar: " + e.message, "error"); }
    finally { setCargando(false); }
  }, [pass, toast]);

  // búsqueda automática con una pequeña espera mientras se escribe
  useEffect(() => {
    const t = setTimeout(() => buscar(f, pagina), 350);
    return () => clearTimeout(t);
  }, [f, pagina, buscar]);

  const set = (k, v) => { setPagina(0); setF((x) => ({ ...x, [k]: v })); };
  const limpiar = () => { setPagina(0); setF({ desde: "", hasta: "", numero: "", conductor: "", placa: "", cliente: "", estado: "" }); };
  const paginas = Math.max(1, Math.ceil(res.total / PAGE));

  const resumen = useMemo(() => {
    const c = {};
    res.rows.forEach((r) => { c[r.estado] = (c[r.estado] || 0) + 1; });
    return c;
  }, [res.rows]);

  return (
    <>
      <section className="card">
        <div className="fgrid">
          <div><label>Desde</label><input className="inp sm" type="date" value={f.desde} onChange={(e) => set("desde", e.target.value)} /></div>
          <div><label>Hasta</label><input className="inp sm" type="date" value={f.hasta} onChange={(e) => set("hasta", e.target.value)} /></div>
          <div><label>N.º de factura</label><input className="inp sm" value={f.numero} onChange={(e) => set("numero", e.target.value)} placeholder="Ej: FVE-00111314" /></div>
          <div><label>Conductor</label><input className="inp sm" value={f.conductor} onChange={(e) => set("conductor", e.target.value)} placeholder="Nombre" /></div>
          <div><label>Placa</label><input className="inp sm" value={f.placa} onChange={(e) => set("placa", e.target.value)} placeholder="Ej: BHK744" /></div>
          <div><label>Cliente</label><input className="inp sm" value={f.cliente} onChange={(e) => set("cliente", e.target.value)} placeholder="Nombre del cliente" /></div>
          <div><label>Estado</label>
            <select className="inp sm" value={f.estado} onChange={(e) => set("estado", e.target.value)}>
              <option value="">Todos</option>{ESTADOS.map((x) => <option key={x}>{x}</option>)}
            </select></div>
          <div className="fgrid-btn"><button className="btn btn-outline btn-sm" onClick={limpiar}>✕ Limpiar filtros</button></div>
        </div>
      </section>

      <section className="card">
        <div className="card-h">
          <h3>{cargando ? "Buscando..." : `${res.total} factura(s) encontradas`}</h3>
          <div className="chips">{Object.entries(resumen).map(([k, v]) => <span key={k} className={"bdg " + (BADGE[k] || "b-gray")}>{k}: {v}</span>)}</div>
        </div>
        <div className="tbl-wrap"><table className="tbl tbl-click">
          <thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Conductor</th><th>Placa</th><th>Estado</th><th>Valor</th><th>Saldo a pagar</th><th>Entregada</th></tr></thead>
          <tbody>
            {res.rows.map((r) => (
              <tr key={r.ruta_id + r.numero} onClick={() => setSel(r)}>
                <td>{r.fecha}</td><td><b>{r.numero}</b>{r.obsequio && " 🎁"}</td><td>{r.cliente}</td><td>{r.conductor}</td><td>{r.placa}</td>
                <td><span className={"bdg " + (BADGE[r.estado] || "b-gray")}>{r.estado}</span></td>
                <td>{fmtMoney(r.valor)}</td><td>{r.confirmada ? fmtMoney(r.valor_pagado) : "—"}</td>
                <td>{r.confirmada ? fmtFechaHora(r.entregada_at) : "—"}</td>
              </tr>
            ))}
            {!res.rows.length && !cargando && <tr><td colSpan={9} className="empty">No hay facturas con esos filtros</td></tr>}
          </tbody>
        </table></div>
        {paginas > 1 && (
          <div className="row-actions" style={{ alignItems: "center" }}>
            <button className="btn btn-sm btn-outline" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>← Anterior</button>
            <span className="muted">Página {pagina + 1} de {paginas}</span>
            <button className="btn btn-sm btn-outline" disabled={pagina + 1 >= paginas} onClick={() => setPagina((p) => p + 1)}>Siguiente →</button>
          </div>
        )}
        <p className="hint" style={{ marginTop: 10 }}>Toca una factura para ver el detalle completo: quién la entregó, fecha y hora, novedades, descuentos, firma y comprobante.</p>
      </section>

      {sel && <DetalleFactura pass={pass} item={sel} onClose={() => setSel(null)} />}
    </>
  );
}
