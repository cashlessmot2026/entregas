import { useEffect, useRef, useState } from "react";
import { SECTIONS } from "../lib/constants.js";
import InstallButton from "./InstallButton.jsx";

export default function Sidebar({ current, onNavigate, open, onClose, auxiliar, onLogout, online, pendientes }) {
  const [hideScroll, setHideScroll] = useState(false);
  const last = useRef(0);

  // se oculta al bajar y reaparece al subir o al detenerse (desktop)
  useEffect(() => {
    let ticking = false;
    let timer = null;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        if (y > last.current && y > 60) setHideScroll(true);
        else if (y < last.current) setHideScroll(false);
        last.current = y;
        ticking = false;
        clearTimeout(timer);
        timer = setTimeout(() => setHideScroll(false), 700);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => { window.removeEventListener("scroll", onScroll); clearTimeout(timer); };
  }, []);

  return (
    <>
      <div className={"sidebar-overlay" + (open ? " show" : "")} onClick={onClose} />
      <nav className={"sidebar" + (open ? " open" : "") + (hideScroll && !open ? " hide-scroll" : "")}>
        <div className="brand">
          <img src="./logo.png" alt="LICONSUMAR" />
          <div className="name">LICONSUMAR Del Magdalena<br />Rutas de Entrega</div>
        </div>
        <div className="aux-box">
          <div className="aux-lbl">Auxiliar</div>
          <div className="aux-name">👤 {auxiliar}</div>
          <button className="btn btn-xs aux-out" onClick={onLogout}>Cambiar / salir</button>
        </div>
        {SECTIONS.map((s) => (
          <a key={s.id} className={"navlink" + (current === s.id ? " active" : "")} onClick={() => onNavigate(s.id)}>
            <span className="ic">{s.icon}</span> {s.label}
          </a>
        ))}
        <div className="sidebar-foot">
          <div className={"net " + (online ? "on" : "off")}>{online ? "● En línea" : "● Sin conexión (modo offline)"}</div>
          {pendientes > 0 && <div className="net off">{pendientes} ruta(s) pendiente(s) por subir</div>}
          <InstallButton className="btn btn-xs sidebar-install" />
          <div>Ruta local + Supabase · v2.0</div>
        </div>
      </nav>
    </>
  );
}
