import { num } from "./utils.js";
import { CUADRE_BUCKETS, FORMA_MIXTA } from "./constants.js";

/* ---------- CALCULOS DE FACTURA ---------- */
export function facturaValor(f) {
  return num(f.valorFactura);
}

export function facturaTotalDescuentos(f) {
  return (f.descuentos || []).reduce((s, d) => s + num(d.valor), 0);
}

/* Valor devuelto en una devolución parcial: suma de lo registrado en el documento de devolución */
export function facturaDevParcialValor(f, devoluciones) {
  return devoluciones
    .filter((d) => d.facturaId === f.id && d.tipo === "parcial")
    .reduce((s, d) => s + num(d.valor), 0);
}

export function facturaSaldoAPagar(f, devoluciones) {
  if (f.estado === "Dev Total") return 0;
  let total = facturaValor(f);
  total -= facturaTotalDescuentos(f);
  total -= num(f.retencion);
  total -= num(f.saldoFavor);
  if (f.estado === "Dev Parcial") total -= facturaDevParcialValor(f, devoluciones);
  return Math.max(0, total);
}

/* ---------- CUADRE DE RUTA ---------- */
const FORMA_A_BUCKET = {
  "Efectivo": "Efectivo",
  "Crédito": "Crédito",
  "Transferencia": "Transferencia",
  "Saldo a favor": "Saldo a Favor",
  "Retenciones": "Retenciones",
  "Reenvío": "Reenvío"
};

export function computeCuadre(facturas, devoluciones) {
  const buckets = {};
  CUADRE_BUCKETS.forEach((b) => (buckets[b] = { count: 0, valor: 0, facturas: [] }));
  const add = (b, f, valor) => {
    buckets[b].count++;
    buckets[b].valor += valor;
    buckets[b].facturas.push({ id: f.id, numero: f.numero, cliente: f.cliente, valor });
  };
  const sinFormaPago = [];

  facturas.forEach((f) => {
    const total = facturaValor(f);
    if (f.estado === "Dev Total") { add("Dev Totales", f, total); return; }
    if (f.estado === "Reenvío") { add("Reenvío", f, total); return; }

    const desc = facturaTotalDescuentos(f);
    if (desc) add("Descuentos", f, desc);
    if (num(f.retencion)) add("Retenciones", f, num(f.retencion));
    if (num(f.saldoFavor)) add("Saldo a Favor", f, num(f.saldoFavor));
    if (f.estado === "Dev Parcial") {
      const dev = facturaDevParcialValor(f, devoluciones);
      if (dev) add("Dev Parciales", f, dev);
    }

    const restante = facturaSaldoAPagar(f, devoluciones);
    if (restante <= 0) return;
    if (!f.formaPago) { sinFormaPago.push(f); return; }
    if (f.formaPago === FORMA_MIXTA) {
      if (num(f.mixtoTransferencia)) add("Mixta Transferencia", f, num(f.mixtoTransferencia));
      if (num(f.mixtoEfectivo)) add("Mixta Efectivo", f, num(f.mixtoEfectivo));
    } else if (FORMA_A_BUCKET[f.formaPago]) {
      add(FORMA_A_BUCKET[f.formaPago], f, restante);
    }
  });

  const totalEfectivo = buckets["Efectivo"].valor + buckets["Mixta Efectivo"].valor;
  const totalALegalizar = CUADRE_BUCKETS.reduce((s, b) => s + buckets[b].valor, 0);
  const valorTotalPlanilla = facturas.reduce((s, f) => s + facturaValor(f), 0);

  return {
    buckets,
    totalEfectivo,
    totalALegalizar,
    ctaTotalFacturas: facturas.length,
    valorTotalPlanilla,
    sinFormaPago,
    sinValor: facturas.filter((f) => !facturaValor(f))
  };
}

/* Cuadre guardado en el servidor (jsonb de la ruta) -> mismo formato que computeCuadre */
export function cuadreGuardado(r) {
  return {
    buckets: Object.fromEntries(CUADRE_BUCKETS.map((b) => [b, { count: Number(r.cuadre?.[b]?.count) || 0, valor: Number(r.cuadre?.[b]?.valor) || 0 }])),
    valorTotalPlanilla: Number(r.valor_total_planilla) || 0,
    retenciones: (r.cuadre && r.cuadre["Retenciones"] && r.cuadre["Retenciones"].facturas) || [],
    devTotalFacturas: (r.cuadre && r.cuadre["Dev Totales"] && r.cuadre["Dev Totales"].facturas) || [],
    reenvioFacturas: (r.cuadre && r.cuadre["Reenvío"] && r.cuadre["Reenvío"].facturas) || [],
    ctaTotalFacturas: (r.facturas || []).length,
    totalEfectivo: Number(r.total_efectivo) || 0,
    totalALegalizar: Number(r.total_a_legalizar) || 0
  };
}
