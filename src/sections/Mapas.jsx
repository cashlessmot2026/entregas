import { useMemo } from "react";
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
    const p = gpsDeCliente(g.nombre, g.facturas, gps.porNombre);
    const pend = g.facturas.filter((f) => !f.confirmada).length;
    const estado = pend ? "Pendiente" : g.facturas[g.facturas.length - 1].estado || "OK";
    const f0 = g.facturas[0];
    return {
      clave: normNombre(g.nombre),
      nombre: g.nombre + (f0.razonSocial && normNombre(f0.razonSocial) !== normNombre(g.nombre) ? " · " + f0.razonSocial : ""),
      direccion: [f0.direccion, f0.barrio].filter(Boolean).join(", "),
      detalle: "Facturas: " + g.facturas.map((f) => "#" + f.numero).join(", ") + " · " + estado,
      color: COLOR[estado] || COLOR.OK,
      lat: p ? p.lat : null, lng: p ? p.lng : null
    };
  }), [grupos, gps.porNombre]);
  const rutaGps = ruta.filter((p) => p.lat != null);
  const sinGps = ruta.filter((p) => p.lat == null);

  // todos los clientes del servidor + los de esta ruta que aún no se han subido
  const todos = useMemo(() => {
    const vistos = new Set(gps.lista.map((p) => p.nombre_norm || normNombre(p.nombre)));
    const extra = rutaGps.filter((p) => !vistos.has(p.clave))
      .map((p) => ({ nombre: p.nombre, lat: p.lat, lng: p.lng, direccion: p.direccion }));
    return [...gps.lista, ...extra];
  }, [gps.lista, rutaGps]);

  return (
    <>
      <div className="panel">
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
          ? <MapaBox height={360}>{(h) => <MapaClientes puntos={todos} height={h} />}</MapaBox>
          : <div className="empty">{gps.cargando ? "Cargando ubicaciones..." : "Aún no hay clientes con ubicación GPS."}</div>}
      </div>

      <div className="panel">
        <h2>🚚 Clientes de mi ruta {state.route.placa ? "· " + state.route.placa : ""}</h2>
        <p className="muted" style={{ margin: "0 0 8px" }}>
          {ruta.length ? `${rutaGps.length} de ${ruta.length} cliente(s) de la ruta tienen ubicación GPS.` : "No tienes una ruta cargada."}
        </p>
        <div className="mapas-legend">
          {COLORES.map(([k, c]) => <span key={k}><i style={{ background: c }} />{k}</span>)}
        </div>
        {rutaGps.length
          ? <MapaBox height={360}>{(h) => <MapaClientes puntos={rutaGps} height={h} />}</MapaBox>
          : ruta.length ? <div className="empty">Ningún cliente de la ruta tiene ubicación GPS todavía.</div> : null}
        {sinGps.length > 0 && (
          <div className="mapas-sin">
            <b>Sin ubicación ({sinGps.length}):</b> {sinGps.map((p) => p.nombre).join(" · ")}
            <div className="muted">Se guarda al confirmar una entrega con GPS.</div>
          </div>
        )}
      </div>
    </>
  );
}
