import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Mapa con la ubicación GPS de los clientes registrados.
   puntos = [{ nombre, lat, lng, direccion, color?, detalle? (texto extra del globo) }]
   foco = { lat, lng, t } (opcional): centra el mapa en ese punto y abre su globo */
export default function MapaClientes({ puntos, height = 340, foco }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const marcas = useRef([]);

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
    marcas.current = [];
    const pts = puntos.filter((p) => p.lat != null && p.lng != null);
    pts.forEach((p) => {
      const mk = L.circleMarker([p.lat, p.lng], { radius: 7, color: "#fff", weight: 2, fillColor: p.color || "#2f6bff", fillOpacity: 0.95 })
        .bindPopup(`<b>${esc(p.nombre)}</b>${p.direccion ? "<br>" + esc(p.direccion) : ""}${p.detalle ? "<br>" + esc(p.detalle) : ""}<br><a target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}">Cómo llegar</a>`)
        .addTo(layer.current);
      marcas.current.push(mk);
    });
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.15), { maxZoom: 16 });
  }, [puntos]);

  useEffect(() => {
    if (!foco || !map.current) return;
    map.current.setView([foco.lat, foco.lng], 17);
    const mk = marcas.current.find((m) => { const ll = m.getLatLng(); return Math.abs(ll.lat - foco.lat) < 1e-7 && Math.abs(ll.lng - foco.lng) < 1e-7; });
    if (mk) { mk.bringToFront(); mk.openPopup(); }
  }, [foco]);

  return <div ref={el} className="mapa-gps" style={{ height }} />;
}
