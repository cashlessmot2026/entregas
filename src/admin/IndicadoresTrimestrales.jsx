import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { normText } from "../lib/utils.js";
import { filasIndicadores, calcularIndicadores, MESES, TRIMESTRES } from "./indicadores.js";

const P = (v) => (v == null ? "" : (v * 100).toFixed(2).replace(".", ",") + "%");
const V = (v) => (v == null ? "" : (v > 0 ? "+" : "") + (v * 100).toFixed(2).replace(".", ",") + "%");
const claseVar = (v) => (v == null || !v ? "" : v > 0 ? "var-ok" : "var-mal");
const r2 = (v) => +(v * 100).toFixed(2);

function TablaPersonas({ titulo, lista, total }) {
  return (
    <div className="ind-box">
      <h4>{titulo}</h4>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{titulo}</th><th>Ped. Despachados</th><th>Ped. Devueltos</th><th>Porcentaje</th></tr></thead>
        <tbody>
          {lista.map((x) => <tr key={x.nombre}><td>{x.nombre}</td><td>{x.despachados}</td><td>{x.devueltos}</td><td>{P(x.pct)}</td></tr>)}
          {!lista.length && <tr><td colSpan={4} className="empty">Sin datos</td></tr>}
          {lista.length > 0 && <tr className="tot"><td>Total general</td><td>{total.despachados}</td><td>{total.devueltos}</td><td>{P(total.pct)}</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

function TablaCruce({ titulo, c, etiqueta, lista }) {
  return (
    <div className="ind-box">
      <h4>{titulo}</h4>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{etiqueta}</th>{c.cols.map((m) => <th key={m}>{m}</th>)}<th>Total general</th><th>Porcentaje</th></tr></thead>
        <tbody>
          {lista.map((x) => <tr key={x.nombre}><td>{x.nombre}</td>{x.v.map((n, i) => <td key={i}>{n || ""}</td>)}<td><b>{x.total}</b></td><td>{P(x.pct)}</td></tr>)}
          {!lista.length && <tr><td colSpan={c.cols.length + 3} className="empty">Sin devoluciones</td></tr>}
          {lista.length > 0 && <tr className="tot"><td>Total general</td>{c.totales.map((n, i) => <td key={i}>{n}</td>)}<td>{c.total}</td><td>{P(1)}</td></tr>}
        </tbody>
      </table></div>
    </div>
  );
}

function TablaPeriodos({ titulo, etiqueta, lista, total }) {
  return (
    <div className="ind-box">
      <h4>{titulo}</h4>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>{etiqueta}</th><th>Ped. Despachados</th><th>Ped. Devueltos</th><th>Porcentaje</th><th>VAR. %</th></tr></thead>
        <tbody>
          {lista.map((x) => <tr key={x.nombre}><td>{x.nombre}</td><td>{x.despachados}</td><td>{x.devueltos}</td><td>{P(x.pct)}</td><td className={claseVar(x.var)}>{V(x.var)}</td></tr>)}
          <tr className="tot"><td>Total general</td><td>{total.despachados}</td><td>{total.devueltos}</td><td>{P(total.pct)}</td><td></td></tr>
        </tbody>
      </table></div>
    </div>
  );
}

/* Indicadores trimestrales de despachos y devoluciones (misma estructura del Excel de indicadores), con los datos de la app */
export default function IndicadoresTrimestrales({ pass }) {
  const hoy = new Date();
  const [anio, setAnio] = useState(hoy.getFullYear());
  const [trim, setTrim] = useState(Math.ceil((hoy.getMonth() + 1) / 3));
  const [mes, setMes] = useState(0);
  const [vendedor, setVendedor] = useState("");
  const [entregador, setEntregador] = useState("");
  const [q, setQ] = useState("");
  const [filas, setFilas] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let vivo = true;
    setCargando(true); setError("");
    adminApi.dataset(pass, anio + "-01-01", anio + "-12-31")
      .then((ds) => { if (vivo) setFilas(filasIndicadores(ds)); })
      .catch((e) => { if (vivo) setError(e.message); })
      .finally(() => { if (vivo) setCargando(false); });
    return () => { vivo = false; };
  }, [pass, anio]);

  const r = useMemo(() => calcularIndicadores(filas, { trim, mes, vendedor, entregador }), [filas, trim, mes, vendedor, entregador]);
  const t = normText(q);
  const buscar = (l) => (t ? l.filter((x) => normText(x.nombre).includes(t)) : l);
  const mesesDelTrim = trim ? [1, 2, 3].map((i) => (trim - 1) * 3 + i) : MESES.map((_, i) => i + 1);
  const anios = [hoy.getFullYear() + 1, hoy.getFullYear(), hoy.getFullYear() - 1, hoy.getFullYear() - 2, hoy.getFullYear() - 3];

  const exportar = async () => {
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const add = (nombre, cab, filasX) => XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([cab, ...filasX]), nombre);
    const per = (l, tot) => [...l.map((x) => [x.nombre, x.despachados, x.devueltos, r2(x.pct), x.var == null ? "" : r2(x.var)]), ["Total general", tot.despachados, tot.devueltos, r2(tot.pct), ""]];
    const cr = (c) => [...c.filas.map((x) => [x.nombre, ...x.v, x.total, r2(x.pct)]), ["Total general", ...c.totales, c.total, 100]];
    add("Por mes", ["Mes", "Ped. Despachados", "Ped. Devueltos", "Porcentaje %", "VAR %"], per(r.porMes, r.totalMes));
    add("Causales", ["Causal", ...r.causales.cols, "Total general", "Porcentaje %"], cr(r.causales));
    add("Rutas", ["Ruta / vehículo", ...r.rutas.cols, "Total general", "Porcentaje %"], cr(r.rutas));
    add("Vendedores", ["Nombre vendedor", "Ped. Despachados", "Ped. Devueltos", "Porcentaje %"], per(r.vendedores, r.totalSel).map((x) => x.slice(0, 4)));
    add("Entregadores", ["Nombre entregador", "Ped. Despachados", "Ped. Devueltos", "Porcentaje %"], per(r.entregadores, r.totalSel).map((x) => x.slice(0, 4)));
    add("Consolidado", ["Trimestre", "Ped. Despachados", "Ped. Devueltos", "Porcentaje %", "VAR %"], per(r.porTrim, r.totalTrim));
    add("Causales x trimestre", ["Causal", ...r.causalesTrim.cols, "Total general", "Porcentaje %"], cr(r.causalesTrim));
    XLSX.writeFile(wb, `indicadores_despachos_${anio}${trim ? "_T" + trim : ""}.xlsx`);
  };

  return (
    <section className="card">
      <div className="card-h"><h3>📈 Indicadores de despachos y devoluciones <small className="muted">(trimestrales, con los datos de la aplicación)</small></h3>
        <button className="btn btn-xs btn-outline" onClick={exportar} disabled={cargando || !filas.length}>⬇ Excel</button></div>

      <div className="ind-filtros">
        <label>Año<select className="inp sm" value={anio} onChange={(e) => setAnio(Number(e.target.value))}>{anios.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
        <label>Trimestre<select className="inp sm" value={trim} onChange={(e) => { setTrim(Number(e.target.value)); setMes(0); }}>
          <option value={0}>Todo el año</option>{TRIMESTRES.map((n, i) => <option key={n} value={i + 1}>{n}</option>)}</select></label>
        <label>Mes<select className="inp sm" value={mes} onChange={(e) => setMes(Number(e.target.value))}>
          <option value={0}>Todos</option>{mesesDelTrim.map((m) => <option key={m} value={m}>{MESES[m - 1]}</option>)}</select></label>
        <label>Vendedor<select className="inp sm" value={vendedor} onChange={(e) => setVendedor(e.target.value)}>
          <option value="">Todos</option>{r.vendedoresLista.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label>Entregador<select className="inp sm" value={entregador} onChange={(e) => setEntregador(e.target.value)}>
          <option value="">Todos</option>{r.entregadoresLista.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>
        <label className="ind-q">Buscar<input className="inp sm" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Causal, vendedor, entregador, vehículo..." /></label>
        {(vendedor || entregador || mes || q) && <button className="btn btn-xs btn-outline" onClick={() => { setVendedor(""); setEntregador(""); setMes(0); setQ(""); }}>Limpiar</button>}
      </div>

      {cargando && <div className="empty">Cargando indicadores de {anio}...</div>}
      {error && <div className="empty">No se pudieron cargar: {error}</div>}
      {!cargando && !error && !filas.length && <div className="empty">No hay rutas cargadas en {anio}</div>}

      {!cargando && !error && filas.length > 0 && (
        <>
          <div className="ind-grid">
            <TablaPeriodos titulo="Despachos por mes" etiqueta="Mes" lista={r.porMes} total={r.totalMes} />
            <TablaCruce titulo="Causales de devolución" etiqueta="Causales" c={r.causales} lista={buscar(r.causales.filas)} />
          </div>
          <small className="muted">VAR. % = % de devolución del mes (o trimestre) anterior − el actual: verde = mejoró, rojo = empeoró. "Ruta" es el vehículo (placa) de la planilla.</small>

          <div className="ind-grid" style={{ marginTop: 14 }}>
            <TablaCruce titulo="Devoluciones por ruta / vehículo" etiqueta="Ruta (vehículo)" c={r.rutas} lista={buscar(r.rutas.filas)} />
            <TablaPersonas titulo="Nombre vendedor" lista={buscar(r.vendedores)} total={r.totalSel} />
          </div>

          <div className="ind-grid">
            <TablaPersonas titulo="Nombre entregador" lista={buscar(r.entregadores)} total={r.totalSel} />
            <TablaPeriodos titulo={"Consolidado por trimestre " + anio} etiqueta="Trimestre" lista={r.porTrim} total={r.totalTrim} />
          </div>
          <TablaCruce titulo={"Causales por trimestre " + anio} etiqueta="Causales" c={r.causalesTrim} lista={buscar(r.causalesTrim.filas)} />
        </>
      )}
    </section>
  );
}
