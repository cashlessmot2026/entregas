import { useMemo } from "react";
import { useStore } from "../store.jsx";
import { money } from "../lib/utils.js";
import { facturaValor, facturaSaldoAPagar, facturaTotalDescuentos } from "../lib/calc.js";

function Ring({ pct }) {
  const r = 34, c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 84 84" className="ring">
      <circle cx="42" cy="42" r={r} fill="none" stroke="#e3e9fb" strokeWidth="9" />
      <circle cx="42" cy="42" r={r} fill="none" stroke="#22c55e" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} transform="rotate(-90 42 42)" />
      <text x="42" y="47" textAnchor="middle" className="ring-txt">{pct}%</text>
    </svg>
  );
}

export default function Dashboard({ onNavigate, ofertas = [], onCargar, onActualizar, buscando, seguimiento }) {
  const { state, actions } = useStore();
  const { route, facturas, devoluciones } = state;

  const k = useMemo(() => {
    const by = (e) => facturas.filter((f) => f.estado === e).length;
    return {
      total: facturas.length,
      ok: by("OK"),
      devP: by("Dev Parcial"),
      devT: by("Dev Total"),
      reenv: by("Reenvío"),
      entregadas: facturas.filter((f) => f.confirmada).length,
      clientes: new Set(facturas.map((f) => (f.cliente || "").trim().toLowerCase()).filter(Boolean)).size,
      valorTotal: facturas.reduce((s, f) => s + facturaValor(f), 0),
      descuentos: facturas.reduce((s, f) => s + facturaTotalDescuentos(f), 0),
      recaudo: facturas.reduce((s, f) => s + facturaSaldoAPagar(f, devoluciones), 0),
      sinValor: facturas.filter((f) => !facturaValor(f)).length
    };
  }, [facturas, devoluciones]);

  const pct = k.total ? Math.round((k.entregadas / k.total) * 100) : 0;
  const hoy = new Date().toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });

  const field = (key, label, props = {}) => (
    <div className="field-row">
      <label>{label}</label>
      <input className="inp" value={route[key] || ""} onChange={(e) => actions.updateRoute(key, e.target.value)} {...props} />
    </div>
  );

  return (
    <>
      {/* ---- tarjeta de bienvenida (estilo app del auxiliar) ---- */}
      <section className="hero">
        <div className="hero-top">
          <div>
            <div className="hero-hi">¡Hola, {(route.auxiliar || "").split(" ")[0] || "auxiliar"}!</div>
            <div className="hero-sub">Tu ruta de hoy · {hoy}</div>
          </div>
          <button className="btn btn-xs hero-btn" disabled={buscando} onClick={onActualizar}>{buscando ? "Buscando..." : "🔄 Buscar mi ruta"}</button>
        </div>
        <div className="hero-card">
          <div className="hero-card-head">
            <div>
              <div className="hero-ruta">{route.planilla ? "Planilla " + route.planilla : "Sin planilla asignada"}</div>
              <div className="hero-date">{route.fecha || "-"}</div>
            </div>
            <span className={"pill " + (k.total ? "pill-ok" : "pill-off")}>{k.total ? "● Activa" : "● Sin ruta"}</span>
          </div>
          <div className="hero-vehicle">
            <div className="truck">🚚</div>
            <div>
              <div className="hero-plate">{route.placa || "Sin vehículo"}</div>
              <div className="hero-sub dark">Conductor: {route.conductor || "-"}</div>
            </div>
          </div>
        </div>
        <div className="tiles">
          <div className="tile"><span className="tile-ic">🧾</span><b>{k.total}</b><small>Facturas</small></div>
          <div className="tile"><span className="tile-ic">👥</span><b>{k.clientes}</b><small>Clientes</small></div>
          <div className="tile"><span className="tile-ic">💵</span><b className="tile-money">{money(k.recaudo)}</b><small>A recaudar</small></div>
        </div>
        <div className="hero-progress">
          <Ring pct={pct} />
          <div>
            <div className="hero-prog-title">Tu progreso</div>
            <div className="hero-prog-sub">{k.entregadas} de {k.total} entregas · quedan {k.total - k.entregadas}</div>
            <button className="btn btn-primary" onClick={() => onNavigate("entregas")}>▶ {k.entregadas ? "Continuar ruta" : "Iniciar ruta"}</button>
          </div>
        </div>
      </section>

      {seguimiento && (
        <div className={"panel track" + (seguimiento.activo ? " on" : "")}>
          <div className="track-row">
            <div className="track-ic">{seguimiento.activo ? "📡" : "📍"}</div>
            <div className="track-txt">
              <b>Seguimiento en vivo del camión <span className="muted">(opcional)</span></b>
              <small>
                {seguimiento.activo
                  ? (seguimiento.estado.ok === false ? "⚠ " + seguimiento.estado.error
                    : seguimiento.estado.hora ? "Compartiendo ubicación · último envío " + seguimiento.estado.hora.toLocaleTimeString("es-CO") : "Buscando señal GPS...")
                  : "El administrador podrá ver en su mapa dónde va tu vehículo mientras esté activo."}
              </small>
            </div>
            <label className="switch">
              <input type="checkbox" checked={seguimiento.activo} onChange={seguimiento.toggle} />
              <span />
            </label>
          </div>
          {seguimiento.activo && <p className="hint" style={{ margin: "8px 0 0" }}>Mantén la app abierta con la pantalla encendida para que siga enviando la ubicación.</p>}
        </div>
      )}

      {ofertas.length > 0 && (
        <div className="panel panel-aviso">
          <h2>📥 Rutas asignadas por el administrador</h2>
          <div className="planilla-list">
            {ofertas.map((r) => (
              <button key={r.id} className="planilla-item" onClick={() => onCargar(r)}>
                <div className="planilla-placa">🚚 {r.placa || "-"}</div>
                <div className="planilla-info"><b>Planilla {r.planilla || "-"}</b><span>{r.fecha || "-"} · {r.conductor}</span></div>
                <div className="planilla-count">{r.facturas.length}<small>facturas</small></div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!facturas.length && (
        <div className="panel panel-aviso">
          <h2>⏳ Aún no tienes ruta asignada</h2>
          <p className="hint">Cuando el administrador cargue el archivo del día, tu ruta aparece aquí automáticamente. También puedes cargar una planilla manualmente.</p>
          <div className="upload-row">
            <button className="btn btn-outline" onClick={onActualizar}>🔄 Buscar mi ruta</button>
            <button className="btn btn-primary" onClick={() => onNavigate("entregas")}>📥 Cargar planilla manual</button>
          </div>
        </div>
      )}

      <div className="panel">
        <h2>🚚 Datos de la ruta</h2>
        <p className="hint">Vienen del archivo que cargó el administrador. Puedes corregirlos aquí.</p>
        <div className="grid grid-5">
          <div className="field-row"><label>Auxiliar</label><div className="static-val">{route.auxiliar || "-"}</div></div>
          {field("conductor", "Nombre del conductor", { placeholder: "Ej: Carlos Pérez" })}
          {field("placa", "Vehículo (placa)", { placeholder: "Ej: BHK-744" })}
          {field("fecha", "Fecha", { type: "date" })}
          {field("planilla", "Número de planilla", { placeholder: "Ej: 4633" })}
        </div>
      </div>

      <div className="panel">
        <h2>📊 Consolidado por estado</h2>
        <div className="dash-cards">
          <div className="dash-card"><div className="val">{k.total}</div><div className="lbl">Total facturas</div></div>
          <div className="dash-card"><div className="val">{k.entregadas}/{k.total}</div><div className="lbl">Entregas confirmadas</div></div>
          <div className="dash-card"><div className="val">{k.ok}</div><div className="lbl">OK</div></div>
          <div className="dash-card"><div className="val">{k.devP}</div><div className="lbl">Dev. Parcial</div></div>
          <div className="dash-card"><div className="val">{k.devT}</div><div className="lbl">Dev. Total</div></div>
          <div className="dash-card"><div className="val">{k.reenv}</div><div className="lbl">Reenvío</div></div>
          <div className="dash-card"><div className="val">{money(k.valorTotal)}</div><div className="lbl">Valor total facturado</div></div>
          <div className="dash-card"><div className="val">{money(k.descuentos)}</div><div className="lbl">Descuentos</div></div>
          <div className="dash-card"><div className="val">{money(k.recaudo)}</div><div className="lbl">Valor a recaudar</div></div>
        </div>
        {k.sinValor > 0 && (
          <div style={{ marginTop: 12 }}>
            <span className="badge badge-warn">⚠ {k.sinValor} factura(s) sin valor digitado</span>
          </div>
        )}
      </div>
    </>
  );
}
