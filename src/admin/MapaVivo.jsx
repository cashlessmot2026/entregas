import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

/* Mapa con los camiones que están compartiendo su ubicación */
export default function MapaVivo({ camiones, foco, height = 360 }) {
  const el = useRef(null);
  const map = useRef(null);
  const layer = useRef(null);
  const ajustado = useRef(false);

  useEffect(() => {
    map.current = L.map(el.current).setView([11.2408, -74.199], 12);
    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map.current);
    layer.current = L.layerGroup().addTo(map.current);
    // al ampliar a pantalla completa el contenedor cambia de tamaño: se reajusta el mapa
    const ro = new ResizeObserver(() => map.current && map.current.invalidateSize());
    ro.observe(el.current);
    return () => { ro.disconnect(); map.current.remove(); map.current = null; };
  }, []);

  useEffect(() => {
    if (!layer.current) return;
    layer.current.clearLayers();
    camiones.forEach((c) => {
      const viejo = c.segundos > 120;
      const icon = L.divIcon({
        className: "truck-pin",
        html: `<div class="truck-bubble${viejo ? " old" : ""}"><span>🚚</span><b>${esc(c.placa || "")}</b></div>`,
        iconSize: [92, 34], iconAnchor: [46, 17]
      });
      L.marker([c.lat, c.lng], { icon })
        .bindPopup(`<b>${esc(c.placa)}</b><br>${esc(c.auxiliar)}<br>Planilla ${esc(c.planilla)}<br>${c.velocidad != null ? c.velocidad + " km/h · " : ""}hace ${c.segundos < 60 ? c.segundos + " s" : Math.round(c.segundos / 60) + " min"}`)
        .addTo(layer.current);
    });
    if (camiones.length && !ajustado.current) {
      map.current.fitBounds(L.latLngBounds(camiones.map((c) => [c.lat, c.lng])).pad(0.3), { maxZoom: 15 });
      ajustado.current = true;
    }
  }, [camiones]);

  useEffect(() => {
    if (foco && map.current) map.current.setView([foco.lat, foco.lng], 16);
  }, [foco]);

  return <div ref={el} className="mapa-gps" style={{ height }} />;
}
