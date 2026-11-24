import { useMemo, useState } from "react";
import { useStore } from "../store.jsx";
import { money, normText } from "../lib/utils.js";
import ScannerModal from "../components/ScannerModal.jsx";

/* Catálogo de productos (solo consulta): lo administra el admin en su panel → Productos.
   Se usa para registrar las devoluciones parciales. */
export default function Productos() {
  const { state } = useStore();
  const [search, setSearch] = useState("");
  const [scan, setScan] = useState(false);

  const rows = useMemo(() => {
    const t = normText(search);
    const raw = search.trim();
    return state.productos.filter((p) => !t || normText(p.nombre).includes(t) || normText(p.codigo).includes(t) || (raw && (p.codigoBarras || "").includes(raw)));
  }, [state.productos, search]);

  return (
    <>
      <div className="panel">
        <h2>Base de datos de productos ({state.productos.length} productos)</h2>
        <p className="hint">La lista la administra el administrador. Se actualiza sola al abrir la app o al tocar "Buscar mi ruta".</p>
        <div style={{ display: "flex", gap: 6, maxWidth: 360, marginBottom: 10 }}>
          <input className="inp" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="🔍 Buscar producto..." />
          <button className="btn btn-outline" onClick={() => setScan(true)} title="Buscar escaneando código de barras">📷</button>
        </div>
        {!rows.length ? <div className="empty">{state.productos.length ? "Ningún producto coincide con la búsqueda." : "No hay productos."}</div> : (
          <table className="doc-tbl">
            <thead><tr><th>Código</th><th>Producto</th><th>Valor unitario</th><th>Código de barras</th></tr></thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.codigo}>
                  <td>{p.codigo}</td>
                  <td>{p.nombre}</td>
                  <td>{money(p.valorUnitario)}</td>
                  <td>{p.codigoBarras || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <ScannerModal open={scan} onClose={() => setScan(false)} onCode={setSearch} />
    </>
  );
}
