import { useCallback, useMemo, useState, useDeferredValue } from "react";
import { useStore, useToast } from "../store.jsx";
import { parsePlanillaExcel, descargarPlantilla } from "../lib/excel.js";
import { PLANTILLA_COLUMNAS } from "../lib/constants.js";
import { normText, money } from "../lib/utils.js";
import { facturaSaldoAPagar } from "../lib/calc.js";
import FacturaCard from "./FacturaCard.jsx";
import Modal from "../components/Modal.jsx";

/* Selector de planilla: el reporte del día trae una planilla por vehículo */
function PlanillaPicker({ grupos, actual, onPick, onClose }) {
  const [q, setQ] = useState("");
  if (!grupos) return null;
  const t = normText(q);
  const lista = t
    ? grupos.filter((g) => [g.route.placa, g.route.conductor, g.route.planilla].some((v) => normText(v).includes(t)))
    : grupos;
  const esActual = (g) => (actual.planilla && g.route.planilla === actual.planilla) || (actual.placa && g.route.placa === actual.placa);

  return (
    <Modal open title={"Elige tu ruta (" + grupos.length + " planillas en el archivo)"} onClose={onClose} wide>
      <input className="inp" type="search" autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="🔍 Buscar por placa, conductor o planilla..." style={{ marginBottom: 10 }} />
      <div className="planilla-list">
        {lista.map((g) => (
          <button key={g.key} className={"planilla-item" + (esActual(g) ? " actual" : "")} onClick={() => onPick(g)}>
            <div className="planilla-placa">🚚 {g.route.placa || "-"}</div>
            <div className="planilla-info">
              <b>{g.route.conductor || "Sin conductor"}</b>
              <span>Planilla {g.route.planilla || "-"} · {g.route.fecha || "-"}</span>
            </div>
            <div className="planilla-count">{g.facturas.length}<small>facturas</small></div>
          </button>
        ))}
        {!lista.length && <div className="empty">Ninguna planilla coincide.</div>}
      </div>
    </Modal>
  );
}

const ESTADO_CHIPS = ["TODOS", "OK", "Dev Parcial", "Dev Total", "Reenvío"];
const ENTREGA_CHIPS = [
  { v: "TODAS", label: "Todas" },
  { v: "PENDIENTES", label: "Pendientes" },
  { v: "ENTREGADAS", label: "Entregadas" }
];

export default function Entregas({ filtro, setFiltro }) {
  const { state, actions } = useStore();
  const toast = useToast();
  const [cargando, setCargando] = useState(false);
  const [grupos, setGrupos] = useState(null);
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

  const importar = (grupo) => {
    const { nuevas, repetidas } = actions.importPlanilla(grupo);
    setGrupos(null);
    toast(nuevas + " factura(s) cargadas de la planilla " + (grupo.route.planilla || grupo.key) + (repetidas ? " · " + repetidas + " ya estaban en la ruta" : ""), "success");
  };

  const onFile = async (e) => {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setCargando(true);
    try {
      const parsed = await parsePlanillaExcel(file);
      // el reporte trae todas las rutas del día: si hay más de una, el auxiliar elige la suya
      if (parsed.length === 1) importar(parsed[0]);
      else setGrupos(parsed);
    } catch (err) {
      console.error(err);
      toast(err.message || "No se pudo leer el archivo", "error");
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      <div className="panel">
        <h2>📥 Cargar planilla de facturas</h2>
        <p className="hint">
          Columnas que se leen: <b>{PLANTILLA_COLUMNAS.join(", ")}</b>. Las demás columnas del archivo se ignoran.
          Si un documento aparece varias veces se carga una sola vez.
        </p>
        <div className="upload-row">
          <input type="file" className="inp" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={cargando} />
          <button className="btn btn-outline" onClick={() => descargarPlantilla()}>⬇️ Descargar plantilla</button>
        </div>
        {cargando && <div className="hint">Leyendo archivo...</div>}
      </div>

      <PlanillaPicker grupos={grupos} actual={state.route} onPick={importar} onClose={() => setGrupos(null)} />

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
            {facturas.length ? "Ninguna factura coincide con la búsqueda o los filtros." : "No hay facturas. Sube la planilla de Excel para comenzar."}
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
