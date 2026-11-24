import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Mapa con la ubicación GPS de los clientes registrados.
   puntos = [{ nombre, lat, lng, direccion, color?, detalle? (texto extra del globo) }] */
export default function MapaClientes({ puntos, height = 340 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current).setView([11.2408, -74.199], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    const ro = new ResizeObserver(() => map.current && map.current.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const pts = puntos.filter((p) => p.lat != null && p.lng != null);
    pts.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2, fillColor: p.color || "#2f6bff", fillOpacity: 0.95 })
        .bindPopup(`<b>${esc(p.nombre)}</b>${p.direccion ? "<br>" + esc(p.direccion) : ""}${p.detalle ? "<br>" + esc(p.detalle) : ""}<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">Cómo llegar</a>`)
        .addTo(layer.current);
    });
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.15), { maxZoom: 16 });
  }, [puntos]);

  return <div ref={el} className="mapa-gps" style={{ height }} />;
}
