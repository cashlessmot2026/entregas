import { useMemo, useRef, useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { money, normText } from "../lib/utils.js";
import { facturaSaldoAPagar } from "../lib/calc.js";
import { exportNodeAsJpg, exportNodeAsPdf } from "../lib/exporters.js";
import { EstadoBadge } from "./FacturaCard.jsx";

const VACIO = { nombre: "", negocio: "", telefono: "", direccion: "", barrio: "", horario: "", vendedor: "" };

export default function Clientes({ onVerEnRuta }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [form, setForm] = useState(VACIO);
  const [buscar, setBuscar] = useState("");
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  // facturas de la ruta agrupadas por cliente
  const porCliente = useMemo(() => {
    const m = {};
    state.facturas.forEach((f) => { const k = normText(f.cliente); if (k) (m[k] = m[k] || []).push(f); });
    return m;
  }, [state.facturas]);

  const lista = useMemo(() => {
    const t = normText(buscar);
    const l = t ? state.clientes.filter((c) => normText(c.nombre).includes(t) || normText(c.negocio).includes(t)) : state.clientes;
    // primero los clientes con facturas en la ruta
    return l.slice().sort((a, b) => (porCliente[normText(b.nombre)] ? 1 : 0) - (porCliente[normText(a.nombre)] ? 1 : 0));
  }, [state.clientes, buscar, porCliente]);

  const guardar = () => {
    if (!form.nombre.trim()) { toast("Ingresa al menos el nombre del cliente", "error"); return; }
    if (state.clientes.some((c) => normText(c.nombre) === normText(form.nombre))) { toast("Ese cliente ya está registrado", "error"); return; }
    actions.addCliente({ ...form, nombre: form.nombre.trim(), vendedor: form.vendedor || state.vendedores[0] || "" });
    setForm(VACIO);
    toast("Cliente guardado", "success");
  };

  return (
    <>
      <div className="panel">
        <h2>👥 Registrar cliente</h2>
        <div className="grid grid-3">
          <div className="field-row"><label>Nombre del cliente</label><input className="inp" value={form.nombre} onChange={set("nombre")} /></div>
          <div className="field-row"><label>Nombre del negocio</label><input className="inp" value={form.negocio} onChange={set("negocio")} /></div>
          <div className="field-row"><label>Teléfono</label><input className="inp" type="tel" value={form.telefono} onChange={set("telefono")} /></div>
          <div className="field-row"><label>Dirección</label><input className="inp" value={form.direccion} onChange={set("direccion")} /></div>
          <div className="field-row"><label>Horario de atención</label><input className="inp" value={form.horario} onChange={set("horario")} placeholder="Ej: 8am - 5pm" /></div>
          <div className="field-row"><label>Vendedor</label>
            <select className="inp" value={form.vendedor} onChange={set("vendedor")}>
              {state.vendedores.map((v) => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
        <button className="btn btn-primary" onClick={guardar}>+ Guardar cliente</button>
      </div>
      <div className="panel">
        <h2>Base de datos de clientes ({state.clientes.length})</h2>
        <input className="inp" style={{ maxWidth: 340, marginBottom: 12 }} type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)} placeholder="🔍 Buscar cliente..." />
        {!lista.length ? <div className="empty">Aún no hay clientes registrados.</div> : (
          <div className="clientes-list">
            {lista.map((c) => (
              <ClienteCard key={c.id} c={c} facturas={porCliente[normText(c.nombre)] || []} onVerEnRuta={onVerEnRuta} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ClienteCard({ c, facturas, onVerEnRuta }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const ref = useRef(null);
  const total = facturas.reduce((s, f) => s + facturaSaldoAPagar(f, state.devoluciones), 0);

  const compartir = async () => {
    const text = `Cliente: ${c.nombre}\nNegocio: ${c.negocio || "-"}\nTel: ${c.telefono || "-"}\nDirección: ${c.direccion || "-"}\nHorario: ${c.horario || "-"}\nVendedor: ${c.vendedor || "-"}` +
      (facturas.length ? `\nFacturas en ruta: ${facturas.map((f) => "#" + f.numero).join(", ")} (${money(total)})` : "");
    if (navigator.share) { try { await navigator.share({ title: c.nombre, text }); return; } catch { /* cancelado */ } }
    navigator.clipboard.writeText(text).then(() => toast("Información copiada al portapapeles", "success"));
  };

  return (
    <div className="cli-card" ref={ref}>
      <div className="cli-name">{c.nombre}</div>
      <div className="cli-line"><b>Negocio:</b> {c.negocio || "-"}</div>
      <div className="cli-line"><b>Tel:</b> {c.telefono || "-"}</div>
      <div className="cli-line"><b>Dirección:</b> {c.direccion || "-"}</div>
      <div className="cli-line"><b>Horario:</b> {c.horario || "-"}</div>
      <div className="cli-line"><b>Vendedor:</b> {c.vendedor || "-"}</div>
      {facturas.length > 0 && (
        <div className="cli-facturas">
          <div className="cli-facturas-title">Facturas a su nombre en la ruta ({facturas.length}) · {money(total)}</div>
          {facturas.map((f) => (
            <div key={f.id} className="cli-facturas-row">
              <span>#{f.numero}</span><EstadoBadge estado={f.estado} /><span>{money(facturaSaldoAPagar(f, state.devoluciones))}</span>
            </div>
          ))}
        </div>
      )}
      <div className="cli-actions" data-html2canvas-ignore="true">
        {facturas.length > 0 && <button className="btn btn-xs btn-primary" onClick={() => onVerEnRuta(c.nombre.trim())}>🚚 Ver en ruta</button>}
        <button className="btn btn-xs btn-outline" onClick={() => exportNodeAsPdf(ref.current, "cliente_" + c.id)}>📄 PDF</button>
        <button className="btn btn-xs btn-outline" onClick={() => exportNodeAsJpg(ref.current, "cliente_" + c.id)}>🖼 JPG</button>
        <button className="btn btn-xs btn-outline" onClick={compartir}>🔗 Compartir</button>
        <button className="btn btn-xs btn-danger" onClick={() => { if (confirm("¿Eliminar este cliente?")) actions.deleteCliente(c.id); }}>🗑</button>
      </div>
    </div>
  );
}
