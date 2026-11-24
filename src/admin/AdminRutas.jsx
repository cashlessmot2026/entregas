import { useEffect, useMemo, useState } from "react";
import { adminApi } from "../lib/supabase.js";
import { parsePlanillaExcel, descargarPlantilla } from "../lib/excel.js";
import { normText } from "../lib/utils.js";
import { vehiculos } from "./analytics.js";
import { Progress } from "./charts.jsx";

const ESTADO = { asignada: ["Asignada", "b-blue"], en_curso: ["En curso", "b-orange"], cerrada: ["Cerrada", "b-green"] };
const nn = (s) => normText(s).replace(/\s+/g, " ");

export default function AdminRutas({ pass, data, cargar, toast }) {
  const [auxs, setAuxs] = useState([]);
  const [grupos, setGrupos] = useState(null);
  const [archivo, setArchivo] = useState("");
  const [subiendo, setSubiendo] = useState(false);
  const [resultado, setResultado] = useState(null);
  const [q, setQ] = useState("");

  useEffect(() => { adminApi.listarAuxiliares(pass).then(setAuxs).catch(() => {}); }, [pass, resultado]);
  const auxPorNombre = useMemo(() => new Map(auxs.map((a) => [nn(a.nombre), a])), [auxs]);

  const onFile = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    try {
      const g = await parsePlanillaExcel(file);
      setGrupos(g); setArchivo(file.name); setResultado(null);
    } catch (err) { toast(err.message, "error"); }
  };

  const publicar = async () => {
    setSubiendo(true);
    try {
      const rutas = grupos.map((g) => ({
        fecha: g.route.fecha || null, placa: g.route.placa, conductor: g.route.conductor, planilla: g.route.planilla,
        facturas: g.facturas.map((f) => ({ numero: f.numero, cliente: f.cliente, sucursal: f.sucursal, vendedor: f.vendedor, fecha: f.fecha || null,
          razon_social: f.razonSocial || "", cantidad_inv: f.cantidadInv || null, valor_neto: f.valorNeto || null }))
      }));
      const res = await adminApi.cargarRutas(pass, rutas);
      setResultado(res); setGrupos(null);
      toast(`Archivo publicado: ${res.rutas_nuevas} ruta(s) nuevas, ${res.facturas_nuevas} facturas`, "success");
      cargar();
    } catch (err) { toast("No se pudo publicar: " + err.message, "error"); }
    finally { setSubiendo(false); }
  };

  const eliminar = async (r) => {
    if (!confirm(`¿Eliminar la ruta ${r.planilla || r.placa} y todas sus facturas y devoluciones?`)) return;
    try { await adminApi.eliminarRuta(pass, r.id); toast("Ruta eliminada", "success"); cargar(); }
    catch (err) { toast(err.message, "error"); }
  };

  const rutas = useMemo(() => {
    const t = normText(q);
    return vehiculos(data)
      .filter((r) => !t || [r.placa, r.auxiliar, r.conductor, r.planilla].some((v) => normText(v).includes(t)))
      .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  }, [data, q]);

  const totalFact = grupos ? grupos.reduce((s, g) => s + g.facturas.length, 0) : 0;
  const sinAux = grupos ? grupos.filter((g) => !auxPorNombre.has(nn(g.route.conductor))) : [];

  return (
    <>
      <section className="card">
        <div className="card-h"><h3>📥 Cargar archivo de rutas del día</h3>
          <button className="btn btn-xs btn-outline" onClick={descargarPlantilla}>⬇ Plantilla de ejemplo</button></div>
        <p className="hint">Sube el reporte "RUTA - aaaa-mm-dd.xls". Se leen: Fecha planilla, Vehículo, Nombre conductor, Nro documento, Desc. sucursal despacho, Razón social cliente despacho, Cantidad inv., Valor neto, Nombre vendedor y Nro documento planilla (la cantidad y el valor neto se suman por factura).
          Cada auxiliar verá su ruta automáticamente cuando su <b>nombre</b> coincida con "Nombre conductor".</p>
        <label className="dropzone">
          <input type="file" accept=".xls,.xlsx,.csv" onChange={onFile} hidden />
          <span>📄</span><b>{archivo || "Elegir archivo Excel (.xls / .xlsx / .csv)"}</b><small>Toca o arrastra el archivo aquí</small>
        </label>

        {grupos && (
          <div className="preview">
            <div className="card-h"><h3>Vista previa: {grupos.length} planilla(s) · {totalFact} facturas</h3></div>
            <div className="tbl-wrap"><table className="tbl">
              <thead><tr><th>Fecha</th><th>Vehículo</th><th>Planilla</th><th>Conductor / Auxiliar</th><th>Facturas</th><th>Auxiliar</th></tr></thead>
              <tbody>{grupos.map((g) => {
                const a = auxPorNombre.get(nn(g.route.conductor));
                return (
                  <tr key={g.key}>
                    <td>{g.route.fecha}</td><td><b>{g.route.placa}</b></td><td>{g.route.planilla}</td><td>{g.route.conductor}</td>
                    <td>{g.facturas.length}</td>
                    <td>{a ? <span className="bdg b-green">✔ {a.usuario}</span> : <span className="bdg b-blue">Se creará (sin PIN)</span>}</td>
                  </tr>
                );
              })}</tbody>
            </table></div>
            {sinAux.length > 0 && <p className="hint">ℹ {sinAux.length} conductor(es) no existen todavía: se crearán automáticamente como auxiliares con un usuario sugerido y <b>sin PIN</b>. Luego solo asígnales el PIN en <b>Auxiliares → Editar</b>.</p>}
            <div className="row-actions">
              <button className="btn btn-outline" onClick={() => setGrupos(null)}>Cancelar</button>
              <button className="btn btn-primary" disabled={subiendo} onClick={publicar}>{subiendo ? "Publicando..." : "🚀 Publicar rutas a los auxiliares"}</button>
            </div>
          </div>
        )}

        {resultado && (
          <div className="result">
            <b>✔ Archivo publicado</b>
            <span>{resultado.rutas_nuevas} ruta(s) nuevas · {resultado.rutas_actualizadas} actualizadas · {resultado.facturas_nuevas} facturas nuevas</span>
            {resultado.omitidas_cerradas.length > 0 && <span>Omitidas por estar cerradas: {resultado.omitidas_cerradas.join(", ")}</span>}
            {resultado.auxiliares_creados && resultado.auxiliares_creados.length > 0 && (
              <span className="warn">👤 {resultado.auxiliares_creados.length} auxiliar(es) creados automáticamente — falta asignarles el PIN en Auxiliares: {resultado.auxiliares_creados.map((a) => a.nombre + " (" + a.usuario + ")").join(" · ")}</span>
            )}
          </div>
        )}
      </section>

      <section className="card">
        <div className="card-h"><h3>Rutas cargadas ({rutas.length})</h3>
          <input className="inp sm adm-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar placa, auxiliar, planilla..." /></div>
        <div className="tbl-wrap"><table className="tbl">
          <thead><tr><th>Fecha</th><th>Vehículo</th><th>Planilla</th><th>Auxiliar</th><th>Estado</th><th style={{ minWidth: 150 }}>Avance</th><th></th></tr></thead>
          <tbody>
            {rutas.map((r) => {
              const e = ESTADO[r.estado] || ESTADO.asignada;
              return (
                <tr key={r.id}>
                  <td>{r.fecha}</td><td><b>{r.placa || "-"}</b></td><td>{r.planilla || "-"}</td>
                  <td>{r.auxiliar_id ? r.auxiliar : <span className="bdg b-orange">{r.conductor} (sin usuario)</span>}</td>
                  <td><span className={"bdg " + e[1]}>{e[0]}</span></td>
                  <td><Progress pct={r.pct} color={r.pct >= 100 ? "#22c55e" : "#2f6bff"} /><small>{r.hechas}/{r.total} facturas</small></td>
                  <td><button className="btn btn-xs btn-danger" onClick={() => eliminar(r)}>🗑</button></td>
                </tr>
              );
            })}
            {!rutas.length && <tr><td colSpan={7} className="empty">No hay rutas en este período</td></tr>}
          </tbody>
        </table></div>
      </section>
    </>
  );
}
