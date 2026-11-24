import { memo, useMemo, useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { money, num, normText, mapEmbedUrl, mapLinkUrl, compressImage, getPosition, navUrl, fotosPago, empaquetarFotos } from "../lib/utils.js";
import { facturaValor, facturaTotalDescuentos, facturaDevParcialValor, facturaSaldoAPagar } from "../lib/calc.js";
import { CAUSALES, CONCEPTOS_DESCUENTO, ESTADOS_ENTREGA, FORMAS_PAGO, FORMA_MIXTA } from "../lib/constants.js";
import { exportFactura } from "../lib/exporters.js";
import CommitInput from "../components/CommitInput.jsx";
import SignatureModal from "../components/SignatureModal.jsx";
import ScannerModal from "../components/ScannerModal.jsx";
import { useClientesGps, gpsDeCliente } from "../lib/gpsClientes.js";

const BADGES = {
  "OK": { cls: "badge-ok", icon: "✔", label: "OK" },
  "Dev Parcial": { cls: "badge-warn", icon: "⚠", label: "DEV PARCIAL" },
  "Dev Total": { cls: "badge-danger", icon: "✖", label: "DEV TOTAL" },
  "Reenvío": { cls: "badge-info", icon: "↻", label: "REENVÍO" }
};

export function EstadoBadge({ estado }) {
  const m = BADGES[estado] || BADGES.OK;
  return <span className={"badge " + m.cls}>{m.icon} {m.label}</span>;
}

/* Tarjeta de factura. Cerrada solo muestra el encabezado y no se vuelve a pintar
   si su factura no cambió (más rápido con rutas de muchas facturas). */
function FacturaCard({ f, saldo, expandida, onToggle, onCollapse, facturasDelCliente, onFiltrarCliente }) {
  let stateClass = "";
  if (["Dev Total", "Dev Parcial", "Reenvío"].includes(f.estado)) stateClass = " fac-state-rojo";
  else if (!f.confirmada) stateClass = " fac-state-amarillo";

  return (
    <div className={"fac-card" + (expandida ? " expanded" : "") + stateClass}>
      <div className="fac-head fac-toggle" onClick={() => onToggle(f.id)}>
        <div>
          <div className="fac-title">
            {expandida ? "▾" : "▸"} Factura #{f.numero} <EstadoBadge estado={f.estado} />
            {f.confirmada && <span className="badge badge-ok">Entregada</span>}
          </div>
          <div className="fac-sub">
            <b>{f.cliente || "Sin nombre de cliente"}</b>
            {facturasDelCliente > 1 && (
              <span className="badge badge-info clickable" onClick={(e) => { e.stopPropagation(); onFiltrarCliente(f.cliente.trim()); }}>
                {facturasDelCliente} facturas
              </span>
            )}
            {" · Vendedor: " + (f.vendedor || "-")}
            {f.sucursal && normText(f.sucursal) !== normText(f.cliente) ? " · " + f.sucursal : ""}
          </div>
          {f.razonSocial && <div className="fac-sub">Razón social: <b>{f.razonSocial}</b>{f.cantidadInv ? " · Cant.: " + f.cantidadInv : ""}</div>}
        </div>
        <div className="fac-total">
          {money(saldo)}
          <div className="fac-total-label">{facturaValor(f) ? "Valor factura: " + money(facturaValor(f)) : "⚠ Sin valor digitado"}</div>
        </div>
      </div>
      {expandida && <FacturaDetalle f={f} onCollapse={onCollapse} onFiltrarCliente={onFiltrarCliente} />}
    </div>
  );
}

export default memo(FacturaCard);

function FacturaDetalle({ f, onCollapse, onFiltrarCliente }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const gpsSrv = useClientesGps(state.session);
  const gpsCli = gpsDeCliente([f.cliente, f.razonSocial], [f], gpsSrv);
  const [firmaOpen, setFirmaOpen] = useState(false);
  const [nuevoVendedor, setNuevoVendedor] = useState(null);
  const [gpsBusy, setGpsBusy] = useState(false);
  const [gpsAuto, setGpsAuto] = useState(() => localStorage.getItem("rl_gps_auto") !== "0");
  const { route, devoluciones, vendedores } = state;
  const upd = (patch) => actions.updateFactura(f.id, patch);

  const valor = facturaValor(f);
  const totalDesc = facturaTotalDescuentos(f);
  const devParcial = facturaDevParcialValor(f, devoluciones);
  const saldo = facturaSaldoAPagar(f, devoluciones);
  const isMixta = f.formaPago === FORMA_MIXTA;
  const showComprobante = isMixta || f.formaPago === "Transferencia";
  const esDevolucion = f.estado === "Dev Parcial" || f.estado === "Dev Total";
  const mixtoDiff = isMixta ? Math.round(saldo - num(f.mixtoTransferencia) - num(f.mixtoEfectivo)) : 0;

  const otrasDelCliente = useMemo(() => {
    const k = normText(f.cliente);
    return k ? state.facturas.filter((x) => x.id !== f.id && normText(x.cliente) === k) : [];
  }, [state.facturas, f.cliente, f.id]);

  const fotos = fotosPago(f.transferenciaFoto);
  const onFoto = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    try {
      const nuevas = [];
      for (const file of files) nuevas.push(await compressImage(file));
      upd({ transferenciaFoto: empaquetarFotos([...fotos, ...nuevas]) });
    } catch { toast("No se pudo leer la imagen", "error"); }
  };
  const quitarFoto = (i) => upd({ transferenciaFoto: empaquetarFotos(fotos.filter((_, j) => j !== i)) });

  const onVendedor = (v) => {
    if (v === "__nuevo__") { setNuevoVendedor(""); return; }
    upd({ vendedor: v });
  };

  const requiereFirma = esDevolucion || f.obsequio;

  const toggleGpsAuto = (v) => { setGpsAuto(v); localStorage.setItem("rl_gps_auto", v ? "1" : "0"); };

  const guardarUbicacion = async (silencioso = false) => {
    setGpsBusy(true);
    try {
      const p = await getPosition();
      upd({ lat: p.lat, lng: p.lng });
      if (!silencioso) toast("Ubicación guardada (±" + p.precision + " m)", "success");
      return p;
    } catch (e) {
      if (!silencioso) toast(e.message, "error");
      return null;
    } finally { setGpsBusy(false); }
  };

  const confirmar = async () => {
    if (!f.cliente.trim()) { toast("Escribe el nombre del cliente antes de confirmar", "error"); return; }
    if (!valor) { toast("Digita el valor de la factura antes de confirmar", "error"); return; }
    if (!f.formaPago && f.estado !== "Dev Total" && f.estado !== "Reenvío" && saldo > 0) {
      toast("Selecciona la forma de pago antes de confirmar", "error"); return;
    }
    if (esDevolucion && !f.causal) { toast("Selecciona la causal de la devolución", "error"); return; }
    if (isMixta && Math.abs(mixtoDiff) >= 1) { toast("La suma de transferencia + efectivo no coincide con el saldo a pagar", "error"); return; }
    if (requiereFirma && !f.firma) {
      toast(f.obsequio && !esDevolucion ? "El cliente debe firmar la entrega de combos/obsequios antes de confirmar" : "El cliente debe firmar la devolución antes de confirmar", "error");
      return;
    }
    const patch = { confirmada: true, entregadaAt: new Date().toISOString() };
    // GPS opcional: se guarda la ubicación del cliente al marcar la entrega
    if (gpsAuto && f.lat == null) {
      const p = await guardarUbicacion(true);
      if (p) { patch.lat = p.lat; patch.lng = p.lng; }
    }
    upd(patch);
    onCollapse(f.id);
    toast("Entrega de factura #" + f.numero + " confirmada", "success");
  };

  const exportar = async (kind) => {
    toast(kind === "pdf" ? "Generando PDF..." : "Generando imagen...", "info");
    try { await exportFactura(f, route, devoluciones, kind); }
    catch (e) { console.error(e); toast("No se pudo generar el archivo", "error"); }
  };

  return (
    <div className="fac-collapsible">
      {/* ---------- Cliente y vendedor ---------- */}
      <div className="fac-body">
        <div className="fac-col">
          <div className="field-row">
            <label>Nombre del cliente *</label>
            <CommitInput list="clientesDatalist" value={f.cliente} onCommit={(v) => upd({ cliente: v.trim() })} placeholder="Escribe o elige un cliente registrado" />
          </div>
          {otrasDelCliente.length > 0 && (
            <div className="cli-facturas">
              <div className="cli-facturas-title">Facturas a nombre de este cliente en la ruta ({otrasDelCliente.length + 1})</div>
              {otrasDelCliente.map((x) => (
                <div key={x.id} className="cli-facturas-row">
                  <span>#{x.numero}</span>
                  <EstadoBadge estado={x.estado} />
                  <span>{money(facturaSaldoAPagar(x, devoluciones))}</span>
                  {x.confirmada && <span className="badge badge-ok">Entregada</span>}
                </div>
              ))}
              <button className="btn btn-xs btn-outline" onClick={() => onFiltrarCliente(f.cliente.trim())}>Ver solo las facturas de este cliente</button>
            </div>
          )}
          <div className="grid grid-2">
            <div className="field-row">
              <label>Vendedor</label>
              {nuevoVendedor === null ? (
                <select className="inp" value={f.vendedor} onChange={(e) => onVendedor(e.target.value)}>
                  <option value="">Seleccionar...</option>
                  {(vendedores.includes(f.vendedor) || !f.vendedor ? vendedores : [f.vendedor, ...vendedores]).map((v) => <option key={v} value={v}>{v}</option>)}
                  <option value="__nuevo__">+ Agregar vendedor...</option>
                </select>
              ) : (
                <div className="inline-add">
                  <input className="inp" autoFocus value={nuevoVendedor} onChange={(e) => setNuevoVendedor(e.target.value)} placeholder="Nombre del vendedor" />
                  <button className="btn btn-sm btn-primary" onClick={() => { if (nuevoVendedor.trim()) upd({ vendedor: nuevoVendedor.trim().toUpperCase() }); setNuevoVendedor(null); }}>OK</button>
                  <button className="btn btn-sm btn-outline" onClick={() => setNuevoVendedor(null)}>✕</button>
                </div>
              )}
            </div>
            <div className="field-row">
              <label>Desc. sucursal despacho (Excel)</label>
              <div className="static-val muted">{f.sucursal || "-"}</div>
            </div>
            <div className="field-row">
              <label>Razón social cliente despacho</label>
              <div className="static-val muted">{f.razonSocial || "-"}</div>
            </div>
            <div className="field-row">
              <label>Cantidad inv.</label>
              <div className="static-val muted">{f.cantidadInv ? f.cantidadInv : "-"}</div>
            </div>
            <div className="field-row">
              <label>Valor neto (Excel)</label>
              <div className="static-val muted">{f.valorNeto ? money(f.valorNeto) : "-"}</div>
            </div>
            <div className="field-row">
              <label>Vehículo</label>
              <div className="static-val muted">{route.placa || "-"}</div>
            </div>
            <div className="field-row">
              <label>Nombre conductor</label>
              <div className="static-val muted">{route.conductor || route.auxiliar || "-"}</div>
            </div>
            <div className="field-row">
              <label>Fecha</label>
              <div className="static-val muted">{f.fecha || route.fecha || "-"}</div>
            </div>
            <div className="field-row">
              <label>Planilla</label>
              <div className="static-val muted">{f.planilla || route.planilla || "-"}</div>
            </div>
          </div>
        </div>

        <div className="fac-col">
          <div className="grid grid-2">
            <div className="field-row">
              <label>Dirección</label>
              <CommitInput value={f.direccion} onCommit={(v) => upd({ direccion: v })} placeholder="Opcional" />
            </div>
            <div className="field-row">
              <label>Teléfono</label>
              <CommitInput type="tel" value={f.telefono} onCommit={(v) => upd({ telefono: v })} placeholder="Opcional" />
            </div>
          </div>
          {f.direccion ? (
            <>
              <div className="map-frame"><iframe title="mapa" loading="lazy" src={mapEmbedUrl(f.direccion, f.ciudad)} /></div>
              <a className="btn btn-xs btn-outline" style={{ marginTop: 6 }} href={mapLinkUrl(f.direccion, f.ciudad)} target="_blank" rel="noreferrer">🧭 Abrir en Google Maps</a>
            </>
          ) : <div className="static-val muted">Agrega la dirección para ver el mapa.</div>}
          {f.telefono && <a className="btn btn-xs btn-outline" style={{ marginTop: 6, marginLeft: 6 }} href={"tel:" + f.telefono}>📞 Llamar</a>}
          <div className="gps-box">
            <div className="gps-title">📍 Ubicación GPS del cliente <span className="muted">(opcional)</span></div>
            {f.lat != null
              ? <div className="gps-val">✔ Guardada: {f.lat}, {f.lng}</div>
              : gpsCli
                ? <div className="gps-val">📌 Registrada del cliente: {gpsCli.lat.toFixed(6)}, {gpsCli.lng.toFixed(6)}{gpsCli.aprox && <span className="muted"> (aprox.: “{gpsCli.ref}”)</span>}</div>
                : <div className="gps-val muted">Sin coordenadas guardadas en esta entrega.</div>}
            <div className="gps-actions">
              <button className="btn btn-xs btn-outline" disabled={gpsBusy} onClick={() => guardarUbicacion()}>{gpsBusy ? "Buscando GPS..." : f.lat != null ? "↻ Actualizar ubicación" : "📍 Guardar mi ubicación"}</button>
              {gpsCli && (
                <a className="btn btn-xs btn-primary" target="_blank" rel="noreferrer" href={navUrl(gpsCli.lat, gpsCli.lng)}>🧭 Navegar</a>
              )}
            </div>
            <label className="check-row"><input type="checkbox" checked={gpsAuto} onChange={(e) => toggleGpsAuto(e.target.checked)} /> Guardar la ubicación automáticamente al confirmar la entrega</label>
          </div>
        </div>
      </div>

      {/* ---------- Valor, descuentos y pago ---------- */}
      <div className="fac-body">
        <div className="fac-col">
          <div className="field-row highlight">
            <label>Valor de la factura ($) *</label>
            <input className="inp inp-big" type="number" inputMode="numeric" min="0" value={f.valorFactura || ""} onChange={(e) => upd({ valorFactura: num(e.target.value) })} placeholder="Digita el valor total" />
          </div>

          <div className="field-row">
            <label>Descuentos</label>
            {(f.descuentos || []).map((d) => (
              <div key={d.id} className="dsc-row">
                <select className="inp sm" value={d.concepto} onChange={(e) => actions.updateDescuento(f.id, d.id, { concepto: e.target.value })}>
                  {CONCEPTOS_DESCUENTO.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input
                  className="inp sm dsc-pct" type="number" inputMode="decimal" min="0" max="100" placeholder="%"
                  value={d.porcentaje}
                  onChange={(e) => {
                    const pct = e.target.value;
                    actions.updateDescuento(f.id, d.id, { porcentaje: pct, valor: pct === "" ? d.valor : Math.round(valor * num(pct) / 100) });
                  }}
                />
                <input
                  className="inp sm" type="number" inputMode="numeric" min="0" placeholder="Valor $"
                  value={d.valor || ""}
                  onChange={(e) => actions.updateDescuento(f.id, d.id, { valor: num(e.target.value), porcentaje: "" })}
                />
                <button className="btn btn-xs btn-danger" onClick={() => actions.removeDescuento(f.id, d.id)}>✕</button>
              </div>
            ))}
            <button className="btn btn-xs btn-outline" onClick={() => actions.addDescuento(f.id)}>+ Agregar descuento</button>
            {totalDesc > 0 && <div className="hint" style={{ marginTop: 4 }}>Total descuentos: <b>{money(totalDesc)}</b></div>}
          </div>

          <div className="grid grid-2">
            <div className="field-row">
              <label>Retención ($)</label>
              <input className="inp" type="number" inputMode="numeric" min="0" value={f.retencion || ""} onChange={(e) => upd({ retencion: num(e.target.value) })} />
            </div>
            <div className="field-row">
              <label>Saldo a favor cliente ($)</label>
              <input className="inp" type="number" inputMode="numeric" min="0" value={f.saldoFavor || ""} onChange={(e) => upd({ saldoFavor: num(e.target.value) })} />
            </div>
          </div>

          <div className="resumen">
            <div><span>Valor factura</span><b>{money(valor)}</b></div>
            {totalDesc > 0 && <div><span>Descuentos</span><b>-{money(totalDesc)}</b></div>}
            {num(f.retencion) > 0 && <div><span>Retención</span><b>-{money(f.retencion)}</b></div>}
            {num(f.saldoFavor) > 0 && <div><span>Saldo a favor</span><b>-{money(f.saldoFavor)}</b></div>}
            {f.estado === "Dev Parcial" && devParcial > 0 && <div><span>Devolución parcial</span><b>-{money(devParcial)}</b></div>}
            <div className="resumen-total"><span>Saldo a pagar</span><b>{money(saldo)}</b></div>
          </div>
        </div>

        <div className="fac-col">
          <div className="field-row">
            <label>Forma de pago</label>
            <select className="inp" value={f.formaPago} onChange={(e) => upd({ formaPago: e.target.value })}>
              <option value="">Seleccionar...</option>
              {FORMAS_PAGO.map((fp) => <option key={fp} value={fp}>{fp}</option>)}
            </select>
          </div>
          {isMixta && (
            <div className="grid grid-2">
              <div className="field-row highlight">
                <label>Valor en transferencia ($)</label>
                <input className="inp" type="number" inputMode="numeric" value={f.mixtoTransferencia || ""}
                  onChange={(e) => { const t = num(e.target.value); upd({ mixtoTransferencia: t, mixtoEfectivo: Math.max(0, saldo - t) }); }} />
              </div>
              <div className="field-row highlight">
                <label>Valor en efectivo ($)</label>
                <input className="inp" type="number" inputMode="numeric" value={f.mixtoEfectivo || ""} onChange={(e) => upd({ mixtoEfectivo: num(e.target.value) })} />
              </div>
              {Math.abs(mixtoDiff) >= 1 && <div className="badge badge-warn" style={{ gridColumn: "1/-1" }}>⚠ Diferencia de {money(mixtoDiff)} con el saldo a pagar</div>}
            </div>
          )}
          {showComprobante && (
            <div className="field-row">
              <label>Fotos del comprobante de pago (cámara o galería) — puedes subir varias</label>
              <input className="inp" type="file" accept="image/*" multiple onChange={onFoto} />
              {fotos.length
                ? <div className="transfer-grid">{fotos.map((src, i) => (
                    <div key={i} className="transfer-frame"><img src={src} alt={"Comprobante " + (i + 1)} />
                      <button type="button" className="btn btn-xs btn-danger" onClick={() => quitarFoto(i)}>✕ Quitar</button></div>
                  ))}</div>
                : <div className="static-val muted">Sin fotos cargadas</div>}
            </div>
          )}

          <div className="field-row">
            <label>Estado de entrega</label>
            <select className="inp" value={f.estado} onChange={(e) => upd({ estado: e.target.value })}>
              {ESTADOS_ENTREGA.map((es) => <option key={es} value={es}>{es}</option>)}
            </select>
          </div>
          {esDevolucion && (
            <div className="field-row">
              <label>Causal</label>
              <select className="inp" value={f.causal} onChange={(e) => upd({ causal: e.target.value })}>
                <option value="">Seleccionar...</option>
                {CAUSALES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          )}
          {f.estado === "Dev Total" && (
            <div className="grid grid-2">
              <div className="field-row">
                <label>Nombre en el formato de devolución</label>
                <div className="static-val muted">{f.razonSocial || f.clienteDev || f.cliente || "-"}</div>
              </div>
              <div className="field-row">
                <label>Cantidad de botellas devueltas</label>
                <input className="inp" type="number" inputMode="numeric" min="0" value={f.botellasDev === "" || f.botellasDev == null ? "" : f.botellasDev}
                  onChange={(e) => upd({ botellasDev: e.target.value === "" ? "" : num(e.target.value) })} placeholder="Botellas" />
              </div>
            </div>
          )}
          <div className="field-row">
            <label className="check-row obsequio-row">
              <input type="checkbox" checked={!!f.obsequio} onChange={(e) => upd({ obsequio: e.target.checked })} />
              🎁 Esta entrega incluye combos u obsequios (el cliente debe firmar)
            </label>
            {f.obsequio && <CommitInput value={f.obsequioDetalle} onCommit={(v) => upd({ obsequioDetalle: v })} placeholder="Detalle del combo / obsequio entregado" />}
          </div>
          {requiereFirma && (
            <div className="field-row">
              <label>Firma digital del cliente {esDevolucion ? "(devolución)" : "(combos / obsequios)"} *</label>
              {f.firma ? <img className="firma-preview" src={f.firma} alt="firma" /> : <div className="static-val muted">Sin firma</div>}
              <button className="btn btn-sm btn-outline" onClick={() => setFirmaOpen(true)}>✍ Firmar</button>
            </div>
          )}
          <div className="field-row">
            <label>Observaciones</label>
            <CommitInput value={f.observaciones} onCommit={(v) => upd({ observaciones: v })} placeholder="Opcional" />
          </div>
        </div>
      </div>

      {f.estado === "Dev Parcial" && <DevParcialPanel f={f} />}

      <div className="fac-actions">
        <button className="btn btn-sm btn-outline" onClick={() => exportar("pdf")}>📄 PDF</button>
        <button className="btn btn-sm btn-outline" onClick={() => exportar("jpg")}>🖼 JPG</button>
        {f.confirmada
          ? <button className="btn btn-sm btn-outline" onClick={() => upd({ confirmada: false })}>↺ Reabrir entrega</button>
          : null}
        <button className="btn btn-sm btn-primary" onClick={confirmar}>{f.confirmada ? "✔ Entrega confirmada" : "Confirmar entrega"}</button>
      </div>

      <SignatureModal open={firmaOpen} onClose={() => setFirmaOpen(false)} onSave={(firma) => upd({ firma })} />
    </div>
  );
}

/* Devolución parcial: producto (opcional, de la base de productos), cantidad y valor devuelto (manual) */
function DevParcialPanel({ f }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [prod, setProd] = useState("");
  const [cant, setCant] = useState("");
  const [valor, setValor] = useState("");
  const [scanOpen, setScanOpen] = useState(false);
  const devs = state.devoluciones.filter((d) => d.facturaId === f.id && d.tipo === "parcial");
  const total = devs.reduce((s, d) => s + num(d.valor), 0);

  const term = prod.trim().toLowerCase();
  const match = term ? state.productos.find((p) => p.nombre.toLowerCase() === term || p.codigoBarras === prod.trim() || p.codigo.toLowerCase() === term) : null;

  const onProd = (v) => {
    setProd(v);
    const t = v.trim().toLowerCase();
    const p = state.productos.find((x) => x.nombre.toLowerCase() === t || x.codigoBarras === v.trim());
    if (p && cant) setValor(String(p.valorUnitario * num(cant)));
  };
  const onCant = (v) => {
    setCant(v);
    if (match) setValor(String(match.valorUnitario * num(v)));
  };

  const registrar = () => {
    if (!prod.trim() || !num(cant)) { toast("Indica producto y cantidad a devolver", "error"); return; }
    if (!num(valor)) { toast("Digita el valor de la devolución", "error"); return; }
    if (!f.causal) { toast("Selecciona la causal de la devolución antes de continuar", "error"); return; }
    if (!f.vendedor) { toast("Selecciona el vendedor antes de continuar", "error"); return; }
    if (total + num(valor) > facturaValor(f)) { toast("El valor devuelto supera el valor de la factura", "error"); return; }
    actions.addDevolucion({
      tipo: "parcial",
      facturaId: f.id,
      fecha: f.fecha || state.route.fecha,
      placa: state.route.placa,
      cliente: f.razonSocial || f.cliente,
      factura: f.numero,
      asesor: f.vendedor,
      causal: f.causal,
      codigoProducto: match ? match.codigo : "",
      descripcion: match ? match.nombre : prod.trim(),
      cantidad: num(cant),
      valor: num(valor),
      firma: f.firma || null
    });
    setProd(""); setCant(""); setValor("");
    toast("Devolución registrada: " + num(cant) + " x " + (match ? match.nombre : prod.trim()), "success");
  };

  return (
    <div className="dev-panel">
      <div className="dev-panel-title">Registrar devolución parcial</div>
      <div className="dev-panel-row">
        <input list="productosDatalist" className="inp" value={prod} onChange={(e) => onProd(e.target.value)} placeholder="Producto devuelto (buscar o escanear)..." />
        <button className="btn btn-sm btn-outline" onClick={() => setScanOpen(true)}>📷 Escanear</button>
        <input className="inp sm" type="number" min="1" inputMode="numeric" value={cant} onChange={(e) => onCant(e.target.value)} placeholder="Cantidad" style={{ maxWidth: 110 }} />
        <input className="inp sm" type="number" min="0" inputMode="numeric" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="Valor devuelto $" style={{ maxWidth: 150 }} />
        <button className="btn btn-sm btn-primary" onClick={registrar}>Registrar devolución</button>
      </div>
      {term && (
        <div className="dev-prod-preview">
          {match
            ? <span className="badge badge-ok">✔ {match.nombre} — {money(match.valorUnitario)} c/u</span>
            : <span className="badge badge-warn">Producto no registrado en la base de datos (se guardará con el nombre escrito)</span>}
        </div>
      )}
      {devs.length > 0 && (
        <table className="doc-tbl" style={{ marginTop: 10 }}>
          <thead><tr><th>Producto</th><th>Cant.</th><th>Valor</th><th></th></tr></thead>
          <tbody>
            {devs.map((d) => (
              <tr key={d.id}>
                <td>{d.descripcion}</td><td>{d.cantidad}</td><td>{money(d.valor)}</td>
                <td><button className="btn btn-xs btn-danger" onClick={() => actions.deleteDevolucion(d.id)}>✕</button></td>
              </tr>
            ))}
            <tr className="cuadre-sum"><td colSpan={2}>Total devuelto</td><td colSpan={2}>{money(total)}</td></tr>
          </tbody>
        </table>
      )}
      <ScannerModal open={scanOpen} onClose={() => setScanOpen(false)} onCode={onProd} />
    </div>
  );
}
