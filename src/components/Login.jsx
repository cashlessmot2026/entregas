import { useState } from "react";
import { useStore } from "../store.jsx";
import InstallButton from "./InstallButton.jsx";

/* Pantalla de ingreso del auxiliar: entra con su nombre y empieza la ruta */
export default function Login() {
  const { state, actions } = useStore();
  const [nombre, setNombre] = useState("");
  const [error, setError] = useState("");
  const ruta = state.route;
  const rutaEnCurso = state.facturas.length > 0;

  const entrar = (n) => {
    const v = (n ?? nombre).trim();
    if (v.length < 3) { setError("Escribe tu nombre completo (mínimo 3 letras)"); return; }
    actions.login(v);
  };

  return (
    <div className="login-wrap">
      <div className="login-card">
        <img src="./logo.png" alt="LICONSUMAR" className="login-logo" />
        <h1>Rutas de Entrega</h1>
        <p className="login-sub">LICONSUMAR Del Magdalena</p>

        <form onSubmit={(e) => { e.preventDefault(); entrar(); }}>
          <label htmlFor="auxNombre">Nombre del auxiliar</label>
          <input
            id="auxNombre"
            className="inp login-inp"
            autoFocus
            autoComplete="name"
            list="auxiliaresList"
            value={nombre}
            onChange={(e) => { setNombre(e.target.value); setError(""); }}
            placeholder="Ej: Victor Lopez"
          />
          <datalist id="auxiliaresList">
            {state.auxiliares.map((a) => <option key={a} value={a} />)}
          </datalist>
          {error && <div className="login-error">{error}</div>}
          <button type="submit" className="btn btn-primary login-btn">🚚 Empezar ruta</button>
        </form>

        {state.auxiliares.length > 0 && (
          <div className="login-recent">
            <label>Ingresos recientes</label>
            <div className="chip-group">
              {state.auxiliares.slice(-6).reverse().map((a) => (
                <span key={a} className="chip" onClick={() => entrar(a)}>{a}</span>
              ))}
            </div>
          </div>
        )}

        {rutaEnCurso && (
          <div className="login-route">
            Hay una ruta en curso: planilla <b>{ruta.planilla || "-"}</b> · {ruta.placa || "sin vehículo"} · {state.facturas.length} factura(s)
            {ruta.auxiliar && <> · auxiliar anterior: <b>{ruta.auxiliar}</b></>}
          </div>
        )}

        <InstallButton className="btn btn-outline login-install" />
      </div>
    </div>
  );
}
