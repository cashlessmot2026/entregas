import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const COLOR = { OK: "#22c55e", "Dev Parcial": "#f59e0b", "Dev Total": "#ef4444", "Reenvío": "#8b5cf6" };

/* Mapa con las entregas que guardaron coordenadas GPS (OpenStreetMap) */
export default function MapaGps({ facturas, height = 330 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);

  useEffect(() => {
    map.current = L.map(el.current, { zoomControl: true }).setView([11.2408, -74.199], 12); // Santa Marta
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    return () => { map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    const pts = facturas.filter((f) => f.lat != null && f.lng != null);
    pts.forEach((f) => {
      L.circleMarker([f.lat, f.lng], { radius: 9, color: "#fff", weight: 3, fillColor: COLOR[f.estado] || "#2f6bff", fillOpacity: 1 })
        .bindPopup(`<b>${(f.cliente || "").replace(/</g, "&lt;")}</b><br>Factura ${f.numero}<br>${f.estado}<br>${f.ruta ? (f.ruta.auxiliar || "") + " · " + (f.ruta.placa || "") : ""}`)
        .addTo(layer.current);
    });
    if (pts.length) map.current.fitBounds(L.latLngBounds(pts.map((p) => [p.lat, p.lng])).pad(0.2), { maxZoom: 16 });
  }, [facturas]);

  return <div ref={el} className="mapa-gps" style={{ height }} />;
}
