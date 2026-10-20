import { useEffect, useState } from "react";

/* Captura el evento de instalación de la PWA (Android / Chrome / Edge).
   En iPhone se muestra la instrucción "Compartir → Agregar a inicio". */
let deferredPrompt = null;
const listeners = new Set();
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    listeners.forEach((fn) => fn());
  });
  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    listeners.forEach((fn) => fn());
  });
}

const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);

export default function InstallButton({ className }) {
  const [, force] = useState(0);
  const [iosHint, setIosHint] = useState(false);

  useEffect(() => {
    const fn = () => force((n) => n + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);

  if (isStandalone()) return null;

  if (deferredPrompt) {
    return (
      <button className={className} onClick={async () => {
        deferredPrompt.prompt();
        await deferredPrompt.userChoice;
        deferredPrompt = null;
        force((n) => n + 1);
      }}>📲 Instalar app</button>
    );
  }

  if (isIos()) {
    return (
      <>
        <button className={className} onClick={() => setIosHint((v) => !v)}>📲 Instalar app</button>
        {iosHint && <div className="ios-hint">En Safari toca <b>Compartir</b> ⬆️ y luego <b>"Agregar a pantalla de inicio"</b>.</div>}
      </>
    );
  }

  return null;
}
