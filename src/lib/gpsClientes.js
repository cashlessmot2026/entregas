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

  const indice = useMemo(() => {
    const exacto = new Map();
    const nucleo = new Map(); // núcleo del nombre -> lugares (para la búsqueda aproximada)
    l.forEach((p) => {
      exacto.set(p.nombre_norm || normNombre(p.nombre), p);
      const c = nucleoNombre(p.nombre);
      if (c.length >= 3) { if (!nucleo.has(c)) nucleo.set(c, []); nucleo.get(c).push(p); }
    });
    return { exacto, nucleo };
  }, [l]);
  const porNombre = useCallback((nombre) => indice.exacto.get(normNombre(nombre)) || null, [indice]);
  // solo si hay UN lugar con ese núcleo (si hay varios no se adivina)
  const porNucleo = useCallback((nombre) => {
    const c = nucleoNombre(nombre);
    const m = c.length >= 3 ? indice.nucleo.get(c) : null;
    return m && m.length === 1 ? m[0] : null;
  }, [indice]);

  return { lista: l, porNombre, porNucleo, cargando, error, recargar };
}

/* Palabras genéricas que se quitan para comparar nombres de negocio
   ("TIENDA LA ESTACION" ~ "La Estacion", "LICORERIA FENIX" ~ "Licorera Fenix") */
const GENERICAS = new Set(("TIENDA TIENDAS ESTANCO LICORES LICORERA LICORERIA PROVISIONES ESTADERO PUNTO FRIO MINIMERCADO MINI " +
  "MERCADO MICROMERCADO SUPERMERCADO AUTOSERVICIO GRANERO KIOSKO KIOSCO MISCELANEA MISELANEA DEPOSITO MARKET BAR BILLAR " +
  "BILLARES ASADERO DISCOTECA LOCAL COMERCIAL CIGARRERIA Y DE DEL LA EL LOS LAS DONDE SAS S A").split(" "));
export function nucleoNombre(s) {
  return normNombre(s).replace(/[^A-Z0-9 ]/g, " ").split(" ").filter((w) => w && !GENERICAS.has(w)).join(" ");
}

/* GPS de un cliente. nombres = nombre del negocio (y opcionalmente la razón social); gps = useClientesGps().
   Orden: el tomado al entregar una de sus facturas, el del servidor con el mismo nombre, la referencia que trajo
   la ruta, y por último uno del servidor con nombre parecido (aprox: true, ref = nombre con que se encontró).
   Devuelve { lat, lng, aprox, ref } o null. */
export function gpsDeCliente(nombres, facturas, gps) {
  const ok = (a, b) => a != null && b != null && a !== "" && b !== "" && isFinite(a) && isFinite(b);
  const lista = (Array.isArray(nombres) ? nombres : [nombres]).filter((x) => x && String(x).trim());
  const fe = (facturas || []).find((f) => ok(f.lat, f.lng));
  if (fe) return { lat: Number(fe.lat), lng: Number(fe.lng), aprox: false };
  for (const n of lista) {
    const sv = gps && gps.porNombre ? gps.porNombre(n) : null;
    if (sv && ok(sv.lat, sv.lng)) return { lat: Number(sv.lat), lng: Number(sv.lng), aprox: false, ref: sv.nombre };
  }
  const fr = (facturas || []).find((f) => ok(f.refLat, f.refLng));
  if (fr) return { lat: Number(fr.refLat), lng: Number(fr.refLng), aprox: false };
  for (const n of lista) {
    const sv = gps && gps.porNucleo ? gps.porNucleo(n) : null;
    if (sv && ok(sv.lat, sv.lng)) return { lat: Number(sv.lat), lng: Number(sv.lng), aprox: true, ref: sv.nombre };
  }
  return null;
}
