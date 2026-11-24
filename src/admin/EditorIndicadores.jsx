import { useMemo, useState } from "react";
import { MESES } from "./indicadores.js";

const CATS = [
  { id: "vendedor", titulo: "Vendedores", nota: "Ocultar quita sus facturas de todas las tablas." },
  { id: "entregador", titulo: "Entregadores", nota: "Ocultar quita sus facturas de todas las tablas." },
  { id: "causal", titulo: "Causales", nota: "Ocultar solo quita la fila de las tablas de causales." },
  { id: "ruta", titulo: "Rutas / vehículos", nota: "Ocultar solo quita la fila de las tablas de rutas." }
];
const VACIO = { id: "", mes: 1, vendedor: "", entregador: "", causal: "", ruta: "", despachados: "", devueltos: "" };

/* Editor de los indicadores: cambiar nombres, ocultar (eliminar) datos y agregar registros manuales.
   Los datos reales de la app no se tocan: los ajustes se guardan aparte y se aplican al calcular. */
export default function EditorIndicadores({ filasRaw, ajustes, anio, onSave, onClose }) {
  const [aj, setAj] = useState(() => JSON.parse(JSON.stringify({ alias: {}, ocultos: {}, manuales: [], ...ajustes })));
  const [tab, setTab] = useState("nombres");
  const [form, setForm] = useState({ ...VACIO });
  const [guardando, setGuardando] = useState(false);

  const nombres = useMemo(() => Object.fromEntries(CATS.map((c) => [c.id, [...new Set(filasRaw.map((f) => f[c.id]).filter(Boolean))].sort()])), [filasRaw]);
  const sugerencias = useMemo(() => Object.fromEntries(CATS.map((c) => [c.id, [...new Set([...nombres[c.id], ...aj.manuales.map((m) => m[c.id]).filter(Boolean)])]])), [nombres, aj.manuales]);

  const final = (cat, orig) => (aj.alias[cat] && aj.alias[cat][orig]) || orig;
  const renombrar = (cat, orig, v) => setAj((a) => {
    const al = { ...(a.alias[cat] || {}) };
    if (!v.trim() || v.trim().toUpperCase() === orig) delete al[orig]; else al[orig] = v.trim().toUpperCase();
    return { ...a, alias: { ...a.alias, [cat]: al } };
  });
  const estaOculto = (cat, nombre) => (aj.ocultos[cat] || []).includes(nombre);
  const alternar = (cat, nombre) => setAj((a) => {
    const l = new Set(a.ocultos[cat] || []);
    if (l.has(nombre)) l.delete(nombre); else l.add(nombre);
    return { ...a, ocultos: { ...a.ocultos, [cat]: [...l] } };
  });

  const guardarRegistro = () => {
    const d = Number(form.despachados), v = Number(form.devueltos) || 0;
    if (!(d > 0)) { alert("Indica los pedidos despachados"); return; }
    if (v > d) { alert("Los devueltos no pueden superar los despachados"); return; }
    const reg = { ...form, id: form.id || "m" + Date.now(), anio, mes: Number(form.mes), despachados: d, devueltos: v };
    setAj((a) => ({ ...a, manuales: form.id ? a.manuales.map((m) => (m.id === form.id ? reg : m)) : [...a.manuales, reg] }));
    setForm({ ...VACIO, mes: form.mes });
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const manualesAnio = aj.manuales.filter((m) => Number(m.anio) === Number(anio));

  const guardar = async () => {
    setGuardando(true);
    try { await onSave(aj); } finally { setGuardando(false); }
  };

  return (
    <div className="ed-over" onClick={onClose}>
      <div className="ed-modal" onClick={(e) => e.stopPropagation()}>
        <div className="card-h"><h3>✏️ Editar datos de los indicadores</h3><button className="btn btn-xs btn-outline" onClick={onClose}>✕ Cerrar</button></div>
        <p className="hint">Los datos de las entregas no se modifican: aquí se cambian los nombres que se muestran, se ocultan datos y se agregan registros manuales (por ejemplo, meses anteriores a la app).</p>
        <div className="tabs">
          <button className={tab === "nombres" ? "active" : ""} onClick={() => setTab("nombres")}>🏷️ Nombres y datos</button>
          <button className={tab === "manual" ? "active" : ""} onClick={() => setTab("manual")}>➕ Registros manuales ({manualesAnio.length})</button>
        </div>

        {tab === "nombres" && (
          <div className="ed-body">
            {CATS.map((c) => (
              <div key={c.id} className="ed-cat">
                <h4>{c.titulo} <small className="muted">{c.nota}</small></h4>
                {!nombres[c.id].length && <div className="empty">Sin datos en {anio}</div>}
                {nombres[c.id].map((orig) => {
                  const f = final(c.id, orig), oc = estaOculto(c.id, f);
                  return (
                    <div key={orig} className={"ed-row" + (oc ? " oculto" : "")}>
                      <span className="ed-orig" title={orig}>{orig}</span>
                      <span>→</span>
                      <input className="inp sm" defaultValue={f === orig ? "" : f} placeholder="Nuevo nombre" onBlur={(e) => renombrar(c.id, orig, e.target.value)} />
                      <button className={"btn btn-xs " + (oc ? "btn-primary" : "btn-danger")} onClick={() => alternar(c.id, f)}>{oc ? "↩ Mostrar" : "🗑 Ocultar"}</button>
                    </div>
                  );
                })}
              </div>
            ))}
            <small className="muted">Si dos nombres se cambian al mismo, quedan unidos en una sola fila.</small>
          </div>
        )}

        {tab === "manual" && (
          <div className="ed-body">
            <div className="ed-form">
              <label>Mes<select className="inp sm" value={form.mes} onChange={set("mes")}>{MESES.map((m, i) => <option key={m} value={i + 1}>{m} {anio}</option>)}</select></label>
              <label>Vendedor<input className="inp sm" list="dl-vendedor" value={form.vendedor} onChange={set("vendedor")} /></label>
              <label>Entregador<input className="inp sm" list="dl-entregador" value={form.entregador} onChange={set("entregador")} /></label>
              <label>Ruta / vehículo<input className="inp sm" list="dl-ruta" value={form.ruta} onChange={set("ruta")} /></label>
              <label>Causal (de las devoluciones)<input className="inp sm" list="dl-causal" value={form.causal} onChange={set("causal")} /></label>
              <label>Ped. despachados<input className="inp sm" type="number" min="0" value={form.despachados} onChange={set("despachados")} /></label>
              <label>Ped. devueltos<input className="inp sm" type="number" min="0" value={form.devueltos} onChange={set("devueltos")} /></label>
              <div className="ed-form-b">
                <button className="btn btn-sm btn-primary" onClick={guardarRegistro}>{form.id ? "Actualizar registro" : "Agregar registro"}</button>
                {form.id && <button className="btn btn-sm btn-outline" onClick={() => setForm({ ...VACIO })}>Cancelar</button>}
              </div>
            </div>
            {CATS.map((c) => <datalist key={c.id} id={"dl-" + c.id}>{sugerencias[c.id].map((n) => <option key={n} value={n} />)}</datalist>)}
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Mes</th><th>Vendedor</th><th>Entregador</th><th>Ruta</th><th>Causal</th><th>Despachados</th><th>Devueltos</th><th></th></tr></thead>
              <tbody>
                {manualesAnio.map((m) => (
                  <tr key={m.id}><td>{MESES[m.mes - 1]}</td><td>{m.vendedor}</td><td>{m.entregador}</td><td>{m.ruta}</td><td>{m.causal}</td><td>{m.despachados}</td><td>{m.devueltos}</td>
                    <td className="nowrap"><button className="btn btn-xs btn-outline" onClick={() => setForm({ ...m })}>✏️</button>{" "}
                      <button className="btn btn-xs btn-danger" onClick={() => setAj((a) => ({ ...a, manuales: a.manuales.filter((x) => x.id !== m.id) }))}>🗑</button></td></tr>
                ))}
                {!manualesAnio.length && <tr><td colSpan={8} className="empty">No hay registros manuales en {anio}</td></tr>}
              </tbody>
            </table></div>
            <small className="muted">Cada registro suma sus pedidos despachados y devueltos (con su causal) a las tablas del mes elegido.</small>
          </div>
        )}

        <div className="row-actions">
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "💾 Guardar cambios"}</button>
        </div>
      </div>
    </div>
  );
}
