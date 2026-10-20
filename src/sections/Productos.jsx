import { useMemo, useState } from "react";
import { useStore, useToast } from "../store.jsx";
import { num } from "../lib/utils.js";
import { parseProductosExcel } from "../lib/excel.js";
import ScannerModal from "../components/ScannerModal.jsx";
import CommitInput from "../components/CommitInput.jsx";

/* Base de productos: se usa para registrar las devoluciones parciales */
export default function Productos() {
  const { state, actions } = useStore();
  const toast = useToast();
  const [nuevo, setNuevo] = useState({ nombre: "", valor: "", barras: "" });
  const [search, setSearch] = useState("");
  const [scanTarget, setScanTarget] = useState(null);

  const nextCodigo = (offset = 0) => "P" + String(state.productos.length + 1 + offset).padStart(4, "0");

  const rows = useMemo(() => {
    const s = search.toLowerCase();
    return state.productos.filter((p) => p.nombre.toLowerCase().includes(s) || p.codigo.toLowerCase().includes(s) || (p.codigoBarras || "").toLowerCase().includes(s));
  }, [state.productos, search]);

  const agregar = () => {
    if (!nuevo.nombre.trim()) { toast("Ingresa el nombre del producto", "error"); return; }
    actions.addProductos([{ codigo: nextCodigo(), nombre: nuevo.nombre.trim(), valorUnitario: num(nuevo.valor), codigoBarras: nuevo.barras.trim() }]);
    setNuevo({ nombre: "", valor: "", barras: "" });
    toast("Producto agregado", "success");
  };

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const list = await parseProductosExcel(file, state.productos.length);
      actions.addProductos(list);
      toast(list.length + " productos importados", "success");
    } catch (err) {
      console.error(err);
      toast("No se pudo leer el archivo de productos", "error");
    }
  };

  return (
    <>
      <div className="panel">
        <h2>🏷️ Cargar productos vía Excel</h2>
        <p className="hint">Columnas esperadas: <b>PRODUCTO/REFERENCIA, valor unitario</b> (opcional: CODIGO DE BARRAS). Se usan para registrar devoluciones.</p>
        <input type="file" className="inp" accept=".xlsx,.xls,.csv" onChange={onFile} />
      </div>
      <div className="panel">
        <h3 style={{ marginTop: 0 }}>Agregar producto manualmente</h3>
        <div className="grid grid-4">
          <input className="inp" value={nuevo.nombre} onChange={(e) => setNuevo({ ...nuevo, nombre: e.target.value })} placeholder="Nombre del producto" />
          <input className="inp" type="number" value={nuevo.valor} onChange={(e) => setNuevo({ ...nuevo, valor: e.target.value })} placeholder="Valor unitario" />
          <div style={{ display: "flex", gap: 6 }}>
            <input className="inp" value={nuevo.barras} onChange={(e) => setNuevo({ ...nuevo, barras: e.target.value })} placeholder="Código de barras" />
            <button className="btn btn-outline" onClick={() => setScanTarget("nuevo")}>📷</button>
          </div>
          <button className="btn btn-primary" onClick={agregar}>+ Agregar</button>
        </div>
      </div>
      <div className="panel">
        <h2>Base de datos de productos ({state.productos.length} productos)</h2>
        <div style={{ display: "flex", gap: 6, maxWidth: 320, marginBottom: 10 }}>
          <input className="inp" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Buscar producto..." />
          <button className="btn btn-outline" onClick={() => setScanTarget("buscar")} title="Buscar escaneando código de barras">📷</button>
        </div>
        <table className="doc-tbl">
          <thead><tr><th>Código</th><th>Producto</th><th>Valor unitario</th><th>Código de barras</th><th></th></tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.codigo}>
                <td>{p.codigo}</td>
                <td><CommitInput className="cellinput" value={p.nombre} onCommit={(v) => actions.updateProducto(p.codigo, { nombre: v })} /></td>
                <td><CommitInput className="cellinput" type="number" value={p.valorUnitario} onCommit={(v) => actions.updateProducto(p.codigo, { valorUnitario: num(v) })} /></td>
                <td><CommitInput className="cellinput" value={p.codigoBarras || ""} placeholder="Escanear o digitar" onCommit={(v) => actions.updateProducto(p.codigo, { codigoBarras: v })} /></td>
                <td><button className="btn btn-sm btn-danger" onClick={() => { if (confirm("¿Eliminar este producto de la base de datos?")) actions.deleteProducto(p.codigo); }}>Eliminar</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ScannerModal
        open={!!scanTarget}
        onClose={() => setScanTarget(null)}
        onCode={(code) => (scanTarget === "nuevo" ? setNuevo((n) => ({ ...n, barras: code })) : setSearch(code))}
      />
    </>
  );
}
