export function uid(prefix) {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function money(n) {
  n = Number(n) || 0;
  return "$" + n.toLocaleString("es-CO", { maximumFractionDigits: 0 });
}

export function num(n) {
  if (typeof n === "string") n = n.replace(/[$\s]/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  return Number(n) || 0;
}

export function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[m]));
}

export function todayStr() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

/* minúsculas, sin tildes, sin espacios ni símbolos: "N° Documento" -> "ndocumento" */
export function normHeader(s) {
  return String(s == null ? "" : s)
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

/* para búsquedas: minúsculas y sin tildes, conserva espacios */
export function normText(s) {
  return String(s == null ? "" : s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
}

export function mapEmbedUrl(direccion, ciudad) {
  const q = encodeURIComponent((direccion || "") + ", " + (ciudad || "Santa Marta, Magdalena, Colombia"));
  return "https://www.google.com/maps?q=" + q + "&output=embed";
}

export function mapLinkUrl(direccion, ciudad) {
  const q = encodeURIComponent((direccion || "") + ", " + (ciudad || "Santa Marta, Magdalena, Colombia"));
  return "https://www.google.com/maps/search/?api=1&query=" + q;
}

/* Reduce la foto del comprobante antes de guardarla (las fotos del celular pesan varios MB) */
export function compressImage(file, maxSide = 1280, quality = 0.72) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => resolve(reader.result);
      img.onload = () => {
        const r = Math.min(1, maxSide / Math.max(img.width, img.height));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * r);
        canvas.height = Math.round(img.height * r);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/* Ubicación actual del celular (GPS). Devuelve { lat, lng, precision } o lanza error con mensaje legible */
export function getPosition(timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) { reject(new Error("Este dispositivo no tiene GPS")); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: +p.coords.latitude.toFixed(6), lng: +p.coords.longitude.toFixed(6), precision: Math.round(p.coords.accuracy) }),
      (e) => reject(new Error(e.code === 1 ? "Permiso de ubicación denegado" : "No se pudo obtener la ubicación")),
      { enableHighAccuracy: true, timeout, maximumAge: 15000 }
    );
  });
}

export const navUrl = (lat, lng) => "https://www.google.com/maps/dir/?api=1&destination=" + lat + "," + lng;

/* Fotos del comprobante de pago. Se guardan en el mismo campo de texto de siempre:
   una sola foto = la imagen tal cual; varias = lista JSON. Así no cambia la base de datos
   y las rutas ya guardadas con una foto siguen funcionando. */
export function fotosPago(v) {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  const s = String(v).trim();
  if (s.startsWith("[")) { try { const a = JSON.parse(s); return Array.isArray(a) ? a.filter(Boolean) : []; } catch { return []; } }
  return [s];
}
export function empaquetarFotos(lista) {
  const l = (lista || []).filter(Boolean);
  if (!l.length) return null;
  return l.length === 1 ? l[0] : JSON.stringify(l);
}

/* Registro de reenvío en un formato único, venga del estado local (campos sueltos) o del servidor (campo detalle). */
export function normReenvio(r) {
  const d = r.detalle || {};
  return {
    numero: r.numero || "",
    valor: Number(r.valor) || 0,
    fecha: r.fecha || "",
    cliente: r.cliente ?? d.cliente ?? "",
    vendedor: r.vendedor ?? d.vendedor ?? "",
    formaPago: r.formaPago ?? d.forma_pago ?? "",
    estado: r.estado ?? d.estado ?? "",
    observaciones: r.observaciones ?? d.observaciones ?? ""
  };
}
