import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { descargarPlantillaAux, leerAuxiliaresExcel } from "./reportes.js";

const VACIO = { id: null, nombre: "", usuario: "", pin: "", telefono: "", activo: true };

export default function AdminAuxiliares({ pass, toast, cargar }) {
  const [lista, setLista] = useState([]);
  const [form, setForm] = useState(VACIO);
  const [guardando, setGuardando] = useState(false);
  const [resImport, setResImport] = useState(null);
  const [q, setQ] = useState("");

  const refrescar = useCallback(() => adminApi.listarAuxiliares(pass).then(setLista).catch((e) => toast(e.message, "error")), [pass, toast]);
  useEffect(() => { refrescar(); }, [refrescar]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const guardar = async (e) => {
    e.preventDefault();
    setGuardando(true);
    try {
      await adminApi.guardarAuxiliar(pass, form);
      toast(form.id ? "Auxiliar actualizado" : "Auxiliar creado: " + form.usuario, "success");
      setForm(VACIO); refrescar(); cargar();
    } catch (err) { toast(err.message, "error"); }
    finally { setGuardando(false); }
  };

  const editar = (a) => { setForm({ id: a.id, nombre: a.nombre, usuario: a.usuario, pin: "", telefono: a.telefono || "", activo: a.activo }); window.scrollTo({ top: 0, behavior: "smooth" }); };

  const eliminar = async (a) => {
    if (!confirm(`¿Eliminar al auxiliar ${a.nombre}? Sus rutas quedan en el historial sin usuario.`)) return;
    try { await adminApi.eliminarAuxiliar(pass, a.id); toast("Auxiliar eliminado", "success"); refrescar(); cargar(); }
    catch (err) { toast(err.message, "error"); }
  };

  const alternar = async (a) => {
    try { await adminApi.guardarAuxiliar(pass, { ...a, pin: "", activo: !a.activo }); refrescar(); }
    catch (err) { toast(err.message, "error"); }
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const items = await leerAuxiliaresExcel(file);
      if (!items.length) { toast("El archivo no tiene filas con Nombre y Usuario", "error"); return; }
      const res = await adminApi.importarAuxiliares(pass, items);
      setResImport(res);
      toast(`${res.creados} creados · ${res.actualizados} actualizados` + (res.errores.length ? ` · ${res.errores.length} con error` : ""), res.errores.length ? "info" : "success");
      refrescar(); cargar();
    } catch (err) { toast(err.message, "error"); }
  };

  const t = q.trim().toLowerCase();
  const filtrada = t ? lista.filter((a) => (a.nombre + " " + a.usuario).toLowerCase().includes(t)) : lista;

  return (
    <>
      <div className="adm-grid g-2">
        <section className="card">
          <div className="card-h"><h3>{form.id ? "✏️ Editar auxiliar" : "➕ Agregar auxiliar"}</h3></div>
          <form onSubmit={guardar} className="aux-form">
            <div className="field-row"><label>Nombre completo (igual a "Nombre conductor" del archivo) *</label>
              <input className="inp" required value={form.nombre} onChange={(e) => set("nombre", e.target.value)} placeholder="Ej: SANCHEZ ARIÑA JESUS DAVID" /></div>
            <div className="grid grid-2">
              <div className="field-row"><label>Usuario *</label>
                <input className="inp" required autoCapitalize="none" value={form.usuario} onChange={(e) => set("usuario", e.target.value)} placeholder="Ej: jsanchez" /></div>
              <div className="field-row"><label>PIN de 4 dígitos {form.id ? "(vacío = no cambiar)" : "*"}</label>
                <input className="inp" required={!form.id} inputMode="numeric" maxLength={4} value={form.pin} onChange={(e) => set("pin", e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="••••" /></div>
            </div>
            <div className="field-row"><label>Teléfono (opcional)</label>
              <input className="inp" type="tel" value={form.telefono} onChange={(e) => set("telefono", e.target.value)} /></div>
            <div className="row-actions">
              {form.id && <button type="button" className="btn btn-outline" onClick={() => setForm(VACIO)}>Cancelar</button>}
              <button className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando..." : form.id ? "Guardar cambios" : "Crear auxiliar"}</button>
            </div>
          </form>
        </section>

        <section className="card">
          <div className="card-h"><h3>📄 Subir auxiliares en archivo plano</h3>
            <button className="btn btn-xs btn-outline" onClick={descargarPlantillaAux}>⬇ Plantilla</button></div>
          <p className="hint">Excel o CSV con las columnas <b>Nombre, Usuario, PIN, Teléfono</b>. Si el usuario ya existe se actualiza (y cambia su PIN).</p>
          <label className="dropzone"><input type="file" accept=".xls,.xlsx,.csv" onChange={onFile} hidden /><span>👥</span><b>Elegir archivo de auxiliares</b><small>Crea o actualiza varios a la vez</small></label>
          {resImport && (
            <div className="result">
              <b>✔ {resImport.creados} creados · {resImport.actualizados} actualizados</b>
              {resImport.errores.map((x, i) => <span key={i} className="warn">⚠ {x.usuario || x.nombre}: {x.error}</span>)}
            </div>
          )}
        </section>
      </div>

      <section className="card">
        <div className="card-h"><h3>Auxiliares ({lista.length})</h3>
          <input className="inp sm adm-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar..." /></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Nombre</th><th>Usuario</th><th>Teléfono</th><th>Rutas</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filtrada.map((a) => (
              <tr key={a.id}>
                <td><b>{a.nombre}</b></td><td>{a.usuario}</td><td>{a.telefono || "-"}</td><td>{a.rutas}</td>
                <td><button className={"bdg " + (a.activo ? "b-green" : "b-gray")} onClick={() => alternar(a)}>{a.activo ? "Activo" : "Inactivo"}</button></td>
                <td className="nowrap"><button className="btn btn-xs btn-outline" onClick={() => editar(a)}>✏️ Editar / PIN</button> <button className="btn btn-xs btn-danger" onClick={() => eliminar(a)}>🗑</button></td>
              </tr>
            ))}
            {!filtrada.length && <tr><td colSpan={6} className="empty">Aún no hay auxiliares</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
