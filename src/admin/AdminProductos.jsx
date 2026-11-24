import { useCallback, useEffect, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { parseProductosExcel } from "../lib/excel.js";
import { money, num, normText } from "../lib/utils.js";
import Modal from "../components/Modal.jsx";
import ScannerModal from "../components/ScannerModal.jsx";

const VACIO = { codigo: "", nombre: "", valorUnitario: "", codigoBarras: "" };
const deServidor = (p) => ({ codigo: p.codigo, nombre: p.nombre, valorUnitario: Number(p.valor_unitario) || 0, codigoBarras: p.codigo_barras || "" });

/* Catálogo de productos: lo edita el admin y les llega a todos los auxiliares (para las devoluciones) */
export default function AdminProductos({ pass, toast }) {
  const [lista, setLista] = useState(null);
  const [q, setQ] = useState("");
  const [edit, setEdit] = useState(null); // { ant: código original o "" si es nuevo, form }
  const [guardando, setGuardando] = useState(false);
  const [scan, setScan] = useState(null); // "buscar" | "form"
  const [resImport, setResImport] = useState(null);

  const poner = (l) => setLista((l || []).map(deServidor));
  const refrescar = useCallback(() => adminApi.productos(pass).then(poner).catch((e) => { setLista([]); toast("No se pudieron cargar los productos: " + e.message, "error"); }), [pass, toast]);
  useEffect(() => { refrescar(); }, [refrescar]);

  const abrir = (p) => setEdit(p ? { ant: p.codigo, form: { ...p, valorUnitario: String(p.valorUnitario) } } : { ant: "", form: VACIO });
  const setF = (k, v) => setEdit((e) => ({ ...e, form: { ...e.form, [k]: v } }));

  const guardar = async (e) => {
    if (e) e.preventDefault();
    const f = edit.form;
    if (!f.nombre.trim()) { toast("Escribe el nombre del producto", "error"); return; }
    setGuardando(true);
    try {
      poner(await adminApi.guardarProducto(pass, edit.ant, { ...f, valorUnitario: num(f.valorUnitario) }));
      toast(edit.ant ? "Producto actualizado" : "Producto creado", "success");
      setEdit(null);
    } catch (err) { toast(err.message, "error"); }
    finally { setGuardando(false); }
  };

  const eliminar = async (p) => {
    if (!confirm(`¿Eliminar el producto ${p.codigo} · ${p.nombre}? Las devoluciones ya registradas no cambian.`)) return;
    try { poner(await adminApi.eliminarProducto(pass, p.codigo)); toast("Producto eliminado", "success"); }
    catch (err) { toast(err.message, "error"); }
  };

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const items = (await parseProductosExcel(file, 0)).map((p) => ({ nombre: p.nombre, valor_unitario: p.valorUnitario, codigo_barras: p.codigoBarras }));
      if (!items.length) { toast("El archivo no tiene filas con PRODUCTO/REFERENCIA", "error"); return; }
      const res = await adminApi.importarProductos(pass, items);
      poner(res.productos);
      setResImport(res);
      toast(`${res.creados} creados · ${res.actualizados} actualizados`, "success");
    } catch (err) { toast("No se pudo importar: " + err.message, "error"); }
  };

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.json_to_sheet((lista || []).map((p) => ({ "CODIGO": p.codigo, "PRODUCTO/REFERENCIA": p.nombre, "valor unitario": p.valorUnitario, "CODIGO DE BARRAS": p.codigoBarras })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Productos");
    XLSX.writeFile(wb, "productos_liconsumar.xlsx");
  };

  const t = normText(q);
  const filas = (lista || []).filter((p) => !t || normText(p.nombre).includes(t) || normText(p.codigo).includes(t) || (p.codigoBarras || "").includes(q.trim()));

  return (
    <>
      <div className="adm-grid g-2">
        <section className="card">
          <div className="card-h"><h3>🏷️ Catálogo de productos</h3></div>
          <p className="hint">Esta lista es la que ven todos los auxiliares para registrar las devoluciones. Ellos solo la consultan: los cambios se hacen aquí y les llegan al abrir la app o al actualizar su ruta.</p>
          <div className="row-actions" style={{ justifyContent: "flex-start", marginTop: 0 }}>
            <button className="btn btn-primary" onClick={() => abrir(null)}>➕ Nuevo producto</button>
            <button className="btn btn-outline" onClick={exportar} disabled={!lista || !lista.length}>⬇ Descargar Excel</button>
          </div>
        </section>
        <section className="card">
          <div className="card-h"><h3>📄 Subir productos en Excel</h3></div>
          <p className="hint">Columnas: <b>PRODUCTO/REFERENCIA, valor unitario</b> (opcional: <b>CODIGO DE BARRAS</b>). Si el producto ya existe (mismo nombre) se actualiza su valor; si no, se crea.</p>
          <label className="dropzone"><input type="file" accept=".xls,.xlsx,.csv" onChange={onFile} hidden /><span>🏷️</span><b>Elegir archivo de productos</b><small>Crea o actualiza varios a la vez</small></label>
          {resImport && <div className="result"><b>✔ {resImport.creados} creados · {resImport.actualizados} actualizados</b></div>}
        </section>
      </div>

      <section className="card">
        <div className="card-h">
          <h3>Productos ({lista ? lista.length : "…"})</h3>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="inp" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar por nombre, código o código de barras" style={{ minWidth: 240 }} />
            <button className="btn btn-outline" title="Buscar escaneando el código de barras" onClick={() => setScan("buscar")}>📷</button>
          </div>
        </div>
        {lista === null ? <div className="empty">Cargando productos...</div> : !filas.length ? <div className="empty">{lista.length ? "Ningún producto coincide con la búsqueda." : "No hay productos. Crea uno o sube un Excel."}</div> : (
          <div className="tbl-wrap">
            <table className="tbl">
              <thead><tr><th>Código</th><th>Producto</th><th>Valor unitario</th><th>Código de barras</th><th></th></tr></thead>
              <tbody>
                {filas.map((p) => (
                  <tr key={p.codigo}>
                    <td className="nowrap"><b>{p.codigo}</b></td>
                    <td>{p.nombre}</td>
                    <td className="nowrap">{money(p.valorUnitario)}</td>
                    <td>{p.codigoBarras || <span className="muted">—</span>}</td>
                    <td className="nowrap">
                      <button className="btn btn-xs btn-primary" onClick={() => abrir(p)}>✏️ Editar</button>{" "}
                      <button className="btn btn-xs btn-danger" title="Eliminar" onClick={() => eliminar(p)}>🗑</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Modal
        open={!!edit}
        title={edit && edit.ant ? "✏️ Editar producto " + edit.ant : "➕ Nuevo producto"}
        onClose={() => !guardando && setEdit(null)}
        actions={<button className="btn btn-primary" disabled={guardando} onClick={guardar}>{guardando ? "Guardando..." : "Guardar"}</button>}
      >
        {edit && (
          <form onSubmit={guardar} className="aux-form">
            <div className="field-row"><label>Código {edit.ant ? "" : "(vacío = se asigna solo)"}</label>
              <input className="inp" value={edit.form.codigo} onChange={(e) => setF("codigo", e.target.value.toUpperCase())} placeholder="Ej: P0047" /></div>
            <div className="field-row"><label>Nombre del producto *</label>
              <input className="inp" required autoFocus value={edit.form.nombre} onChange={(e) => setF("nombre", e.target.value)} placeholder="Ej: ANTIOQUEÑO TRADICIONAL 750 ML" /></div>
            <div className="field-row"><label>Valor unitario</label>
              <input className="inp" type="number" min="0" inputMode="numeric" value={edit.form.valorUnitario} onChange={(e) => setF("valorUnitario", e.target.value)} /></div>
            <div className="field-row"><label>Código de barras</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input className="inp" value={edit.form.codigoBarras} onChange={(e) => setF("codigoBarras", e.target.value)} placeholder="Escanear o digitar" />
                <button type="button" className="btn btn-outline" onClick={() => setScan("form")}>📷</button>
              </div></div>
            <button type="submit" hidden />
          </form>
        )}
      </Modal>
      <ScannerModal open={!!scan} onClose={() => setScan(null)} onCode={(code) => (scan === "form" ? setF("codigoBarras", code) : setQ(code))} />
    </>
  );
}
