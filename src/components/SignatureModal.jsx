import { useEffect, useRef } from "react";
import { useToast } from "../store.jsx";

/* Firma digital del cliente (signature_pad se carga solo al abrir) */
export default function SignatureModal({ open, onClose, onSave }) {
  const canvasRef = useRef(null);
  const padRef = useRef(null);
  const toast = useToast();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    import("signature_pad").then(({ default: SignaturePad }) => {
      const canvas = canvasRef.current;
      if (cancelled || !canvas) return;
      const ratio = Math.max(window.devicePixelRatio || 1, 1);
      canvas.width = canvas.offsetWidth * ratio;
      canvas.height = canvas.offsetHeight * ratio;
      canvas.getContext("2d").scale(ratio, ratio);
      padRef.current = new SignaturePad(canvas, { backgroundColor: "rgb(255,255,255)" });
    });
    return () => { cancelled = true; if (padRef.current) padRef.current.off(); padRef.current = null; };
  }, [open]);

  if (!open) return null;

  const save = () => {
    const pad = padRef.current;
    if (!pad || pad.isEmpty()) { toast("Realiza la firma antes de guardar", "error"); return; }
    onSave(pad.toDataURL("image/png"));
    onClose();
    toast("Firma guardada", "success");
  };

  return (
    <div className="modal-overlay open">
      <div className="modal-box">
        <h3>✍ Firma digital del cliente</h3>
        <canvas id="sigCanvas" ref={canvasRef} />
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={() => padRef.current && padRef.current.clear()}>Limpiar</button>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={save}>Guardar firma</button>
        </div>
      </div>
    </div>
  );
}
