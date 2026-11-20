import { useState } from "react";
import { useStore } from "../store.jsx";
import { auxApi, adminApi } from "../lib/supabase.js";
import InstallButton from "./InstallButton.jsx";

/* Ingreso: el auxiliar entra con usuario + PIN de 4 dígitos; el administrador con su contraseña.
   Los datos los valida Supabase (hace falta conexión para ingresar). */
export default function Login({ onAdmin }) {
  const { state, actions } = useStore();
  const [modo, setModo] = useState("aux");
  const [usuario, setUsuario] = useState("");
  const [pin, setPin] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [cargando, setCargando] = useState(false);
  const ruta = state.route;
  const rutaEnCurso = state.facturas.length > 0;

  const entrarAux = async (e) => {
    e.preventDefault();
    if (!usuario.trim() || pin.length !== 4) { setError("Escribe tu usuario y tu PIN de 4 dígitos"); return; }
    if (!navigator.onLine) { setError("Sin conexión: para ingresar necesitas internet"); return; }
    const otro = ruta.auxUsuario && ruta.auxUsuario !== usuario.trim().toLowerCase() && rutaEnCurso;
    if (otro && !confirm("En este equipo hay una ruta en curso de otro auxiliar. Si entras, se reemplaza por la tuya (la del otro auxiliar ya quedó sincronizada si tenía internet). ¿Continuar?")) return;
    setCargando(true); setError("");
    try {
      const a = await auxApi.login(usuario.trim(), pin);
      actions.login({ nombre: a.nombre, usuario: a.usuario, pin });
    } catch (err) {
      setError(err.message || "No se pudo ingresar");
    } finally { setCargando(false); }
  };

  const entrarAdmin = async (e) => {
    e.preventDefault();
    if (!pass) { setError("Escribe la contraseña"); return; }
    if (!navigator.onLine) { setError("Sin conexión: para ingresar necesitas internet"); return; }
    setCargando(true); setError("");
    try {
      const ok = await adminApi.login(pass);
      if (!ok) { setError("Contraseña incorrecta"); return; }
      onAdmin(pass);
    } catch (err) {
      setError(err.message || "No se pudo ingresar");
    } finally { setCargando(false); }
  };

  const cambiar = (m) => { setModo(m); setError(""); };

  return (
    <div className="login-wrap">
      <div className="login-hero">
        <img src="./logo.png" alt="LICONSUMAR" className="login-logo" />
        <h1>Rutas de Entrega</h1>
        <p className="login-sub">LICONSUMAR Del Magdalena</p>
      </div>
      <div className="login-card">
        <div className="login-tabs">
          <button type="button" className={modo === "aux" ? "active" : ""} onClick={() => cambiar("aux")}>🚚 Auxiliar</button>
          <button type="button" className={modo === "admin" ? "active" : ""} onClick={() => cambiar("admin")}>🛡 Administrador</button>
        </div>

        {modo === "aux" ? (
          <form onSubmit={entrarAux}>
            <label htmlFor="auxUsuario">Usuario</label>
            <input id="auxUsuario" className="inp login-inp" autoFocus autoComplete="username" autoCapitalize="none"
              value={usuario} onChange={(e) => { setUsuario(e.target.value); setError(""); }} placeholder="Tu usuario" />
            <label htmlFor="auxPin" style={{ marginTop: 10 }}>PIN (4 dígitos)</label>
            <input id="auxPin" className="inp login-inp login-pin" type="password" inputMode="numeric" maxLength={4} autoComplete="current-password"
              value={pin} onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 4)); setError(""); }} placeholder="••••" />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn btn-primary login-btn" disabled={cargando}>{cargando ? "Ingresando..." : "🚚 Ver mi ruta"}</button>
          </form>
        ) : (
          <form onSubmit={entrarAdmin}>
            <label htmlFor="admPass">Contraseña de administrador</label>
            <input id="admPass" className="inp login-inp" type="password" autoFocus autoComplete="current-password"
              value={pass} onChange={(e) => { setPass(e.target.value); setError(""); }} placeholder="Contraseña" />
            {error && <div className="login-error">{error}</div>}
            <button type="submit" className="btn btn-primary login-btn" disabled={cargando}>{cargando ? "Verificando..." : "🛡 Entrar al panel"}</button>
          </form>
        )}

        {rutaEnCurso && modo === "aux" && (
          <div className="login-route">
            Ruta en curso en este equipo: planilla <b>{ruta.planilla || "-"}</b> · {ruta.placa || "sin vehículo"} · {state.facturas.length} factura(s)
            {ruta.auxiliar && <> · de <b>{ruta.auxiliar}</b></>}
          </div>
        )}

        <InstallButton className="btn btn-outline login-install" />
      </div>
    </div>
  );
}
