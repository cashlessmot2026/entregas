import { useEffect, useRef, useState } from "react";
import { useToast } from "../store.jsx";

/* Escáner de código de barras (html5-qrcode se carga solo al abrir) */
export default function ScannerModal({ open, onClose, onCode }) {
  const scannerRef = useRef(null);
  const [manual, setManual] = useState("");
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    let stopped = false;
    const done = (code) => {
      if (stopped) return;
      stopped = true;
      onCode(code);
      onClose();
      toast("Código escaneado: " + code, "success");
    };
    import("html5-qrcode").then(({ Html5Qrcode }) => {
      if (stopped) return;
      const sc = new Html5Qrcode("scannerReader");
      scannerRef.current = sc;
      const cfg = { fps: 10, qrbox: 220 };
      sc.start({ facingMode: "environment" }, cfg, done, () => {}).catch(() => {
        // si el navegador no soporta facingMode, usa la primera cámara disponible
        Html5Qrcode.getCameras().then((cams) => {
          if (!cams || !cams.length) { toast("No se detectó cámara, ingresa el código manualmente", "error"); return; }
          sc.start(cams[0].id, cfg, done, () => {}).catch(() => toast("No se pudo iniciar la cámara", "error"));
        }).catch(() => toast("Sin acceso a cámara. Ingresa el código manualmente.", "error"));
      });
    });
    return () => {
      stopped = true;
      const sc = scannerRef.current;
      scannerRef.current = null;
      if (sc) sc.stop().catch(() => {}).then(() => { try { sc.clear(); } catch { /* ya limpio */ } });
    };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!open) return null;

  return (
    <div className="modal-overlay open">
      <div className="modal-box">
        <h3>📷 Escanear código de barras</h3>
        <div id="scannerReader" />
        <div style={{ marginTop: 12 }}>
          <label>O ingresa el código manualmente</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input className="inp" value={manual} onChange={(e) => setManual(e.target.value)} placeholder="Código..." />
            <button className="btn btn-primary" onClick={() => { if (manual.trim()) { onCode(manual.trim()); setManual(""); onClose(); } }}>Usar</button>
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Cerrar</button>
        </div>
      </div>
    </div>
  );
}
