/* Seguimiento en vivo del camión (opcional). Mientras está activo, la app envía la posición GPS a
   Supabase cada ~15 s para que el administrador vea el vehículo en su mapa.
   Limitación de las apps web: solo reporta con la app abierta (se pide mantener la pantalla encendida). */
import { useCallback, useEffect, useRef, useState } from "react";
import { auxApi } from "./supabase.js";

const KEY = "rl_seguimiento";
const CADA_MS = 15000;

export function useSeguimiento(session, route) {
  const [activo, setActivo] = useState(() => localStorage.getItem(KEY) === "1");
  const [estado, setEstado] = useState({ ok: null, lat: null, lng: null, hora: null, error: "" });
  const ref = useRef({ session, route, ultimo: null, enviadoEn: 0 });
  ref.current.session = session;
  ref.current.route = route;

  const enviar = useCallback(async (p) => {
    const { session: s, route: r } = ref.current;
    if (!s.usuario || !navigator.onLine) return;
    try {
      await auxApi.ubicacion(s.usuario, s.pin, r.placa, r.planilla, p);
      ref.current.enviadoEn = Date.now();
      setEstado({ ok: true, lat: p.lat, lng: p.lng, hora: new Date(), error: "" });
    } catch (e) { setEstado((x) => ({ ...x, ok: false, error: e.message })); }
  }, []);

  const logueado = !!session.usuario;
  useEffect(() => {
    if (!activo || !logueado || !navigator.geolocation) return;
    let wake = null;
    const pedirPantalla = async () => { try { if (navigator.wakeLock) wake = await navigator.wakeLock.request("screen"); } catch { /* opcional */ } };
    pedirPantalla();
    const onVis = () => { if (document.visibilityState === "visible") pedirPantalla(); };
    document.addEventListener("visibilitychange", onVis);

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        const p = {
          lat: +pos.coords.latitude.toFixed(6), lng: +pos.coords.longitude.toFixed(6),
          precision: Math.round(pos.coords.accuracy), velocidad: pos.coords.speed != null ? Math.round(pos.coords.speed * 3.6) : null
        };
        ref.current.ultimo = p;
        if (Date.now() - ref.current.enviadoEn >= CADA_MS) enviar(p);
      },
      (e) => {
        setEstado((x) => ({ ...x, ok: false, error: e.code === 1 ? "Permiso de ubicación denegado" : "Sin señal GPS" }));
        if (e.code === 1) { localStorage.setItem(KEY, "0"); setActivo(false); }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 }
    );
    // latido: si el camión está quieto igual se renueva la hora de la última posición
    const beat = setInterval(() => { if (ref.current.ultimo && Date.now() - ref.current.enviadoEn >= CADA_MS * 2) enviar(ref.current.ultimo); }, CADA_MS);

    return () => {
      navigator.geolocation.clearWatch(id);
      clearInterval(beat);
      document.removeEventListener("visibilitychange", onVis);
      if (wake) wake.release().catch(() => {});
    };
  }, [activo, logueado, enviar]);

  const toggle = useCallback(async () => {
    const nuevo = !activo;
    if (nuevo && !navigator.geolocation) { alert("Este dispositivo no tiene GPS"); return; }
    localStorage.setItem(KEY, nuevo ? "1" : "0");
    setActivo(nuevo);
    if (!nuevo) {
      ref.current.ultimo = null;
      setEstado({ ok: null, lat: null, lng: null, hora: null, error: "" });
      const { session: s, route: r } = ref.current;
      try { await auxApi.ubicacion(s.usuario, s.pin, r.placa, r.planilla, null); } catch { /* se borra por antigüedad */ }
    }
  }, [activo]);

  return { activo, estado, toggle };
}
