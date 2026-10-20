import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { StoreProvider, ToastProvider } from "./store.jsx";
import App from "./App.jsx";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <ToastProvider>
      <StoreProvider>
        <App />
      </StoreProvider>
    </ToastProvider>
  </StrictMode>
);

/* ---------- Service worker (PWA instalable + offline) ---------- */
if ("serviceWorker" in navigator && import.meta.env.PROD) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      const showUpdate = (worker) => {
        const bar = document.createElement("div");
        bar.className = "update-bar";
        bar.innerHTML = 'Hay una nueva versión de la app. <button>Actualizar</button>';
        bar.querySelector("button").onclick = () => worker.postMessage("SKIP_WAITING");
        document.body.appendChild(bar);
      };
      if (reg.waiting && navigator.serviceWorker.controller) showUpdate(reg.waiting);
      reg.addEventListener("updatefound", () => {
        const w = reg.installing;
        w && w.addEventListener("statechange", () => {
          if (w.state === "installed" && navigator.serviceWorker.controller) showUpdate(w);
        });
      });
    }).catch((e) => console.warn("SW no registrado:", e));

    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    });
  });
}
