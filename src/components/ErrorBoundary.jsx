import { Component } from "react";

/* Si una pantalla falla, muestra el error en vez de dejar la app en blanco */
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error("Error de pantalla:", error, info); }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="panel panel-aviso" style={{ margin: 16 }}>
        <h2>⚠ Algo salió mal en esta pantalla</h2>
        <p className="hint">Tus datos están a salvo. Toca el botón para reintentar; si sigue igual, envía este mensaje al administrador:</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12, background: "#f7f9ff", padding: 10, borderRadius: 10 }}>{String(this.state.error && (this.state.error.stack || this.state.error.message || this.state.error)).slice(0, 600)}</pre>
        <button className="btn btn-primary" onClick={() => { this.setState({ error: null }); this.props.onReset && this.props.onReset(); }}>Reintentar</button>
      </div>
    );
  }
}
