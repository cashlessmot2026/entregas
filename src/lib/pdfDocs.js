/* PDF tamaño carta del Cuadre de ruta y del formato de Devolución (F-GL-001).
   Se arman directamente con jsPDF a partir de los datos (no dependen de window.print ni del DOM),
   así funcionan igual en el navegador y en el APK. */
import { CUADRE_BUCKETS } from "./constants.js";
import { money } from "./utils.js";
import { entregarPdf } from "./descarga.js";

const AZUL = [19, 53, 143];

async function nuevoPdf(orientation) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ orientation, unit: "pt", format: "letter" });
  return { pdf, autoTable, W: pdf.internal.pageSize.getWidth() };
}

function encabezado(pdf, W, titulo, lineas) {
  pdf.setFillColor(...AZUL);
  pdf.rect(0, 0, W, 58, "F");
  pdf.setTextColor(255);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(15);
  pdf.text("LICONSUMAR Del Magdalena", 32, 26);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(11);
  pdf.text(titulo, 32, 44);
  pdf.setTextColor(30);
  pdf.setFontSize(9.5);
  let y = 78;
  lineas.forEach((l) => { pdf.text(l, 32, y); y += 14; });
  return y + 4;
}

function pie(pdf) {
  const n = pdf.internal.getNumberOfPages();
  const H = pdf.internal.pageSize.getHeight();
  const W = pdf.internal.pageSize.getWidth();
  for (let i = 1; i <= n; i++) {
    pdf.setPage(i);
    pdf.setFontSize(8); pdf.setTextColor(120);
    pdf.text("Generado " + new Date().toLocaleString("es-CO") + "  ·  Página " + i + " de " + n, W / 2, H - 18, { align: "center" });
  }
}

/* Cuadre de ruta con el formato de la plantilla "Cuadre de Ruta - Liconsumar del Magdalena" en tamaño carta (mm).
   A diferencia de la plantilla, TODOS los conceptos llevan su cantidad de facturas (Dev. parciales, Descuentos,
   Retenciones, Mixta Transf., Mixta Efectivo y Efectivo): la plantilla compartía una sola casilla para las tres últimas
   y dejaba sin casilla de cantidad a Descuentos, que sí suma en el total a legalizar.
   cuadre = { buckets: { [concepto]: { count, valor } }, valorTotalPlanilla, ctaTotalFacturas, totalEfectivo, totalALegalizar }
   route  = { auxiliar, conductor, placa, fecha, planilla } */
export async function pdfCuadre(route, cuadre, nombreArchivo) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const LINE = 0.32;
  const GRIS = [85, 85, 85];
  pdf.setLineWidth(LINE);
  pdf.setDrawColor(51);
  pdf.setTextColor(34);

  const b = (k) => cuadre.buckets[k] || { count: 0, valor: 0 };
  const celda = (x, y, w, h, texto, o = {}) => {
    if (o.fill) { pdf.setFillColor(...o.fill); pdf.rect(x, y, w, h, "FD"); } else pdf.rect(x, y, w, h);
    if (texto === "" || texto == null) return;
    pdf.setFont("helvetica", o.bold === false ? "normal" : "bold");
    pdf.setFontSize(o.size || 12);
    const align = o.align || "left";
    const tx = align === "center" ? x + w / 2 : x + 1.6;
    pdf.text(String(texto), tx, y + h / 2, { align, baseline: "middle", maxWidth: w - 3 });
  };

  /* --- marca --- */
  const arco = (x, y, w, h, grosor) => {
    pdf.setLineWidth(grosor); pdf.setDrawColor(...GRIS); pdf.setLineCap("round");
    const rx = w / 2 - grosor / 2, ry = h - grosor / 2, cx = x + w / 2, cy = y + h;
    let prev = null;
    for (let i = 0; i <= 40; i++) {
      const t = Math.PI + (Math.PI * i) / 40;
      const pt = [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
      if (prev) pdf.line(prev[0], prev[1], pt[0], pt[1]);
      prev = pt;
    }
    pdf.setLineCap("butt"); pdf.setDrawColor(51); pdf.setLineWidth(LINE);
  };
  arco(44, 8, 33, 10, 2.2);
  arco(47.5, 10, 26, 7.3, 1.5);
  pdf.setTextColor(...GRIS);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(19);
  pdf.text("LICONSUMAR", 14, 26);
  pdf.setFontSize(17);
  pdf.text("Del Magdalena", 14, 32);
  pdf.setTextColor(34);

  /* --- recuadro principal --- */
  const PW = pdf.internal.pageSize.getWidth();
  const X = 14, W = PW - 28, ix = X + 5, iw = W - 10;
  const top = 35;
  let y = top + 4;
  celda(ix, y, iw, 8, "CUADRE DE RUTA", { size: 15, align: "center" }); y += 8;
  celda(ix, y, iw, 8, "LICONSUMAR DEL MAGDALENA", { size: 14, align: "center" }); y += 8;

  y += 1.5;
  const mw = [0.19, 0.27, 0.22, 0.32].map((f) => f * iw);
  const fila = (a1, v1, a2, v2) => {
    let x = ix;
    [[a1, 0, false], [v1, 1, true], [a2, 2, false], [v2, 3, true]].forEach(([t, i, centro]) => {
      celda(x, y, mw[i], 7, t, { size: 13, align: centro ? "center" : "left" }); x += mw[i];
    });
    y += 7;
  };
  fila("Fecha:", route.fecha || "", "Planilla:", route.planilla || "");
  fila("Vehículo:", route.placa || "", "Entregador:", route.auxiliar || route.conductor || "");

  y += 1.5;
  const s1 = 0.45 * iw;
  celda(ix, y, s1, 7, "Valor Total Planilla", { size: 14 });
  celda(ix + s1, y, iw - s1, 7, money(cuadre.valorTotalPlanilla), { size: 16, align: "center" }); y += 7;
  celda(ix, y, s1, 7, "Cta. Total Facturas", { size: 14 });
  celda(ix + s1, y, iw - s1, 7, String(cuadre.ctaTotalFacturas), { size: 16, align: "center" }); y += 7;

  /* --- detalle: cada concepto con su cantidad y su valor --- */
  const wc = 0.45 * iw, wn = 0.22 * iw, wv = 0.33 * iw, RH = 7.6;
  celda(ix, y, wc, 7, "", {}); celda(ix + wc, y, wn, 7, "Cta. Facturas", { size: 13, align: "center" });
  celda(ix + wc + wn, y, wv, 7, "Valor", { size: 13, align: "center" }); y += 7;
  const linea = (concepto, clave) => {
    celda(ix, y, wc, RH, concepto, { align: "center" });
    celda(ix + wc, y, wn, RH, String(b(clave).count), { align: "center" });
    celda(ix + wc + wn, y, wv, RH, money(b(clave).valor), { align: "center" });
    y += RH;
  };
  linea("Dev.totales", "Dev Totales");
  linea("Dev.parciales", "Dev Parciales");
  linea("Reenvio", "Reenvío");
  linea("Descuentos", "Descuentos");
  linea("Credito", "Crédito");
  linea("Retenciones", "Retenciones");
  linea("Saldo a Favor", "Saldo a Favor");
  linea("Transferencia", "Transferencia");
  linea("Mixta. Transf", "Mixta Transferencia");
  linea("Mixta. Efectivo", "Mixta Efectivo");
  linea("Efectivo", "Efectivo");
  celda(ix, y, wc, RH, "Total Efectivo", { align: "center", fill: [221, 221, 221] });
  celda(ix + wc, y, wn + wv, RH, money(cuadre.totalEfectivo)); y += RH;
  celda(ix, y, wc, RH, "Total a Legalizar", { align: "center", fill: [221, 221, 221] });
  celda(ix + wc, y, wn + wv, RH, money(cuadre.totalALegalizar)); y += RH;

  y += 5;
  pdf.setLineWidth(LINE);
  pdf.rect(X, top, W, y - top);

  /* --- nota (si no cuadra, queda escrita la diferencia) --- */
  y += 10;
  const diff = Math.round(cuadre.valorTotalPlanilla - cuadre.totalALegalizar);
  const wl = 0.18 * W;
  celda(X, y, wl, 14, "NOTA:", { size: 13, align: "center" });
  pdf.rect(X + wl, y, W - wl, 14);
  if (diff) {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text(`Diferencia de ${money(diff)} entre el total a legalizar y el valor total de la planilla.`, X + wl + 2, y + 7, { baseline: "middle", maxWidth: W - wl - 4 });
  }
  y += 14;

  /* --- dinero entregado en caja + firmas --- */
  y += 8;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
  pdf.text("Dinero entregado en caja:", X + 5, y, { baseline: "middle" });
  const xs = X + 5 + pdf.getTextWidth("Dinero entregado en caja:") + 3;
  pdf.setFont("helvetica", "normal");
  pdf.text("$", xs, y, { baseline: "middle" });
  pdf.line(xs + 4, y + 3.5, X + W - 5, y + 3.5);

  y += 3.5 + 16;
  const sw = 0.46 * W;
  [[X, "RECIBIDO LOGISTICA"], [X + W - sw, "RECIBIDO CAJA"]].forEach(([x, t]) => {
    pdf.line(x, y, x + sw, y);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text(t, x + sw / 2, y + 5, { align: "center", baseline: "middle" });
  });

  return entregarPdf(pdf, nombreArchivo || `cuadre_${route.placa || "ruta"}_${route.fecha || ""}`);
}

/* devoluciones = [{ fecha, placa, cliente, factura, asesor, causal, codigoProducto, descripcion, cantidad, valor, firma }] */
export async function pdfDevolucion(route, devoluciones, nombreArchivo) {
  const { pdf, autoTable, W } = await nuevoPdf("landscape");
  const y0 = encabezado(pdf, W, "Formato Devolución de Pedidos — F-GL-001", [
    `Fecha: ${route.fecha || "-"}      Placa: ${route.placa || "-"}      Planilla: ${route.planilla || "-"}`,
    `Conductor: ${route.conductor || "-"}      Auxiliar: ${route.auxiliar || "-"}`
  ]);
  const total = devoluciones.reduce((s, d) => s + (Number(d.valor) || 0), 0);
  const body = devoluciones.length
    ? devoluciones.map((d) => [d.fecha || "", d.placa || route.placa || "", d.cliente || "", d.factura || "", d.asesor || "",
        d.causal || "", d.codigoProducto || "", d.descripcion || "", d.cantidad === "" || d.cantidad == null ? "" : String(d.cantidad), money(d.valor), ""])
    : [[{ content: "No se registraron devoluciones en esta ruta.", colSpan: 11, styles: { halign: "center" } }]];
  const firmas = devoluciones.map((d) => d.firma || null);
  autoTable(pdf, {
    head: [["Fecha", "Placa", "Cliente", "Factura", "Asesor", "Causal", "Cód.", "Descripción", "Cant.", "Valor", "Firma"]],
    body, startY: y0, theme: "grid",
    styles: { fontSize: 8, cellPadding: 3, minCellHeight: 26, valign: "middle" },
    headStyles: { fillColor: AZUL, textColor: 255 },
    columnStyles: { 8: { halign: "center" }, 9: { halign: "right" }, 10: { cellWidth: 62 } },
    margin: { left: 28, right: 28 },
    didDrawCell: (h) => {
      if (h.section === "body" && h.column.index === 10 && firmas[h.row.index]) {
        const img = firmas[h.row.index];
        try { pdf.addImage(img, /image\/jpe?g/i.test(img) ? "JPEG" : "PNG",h.cell.x + 2, h.cell.y + 2, h.cell.width - 4, h.cell.height - 4); } catch { /* firma inválida: se omite */ }
      }
    }
  });
  const fin = (pdf.lastAutoTable && pdf.lastAutoTable.finalY) || y0 + 100;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  pdf.text("Total devuelto: " + money(total), W - 28, fin + 20, { align: "right" });
  pie(pdf);
  return entregarPdf(pdf, nombreArchivo || `devolucion_${route.placa || "ruta"}_${route.fecha || ""}`);
}
