/* ---------- CONFIG SUPABASE ---------- */
export const SUPABASE_URL = "https://ufhnijlxtvuonxchdwdx.supabase.co";
export const SUPABASE_ANON_KEY = "sb_publishable_L5YE091q91pR7nbiR3Vb5Q_fAFq06mI"; // llave pública (publishable)

/* ---------- CAUSALES DE DEVOLUCION ---------- */
export const CAUSALES = [
  "1. Sin dinero", "2. Error de digitación", "3. Error de despacho", "4. No hizo pedido",
  "5. OC cerrada", "6. Cliente ausente", "7. Pto por estampillar", "8. Fecha de vencimiento",
  "9. Avería en transporte", "10. Establecimiento cerrado", "11. Problemas de calidad",
  "12. Dev total factura"
];
export const CAUSAL_DEV_TOTAL = CAUSALES[11];

export const FORMA_MIXTA = "Mixta (Transferencia + Efectivo)";
export const FORMAS_PAGO = [
  FORMA_MIXTA, "Efectivo", "Crédito", "Transferencia",
  "Saldo a favor", "Retenciones", "Reenvío"
];

export const ESTADOS_ENTREGA = ["OK", "Dev Parcial", "Dev Total", "Reenvío"];

/* Conceptos de descuento que se pueden aplicar a una factura */
export const CONCEPTOS_DESCUENTO = [
  "Descuento comercial", "Pronto pago", "Promoción", "Bonificación", "Ajuste de precio", "Otro"
];

/* los vendedores se agregan solos desde la columna "Nombre vendedor" de la planilla */
export const VENDEDORES_DEFAULT = [];

/* Cuadre: "Descuentos" es nueva, el resto igual que antes */
export const CUADRE_BUCKETS = [
  "Dev Totales", "Dev Parciales", "Reenvío", "Descuentos", "Crédito", "Retenciones",
  "Saldo a Favor", "Transferencia", "Mixta Transferencia", "Mixta Efectivo", "Efectivo"
];

export const DENOMINACIONES_EFECTIVO = [50, 100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];

/* Plantilla de carga (reporte "RUTA - aaaa-mm-dd.xls"): solo se leen estas columnas */
export const PLANTILLA_COLUMNAS = [
  "Fecha planilla", "Vehículo", "Nombre conductor", "Nro documento",
  "Desc. sucursal despacho", "Razón social cliente despacho", "Cantidad inv.", "Valor neto",
  "Nombre vendedor", "Nro documento planilla"
];

/* Plantilla de carga de auxiliares (Excel) */
export const PLANTILLA_AUX_COLUMNAS = ["Nombre", "Usuario", "PIN", "Teléfono"];

export const SECTIONS = [
  { id: "dashboard", icon: "📊", label: "Panel general", title: "Panel general de la ruta" },
  { id: "entregas", icon: "🚚", label: "1. Ruta / Facturas", title: "Ruta — Facturas a entregar" },
  { id: "devolucion", icon: "↩️", label: "2. Devolución", title: "Devolución de pedidos" },
  { id: "cuadre", icon: "🧾", label: "3. Cuadre de ruta", title: "Cuadre de ruta" },
  { id: "fuerapicking", icon: "🧾", label: "4. Fuera de picking", title: "Facturas fuera de picking" },
  { id: "clientes", icon: "👥", label: "5. Clientes", title: "Base de datos de clientes" },
  { id: "productos", icon: "🏷️", label: "6. Productos", title: "Base de datos de productos" },
  { id: "efectivo", icon: "💵", label: "7. Calculadora de efectivo", title: "Calculadora de efectivo" },
  { id: "historial", icon: "🗂️", label: "8. Historial de rutas", title: "Historial de mis rutas" },
  { id: "mapas", icon: "🗺️", label: "9. Mapas de clientes", title: "Mapas de clientes (GPS)" }
];
