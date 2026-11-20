import { useEffect, useState } from "react";

/* Contenedor de mapas con botón "Pantalla completa" (se cierra con el botón o con Esc).
   Uso: <MapaBox>{(alto) => <MapaGps height={alto} ... />}</MapaBox> */
export default function MapaBox({ children, height = 340 }) {
  const [full, setFull] = useState(false);

  useEffect(() => {
    if (!full) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setFull(false); };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [full]);

  return (
    <div className={"mapa-box" + (full ? " full" : "")}>
      <button type="button" className="mapa-expand" onClick={() => setFull((v) => !v)}>
        {full ? "✕ Salir de pantalla completa" : "⛶ Pantalla completa"}
      </button>
      {children(full ? "100%" : height)}
    </div>
  );
}
