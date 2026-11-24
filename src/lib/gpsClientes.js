import { useCallback, useEffect, useMemo, useState } from "react";
import { auxApi } from "./supabase.js";

/* Ubicación GPS de todos los clientes (tabla clientes_gps del servidor).
   Se guarda en el equipo para verla sin internet y se comparte entre pestañas. */
const KEY = "rl_clientes_gps";

/* Igual que norm_txt() del servidor: mayúsculas, sin tildes, sin espacios dobles */
export function normNombre(s) {
  return String(s == null ? "" : s).normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

const leer = () => { try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); return Array.isArray(v) ? v : []; } catch { return []; } };

let lista = leer();
let cargadoAt = 0;
let enCurso = null;
const subs = new Set();
const avisar = () => subs.forEach((fn) => fn(lista));

async function traer(usuario, pin) {
  if (enCurso) return enCurso;
  enCurso = auxApi.clientesGps(usuario, pin)
    .then((l) => {
      lista = (Array.isArray(l) ? l : []).filter((p) => p.lat != null && p.lng != null);
      cargadoAt = Date.now();
      try { localStorage.setItem(KEY, JSON.stringify(lista)); } catch { /* sin espacio */ }
      avisar();
      return lista;
    })
    .finally(() => { enCurso = null; });
  return enCurso;
}

/* { lista, porNombre(nombre) → {lat,lng,...}|null, cargando, error, recargar } */
export function useClientesGps(session) {
  const [l, setL] = useState(lista);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState("");
  const usuario = session && session.usuario;
  const pin = session && session.pin;

  const recargar = useCallback(async () => {
    if (!usuario || !navigator.onLine) return;
    setCargando(true);
    try { await traer(usuario, pin); setError(""); }
    catch (e) {
      const m = e.message || String(e);
      setError(/schema cache|does not exist/i.test(m)
        ? "falta ejecutar el archivo supabase/schema.sql actualizado en Supabase (SQL Editor)"
        : m);
    }
    finally { setCargando(false); }
  }, [usuario, pin]);

  useEffect(() => {
    subs.add(setL);
    // se refresca si nunca se trajo en esta sesión o tiene más de 2 minutos
    if (Date.now() - cargadoAt > 120000) recargar();
    return () => { subs.delete(setL); };
  }, [recargar]);

  const indice = useMemo(() => new Map(l.map((p) => [p.nombre_norm || normNombre(p.nombre), p])), [l]);
  const porNombre = useCallback((nombre) => indice.get(normNombre(nombre)) || null, [indice]);

  return { lista: l, porNombre, cargando, error, recargar };
}

/* GPS de un cliente: el tomado al entregar una de sus facturas, luego el del servidor (clientes_gps),
   luego la referencia que trajo la ruta al cargarse. Devuelve { lat, lng } o null. */
export function gpsDeCliente(nombre, facturas, porNombre) {
  const ok = (a, b) => a != null && b != null && a !== "" && b !== "" && isFinite(a) && isFinite(b);
  const fe = (facturas || []).find((f) => ok(f.lat, f.lng));
  if (fe) return { lat: Number(fe.lat), lng: Number(fe.lng) };
  const sv = porNombre ? porNombre(nombre) : null;
  if (sv && ok(sv.lat, sv.lng)) return { lat: Number(sv.lat), lng: Number(sv.lng) };
  const fr = (facturas || []).find((f) => ok(f.refLat, f.refLng));
  return fr ? { lat: Number(fr.refLat), lng: Number(fr.refLng) } : null;
}
