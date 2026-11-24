import { useMemo, useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { money, num, compressImage, fotosPago, empaquetarFotos } from "../lib/utils.js";
import { ESTADOS_ENTREGA, FORMAS_PAGO, FORMA_MIXTA } from "../lib/constants.js";

const VACIO = { numero: "", cliente: "", vendedor: "", valor: "", formaPago: "", estado: "OK", observaciones: "", mixtoTransferencia: "", mixtoEfectivo: "", comprobante: null };

/* Facturas fuera de picking: mismo formulario que los reenvíos, más el comprobante (imagen de la galería)
   cuando el pago es Transferencia o Mixta. Son solo un registro: NO suman al cuadre; salen en la casilla NOTA del PDF del cuadre. */
export default function FueraPicking() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [f, setF] = useState(VACIO);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));
  const [otroCliente, setOtroCliente] = useState(false);
  const lista = state.fueraPicking || [];

  const clientes = useMemo(() => {
    const m = new Map();
    [...state.facturas.map((x) => x.cliente), ...state.clientes.map((c) => c.nombre)].forEach((n) => {
      const v = (n || "").trim();
      if (v && !m.has(v.toUpperCase())) m.set(v.toUpperCase(), v);
    });
    return [...m.values()].sort((a, b) => a.localeCompare(b, "es"));
  }, [state.facturas, state.clientes]);
  const total = lista.reduce((s, r) => s + num(r.valor), 0);

  const esMixta = f.formaPago === FORMA_MIXTA;
  const pideImagen = esMixta || f.formaPago === "Transferencia";
  const fotos = fotosPago(f.comprobante);

  const onFotos = async (e) => {
    const files = [...(e.target.files || [])];
    e.target.value = "";
    if (!files.length) return;
    try {
      const nuevas = [];
      for (const file of files) nuevas.push(await compressImage(file));
      setF((x) => ({ ...x, comprobante: empaquetarFotos([...fotosPago(x.comprobante), ...nuevas]) }));
    } catch { toast("No se pudo leer la imagen", "error"); }
  };
  const quitarFoto = (i) => setF((x) => ({ ...x, comprobante: empaquetarFotos(fotosPago(x.comprobante).filter((_, j) => j !== i)) }));

  const agregar = () => {
    if (!f.numero.trim() || !f.cliente.trim()) { toast("Ingresa el número de factura y el nombre del cliente", "error"); return; }
    if (!num(f.valor)) { toast("Ingresa el valor total de la factura", "error"); return; }
    if (esMixta && Math.abs(num(f.valor) - num(f.mixtoTransferencia) - num(f.mixtoEfectivo)) >= 1) {
      toast("Transferencia + efectivo debe sumar el valor total de la factura", "error"); return;
    }
    actions.addFuera({
      numero: f.numero.trim(), cliente: f.cliente.trim(), vendedor: f.vendedor, valor: num(f.valor), formaPago: f.formaPago, estado: f.estado,
      observaciones: f.observaciones.trim(),
      mixtoTransferencia: esMixta ? num(f.mixtoTransferencia) : 0, mixtoEfectivo: esMixta ? num(f.mixtoEfectivo) : 0,
      comprobante: pideImagen ? f.comprobante : null
    });
    setF(VACIO); setOtroCliente(false);
    toast("Factura fuera de picking agregada", "success");
  };

  return (
    <div className="panel">
      <h2>🧾 Facturas fuera de picking</h2>
      <p className="hint">Se registran como los reenvíos, pero <b>no se suman</b> al cuadre: solo se relacionan en la casilla NOTA del PDF del cuadre (factura, tipo de pago, estado y valor). Si el pago es transferencia o mixta puedes subir el comprobante desde la galería.</p>
      <div className="grid grid-3">
        <div className="field-row"><label>Número de factura *</label><input className="inp" value={f.numero} onChange={set("numero")} /></div>
        <div className="field-row"><label>Nombre del cliente * <span className="muted">(elige uno o escribe otro)</span></label>
          {otroCliente ? (
            <div className="inline-add">
              <input className="inp" autoFocus value={f.cliente} onChange={set("cliente")} placeholder="Escribe el nombre del cliente" />
              <button type="button" className="btn btn-sm btn-outline" title="Volver a la lista" onClick={() => { setOtroCliente(false); setF((x) => ({ ...x, cliente: "" })); }}>▾ Lista</button>
            </div>
          ) : (
            <select className="inp" value={f.cliente} onChange={(e) => { if (e.target.value === "__otro__") { setOtroCliente(true); setF((x) => ({ ...x, cliente: "" })); } else set("cliente")(e); }}>
              <option value="">Seleccionar cliente...</option>
              {clientes.map((c) => <option key={c} value={c}>{c}</option>)}
              <option value="__otro__">➕ Otro cliente (escribir manualmente)...</option>
            </select>
          )}
        </div>
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

      {esMixta && (
        <div className="grid grid-2">
          <div className="field-row"><label>Dinero en transferencia ($)</label><input className="inp" type="number" inputMode="numeric" value={f.mixtoTransferencia} onChange={set("mixtoTransferencia")} /></div>
          <div className="field-row"><label>Dinero en efectivo ($)</label><input className="inp" type="number" inputMode="numeric" value={f.mixtoEfectivo} onChange={set("mixtoEfectivo")} /></div>
        </div>
      )}

      {pideImagen && (
        <div className="field-row">
          <label>Comprobante de pago (imagen de la galería)</label>
          <input className="inp" type="file" accept="image/*" multiple onChange={onFotos} />
          {fotos.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
              {fotos.map((src, i) => (
                <div key={i} style={{ position: "relative" }}>
                  <img src={src} alt="comprobante" style={{ height: 80, borderRadius: 8, border: "1px solid #ccd" }} />
                  <button type="button" className="btn btn-xs btn-danger" style={{ position: "absolute", top: 2, right: 2 }} onClick={() => quitarFoto(i)}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="field-row"><label>Observaciones</label><input className="inp" value={f.observaciones} onChange={set("observaciones")} placeholder="Opcional" /></div>
      <button className="btn btn-primary" onClick={agregar}>+ Agregar factura fuera de picking</button>

      <div className="tbl-scroll" style={{ overflowX: "auto", marginTop: 10 }}>
        <table className="doc-tbl">
          <thead><tr><th>Fecha</th><th>Factura</th><th>Cliente</th><th>Vendedor</th><th>Forma de pago</th><th>Estado</th><th>Valor</th><th>Comprobante</th><th>Observaciones</th><th></th></tr></thead>
          <tbody>
            {!lista.length ? (
              <tr><td colSpan={10} className="empty-row">No hay facturas fuera de picking registradas.</td></tr>
            ) : lista.map((r) => (
              <tr key={r.id}>
                <td>{r.fecha}</td><td>{r.numero}</td><td>{r.cliente || "-"}</td><td>{r.vendedor || "-"}</td>
                <td>{r.formaPago || "-"}{num(r.mixtoTransferencia) || num(r.mixtoEfectivo) ? <small className="d-block">Transf. {money(r.mixtoTransferencia)} · Efectivo {money(r.mixtoEfectivo)}</small> : null}</td>
                <td>{r.estado || "-"}</td><td>{money(r.valor)}</td>
                <td>{fotosPago(r.comprobante).map((src, i) => <a key={i} href={src} target="_blank" rel="noreferrer"><img src={src} alt="" style={{ height: 36, borderRadius: 4, marginRight: 4 }} /></a>)}</td>
                <td>{r.observaciones || ""}</td>
                <td><button className="btn btn-xs btn-danger" onClick={() => { if (confirm("¿Eliminar esta factura fuera de picking?")) actions.deleteFuera(r.id); }}>✕</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-2" style={{ marginTop: 10 }}>
        <div className="field-row highlight"><label>Total fuera de picking (informativo, no suma al cuadre)</label><div className="static-val">{money(total)}</div></div>
        <div className="field-row highlight"><label>Cantidad</label><div className="static-val">{lista.length}</div></div>
      </div>
    </div>
  );
}
