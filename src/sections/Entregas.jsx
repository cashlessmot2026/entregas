import { useCallback, useMemo, useState, useDeferredValue } from "react";
import { useStore } from "../store.jsx";
import { normText, money } from "../lib/utils.js";
import { facturaSaldoAPagar } from "../lib/calc.js";
import FacturaCard from "./FacturaCard.jsx";

const ESTADO_CHIPS = ["TODOS", "OK", "Dev Parcial", "Dev Total", "Reenvío"];
const ENTREGA_CHIPS = [
  { v: "TODAS", label: "Todas" },
  { v: "PENDIENTES", label: "Pendientes" },
  { v: "ENTREGADAS", label: "Entregadas" }
];

export default function Entregas({ filtro, setFiltro }) {
  const { state } = useStore();
  const [expandidas, setExpandidas] = useState(() => new Set());
  const { facturas, devoluciones } = state;
  const busqueda = useDeferredValue(filtro.busqueda);

  const clientesRuta = useMemo(
    () => Array.from(new Set(facturas.map((f) => f.cliente.trim()).filter(Boolean))).sort(),
    [facturas]
  );
  const vendedoresRuta = useMemo(
    () => Array.from(new Set(facturas.map((f) => f.vendedor).filter(Boolean))).sort(),
    [facturas]
  );
  const facturasPorCliente = useMemo(() => {
    const m = {};
    facturas.forEach((f) => { const k = normText(f.cliente); if (k) m[k] = (m[k] || 0) + 1; });
    return m;
  }, [facturas]);

  const lista = useMemo(() => {
    let l = facturas;
    if (filtro.estado !== "TODOS") l = l.filter((f) => f.estado === filtro.estado);
    if (filtro.entrega === "PENDIENTES") l = l.filter((f) => !f.confirmada);
    if (filtro.entrega === "ENTREGADAS") l = l.filter((f) => f.confirmada);
    if (filtro.cliente !== "TODOS") l = l.filter((f) => normText(f.cliente) === normText(filtro.cliente));
    if (filtro.vendedor !== "TODOS") l = l.filter((f) => f.vendedor === filtro.vendedor);
    const term = normText(busqueda);
    if (term) {
      l = l.filter((f) => {
        const n = normText(f.numero);
        return n.includes(term) || n.endsWith(term) || normText(f.cliente).includes(term) || normText(f.sucursal).includes(term);
      });
    }
    return l;
  }, [facturas, filtro, busqueda]);

  const totalLista = useMemo(() => lista.reduce((s, f) => s + facturaSaldoAPagar(f, devoluciones), 0), [lista, devoluciones]);

  const set = (patch) => setFiltro((f) => ({ ...f, ...patch }));
  const toggle = useCallback((id) => setExpandidas((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; }), []);
  const collapse = useCallback((id) => setExpandidas((s) => { const n = new Set(s); n.delete(id); return n; }), []);
  const filtrarCliente = useCallback((c) => {
    setFiltro((f) => ({ ...f, cliente: c, busqueda: "" }));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [setFiltro]);
  const hayFiltros = filtro.estado !== "TODOS" || filtro.entrega !== "TODAS" || filtro.cliente !== "TODOS" || filtro.vendedor !== "TODOS" || filtro.busqueda;

  return (
    <>
      <div className="panel">
        <h2>🚚 Facturas de la ruta</h2>
        <div className="search-bar">
          <input
            className="inp search-inp"
            type="search"
            value={filtro.busqueda}
            onChange={(e) => set({ busqueda: e.target.value })}
            placeholder="🔍 Buscar por número de factura (o últimos dígitos) o nombre del cliente..."
          />
        </div>
        <div className="filters-bar">
          <select className="inp" value={filtro.cliente} onChange={(e) => set({ cliente: e.target.value })}>
            <option value="TODOS">Todos los clientes</option>
            {clientesRuta.map((c) => <option key={c} value={c}>{c} ({facturasPorCliente[normText(c)]})</option>)}
          </select>
          <select className="inp" value={filtro.vendedor} onChange={(e) => set({ vendedor: e.target.value })}>
            <option value="TODOS">Todos los vendedores</option>
            {vendedoresRuta.map((v) => <option key={v} value={v}>{v}</option>)}
          </select>
          {hayFiltros && (
            <button className="btn btn-sm btn-outline" onClick={() => setFiltro({ estado: "TODOS", entrega: "TODAS", cliente: "TODOS", vendedor: "TODOS", busqueda: "" })}>
              ✕ Quitar filtros
            </button>
          )}
        </div>
        <div className="filters-bar">
          <div className="chip-group">
            {ESTADO_CHIPS.map((e) => (
              <span key={e} className={"chip" + (filtro.estado === e ? " active" : "")} onClick={() => set({ estado: e })}>{e === "TODOS" ? "Todos" : e}</span>
            ))}
          </div>
          <div className="chip-group">
            {ENTREGA_CHIPS.map((c) => (
              <span key={c.v} className={"chip" + (filtro.entrega === c.v ? " active" : "")} onClick={() => set({ entrega: c.v })}>{c.label}</span>
            ))}
          </div>
          <span className="count-lbl">{lista.length} factura(s) · {money(totalLista)} a recaudar</span>
        </div>

        {!lista.length ? (
          <div className="empty">
            {facturas.length ? "Ninguna factura coincide con la búsqueda o los filtros." : "No hay facturas. Cuando el administrador cargue tu ruta aparecerá aquí (usa «Buscar mi ruta» en el Panel general)."}
          </div>
        ) : (
          lista.map((f) => (
            <FacturaCard
              key={f.id}
              f={f}
              expandida={expandidas.has(f.id)}
              onToggle={toggle}
              onCollapse={collapse}
              saldo={facturaSaldoAPagar(f, devoluciones)}
              facturasDelCliente={facturasPorCliente[normText(f.cliente)] || 0}
              onFiltrarCliente={filtrarCliente}
            />
          ))
        )}
      </div>
    </>
  );
}
