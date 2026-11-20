import { useState } from "react";
import { adminApi } from "../lib/supabase.js";

export default function AdminConfig({ pass, toast, onLogout }) {
  const [nueva, setNueva] = useState("");
  const [repite, setRepite] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cambiar = async (e) => {
    e.preventDefault();
    if (nueva.length < 4) { toast("La contraseña debe tener mínimo 4 caracteres", "error"); return; }
    if (nueva !== repite) { toast("Las contraseñas no coinciden", "error"); return; }
    setGuardando(true);
    try {
      await adminApi.cambiarPass(pass, nueva);
      toast("Contraseña actualizada. Vuelve a ingresar con la nueva.", "success");
      setTimeout(onLogout, 900);
    } catch (err) { toast(err.message, "error"); }
    finally { setGuardando(false); }
  };

  return (
    <div className="adm-grid g-2">
      <section className="card">
        <div className="card-h"><h3>🔑 Cambiar contraseña del administrador</h3></div>
        <form onSubmit={cambiar}>
          <div className="field-row"><label>Nueva contraseña</label>
            <input className="inp" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)} /></div>
          <div className="field-row"><label>Repite la nueva contraseña</label>
            <input className="inp" type="password" autoComplete="new-password" value={repite} onChange={(e) => setRepite(e.target.value)} /></div>
          <div className="row-actions"><button className="btn btn-primary" disabled={guardando}>{guardando ? "Guardando..." : "Guardar contraseña"}</button></div>
        </form>
      </section>
      <section className="card">
        <div className="card-h"><h3>ℹ️ Información</h3></div>
        <ul className="info-list">
          <li>Los auxiliares ingresan con <b>usuario + PIN de 4 dígitos</b> que tú creas en la sección Auxiliares.</li>
          <li>Para que un auxiliar vea su ruta, su nombre debe ser igual a <b>"Nombre conductor"</b> del archivo.</li>
          <li>Las entregas confirmadas se sincronizan solas; al cerrar la ruta se guardan firmas y comprobantes.</li>
        </ul>
        <button className="btn btn-danger" onClick={onLogout}>⏻ Cerrar sesión</button>
      </section>
    </div>
  );
}
