import { useMemo, useRef, useState } from "react";
import { useStore } from "../store.jsx";
import { useClientesGps, gpsDeCliente, normNombre } from "../lib/gpsClientes.js";
import MapaClientes from "../admin/MapaClientes.jsx";
import MapaBox from "../admin/MapaBox.jsx";

const COLORES = [
  ["Pendiente", "#2f6bff"],
  ["OK", "#22c55e"],
  ["Dev Parcial", "#f59e0b"],
  ["Dev Total", "#ef4444"],
  ["Reenvío", "#8b5cf6"]
];
const COLOR = Object.fromEntries(COLORES);

/* Pestaña "Mapas" del auxiliar: todos los clientes con GPS y los clientes de su ruta actual */
export default function Mapas() {
  const { state } = useStore();
  const gps = useClientesGps(state.session);
  const [buscar, setBuscar] = useState("");
  const [foco, setFoco] = useState({ todos: null, ruta: null });
  const refTodos = useRef(null);
  const refRuta = useRef(null);

  // facturas de la ruta agrupadas por cliente
  const grupos = useMemo(() => {
    const m = new Map();
    state.facturas.forEach((f) => {
      const k = normNombre(f.cliente);
      if (!k) return;
      if (!m.has(k)) m.set(k, { nombre: f.cliente.trim(), facturas: [] });
      m.get(k).facturas.push(f);
    });
    return [...m.values()];
  }, [state.facturas]);

  const ruta = useMemo(() => grupos.map((g) => {
    const f0 = g.facturas[0];
    const p = gpsDeCliente([g.nombre, f0.razonSocial], g.facturas, gps);
    const pend = g.facturas.filter((f) => !f.confirmada).length;
    const estado = pend ? "Pendiente" : g.facturas[g.facturas.length - 1].estado || "OK";
    return {
      clave: normNombre(g.nombre),
      nombre: g.nombre + (f0.razonSocial && normNombre(f0.razonSocial) !== normNombre(g.nombre) ? " · " + f0.razonSocial : ""),
      negocio: g.nombre, razonSocial: f0.razonSocial || "",
      direccion: [f0.direccion, f0.barrio].filter(Boolean).join(", "),
      detalle: "Facturas: " + g.facturas.map((f) => "#" + f.numero).join(", ") + " · " + estado +
        (p && p.aprox ? " · ⚠ Ubicación aproximada: encontrada como \"" + p.ref + "\"" : ""),
      aprox: !!(p && p.aprox),
      color: COLOR[estado] || COLOR.OK,
      lat: p ? p.lat : null, lng: p ? p.lng : null
    };
  }), [grupos, gps.porNombre, gps.porNucleo]); // eslint-disable-line react-hooks/exhaustive-deps
  const rutaGps = ruta.filter((p) => p.lat != null);
  const sinGps = ruta.filter((p) => p.lat == null);
  const nAprox = rutaGps.filter((p) => p.aprox).length;

  // todos los clientes del servidor + los de esta ruta que aún no se han subido
  const todos = useMemo(() => {
    const vistos = new Set(gps.lista.map((p) => p.nombre_norm || normNombre(p.nombre)));
    const extra = rutaGps.filter((p) => !p.aprox && !vistos.has(p.clave))
      .map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng, direccion: p.direccion }));
    return [...gps.lista, ...extra];
  }, [gps.lista, rutaGps]);

  // búsqueda por nombre del negocio o razón social (en la ruta y en todos los clientes)
  const resultados = useMemo(() => {
    const t = normNombre(buscar);
    if (t.length < 2) return [];
    const r = ruta.filter((p) => normNombre(p.negocio).includes(t) || normNombre(p.razonSocial).includes(t))
      .map((p) => ({ k: "r" + p.clave, mapa: "ruta", titulo: p.negocio, sub: p.razonSocial, p }));
    const enRuta = new Set(r.map((x) => x.p.clave));
    const o = todos.filter((p) => normNombre(p.nombre).includes(t) && !enRuta.has(normNombre(p.nombre)))
      .map((p, i) => ({ k: "t" + i + p.nombre, mapa: "todos", titulo: p.nombre, sub: p.direccion || "", p }));
    return [...r, ...o].slice(0, 30);
  }, [buscar, ruta, todos]);

  const ir = (x) => {
    if (x.p.lat == null) return;
    setFoco((f) => ({ ...f, [x.mapa]: { lat: x.p.lat, lng: x.p.lng, t: Date.now() } }));
    const el = x.mapa === "ruta" ? refRuta.current : refTodos.current;
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  return (
    <>
      <div className="panel mapas-buscar">
        <input className="inp" type="search" value={buscar} onChange={(e) => setBuscar(e.target.value)}
          placeholder="🔍 Buscar cliente por nombre del negocio o razón social..." />
        {normNombre(buscar).length >= 2 && (
          <div className="mapas-res">
            {!resultados.length ? <div className="muted">Ningún cliente coincide con "{buscar}".</div> : resultados.map((x) => (
              <button key={x.k} type="button" className="mapas-res-item" disabled={x.p.lat == null} onClick={() => ir(x)}>
                <span className={"mapas-tag " + x.mapa}>{x.mapa === "ruta" ? "Mi ruta" : "Todos"}</span>
                <span className="mapas-res-txt"><b>{x.titulo}</b>{x.sub && <small>{x.sub}</small>}</span>
                <span className="mapas-res-ir">{x.p.lat == null ? "Sin GPS" : x.p.aprox ? "📍 Ver (aprox.)" : "📍 Ver"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="panel" ref={refTodos}>
        <div className="mapas-head">
          <h2>🌎 Todos los clientes con ubicación GPS</h2>
          <button className="btn btn-xs btn-outline" disabled={gps.cargando || !navigator.onLine} onClick={gps.recargar}>
            {gps.cargando ? "Actualizando..." : "↻ Actualizar"}
          </button>
        </div>
        <p className="muted" style={{ margin: "0 0 10px" }}>
          {todos.length} cliente(s) con GPS registrados por todos los auxiliares.
          {!navigator.onLine && " Sin conexión: se muestran los últimos datos guardados en el equipo."}
          {gps.error && " No se pudo actualizar: " + gps.error}
        </p>
        {todos.length
          ? <MapaBox height={360}>{(h) => <MapaClientes puntos={todos} height={h} foco={foco.todos} />}</MapaBox>
          : <div className="empty">{gps.cargando ? "Cargando ubicaciones..." : "Aún no hay clientes con ubicación GPS."}</div>}
      </div>

      <div className="panel" ref={refRuta}>
        <h2>🚚 Clientes de mi ruta {state.route.placa ? "· " + state.route.placa : ""}</h2>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {ruta.length ? `${rutaGps.length} de ${ruta.length} cliente(s) de la ruta tienen ubicación GPS.` : "No tienes una ruta cargada."}
          {nAprox > 0 && ` ${nAprox} son aproximadas (el nombre en el mapa es parecido, no igual: toca el punto para verlo).`}
        </p>
        <div className="mapas-legend">
          {COLORES.map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}
        </div>
        {rutaGps.length
          ? <MapaBox height={360}>{(h) => <MapaClientes puntos={rutaGps} height={h} foco={foco.ruta} />}</MapaBox>
          : ruta.length ? <div className="empty">Ningún cliente de la ruta tiene ubicación GPS todavía.</div> : null}
        {sinGps.length > 0 && (
          <div className="mapas-sin">
            <b>Sin ubicación ({sinGps.length}):</b> {sinGps.map((p) => p.negocio).join(" · ")}
            <div className="muted">Se guarda al confirmar una entrega con GPS.</div>
          </div>
        )}
      </div>
    </>
  );
}
