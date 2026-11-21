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

/* Cuadre de ruta con el formato de la plantilla "Cuadre de Ruta - Liconsumar del Magdalena" (A4, medidas en mm).
   cuadre = { buckets: { [concepto]: { count, valor } }, valorTotalPlanilla, ctaTotalFacturas, totalEfectivo, totalALegalizar }
   route  = { auxiliar, conductor, placa, fecha, planilla } */
export async function pdfCuadre(route, cuadre, nombreArchivo) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
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
  arco(43, 12, 33, 11, 2.2);
  arco(46.5, 14, 26, 8, 1.5);
  pdf.setTextColor(...GRIS);
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(19);
  pdf.text("LICONSUMAR", 13, 31);
  pdf.setFontSize(17);
  pdf.text("Del Magdalena", 13, 37.5);
  pdf.setTextColor(34);

  /* --- recuadro principal --- */
  const X = 13, W = 184, ix = X + 6, iw = W - 12;
  const top = 39;
  let y = top + 5;
  celda(ix, y, iw, 9, "CUADRE DE RUTA", { size: 15, align: "center" }); y += 9;
  celda(ix, y, iw, 9, "LICONSUMAR DEL MAGDALENA", { size: 14, align: "center" }); y += 9;

  y += 2;
  const mw = [0.19, 0.27, 0.22, 0.32].map((f) => f * iw);
  const fila = (a1, v1, a2, v2) => {
    let x = ix;
    [[a1, 0, false], [v1, 1, true], [a2, 2, false], [v2, 3, true]].forEach(([t, i, centro]) => {
      celda(x, y, mw[i], 8, t, { size: 13, align: centro ? "center" : "left" }); x += mw[i];
    });
    y += 8;
  };
  fila("Fecha:", route.fecha || "", "Planilla:", route.planilla || "");
  fila("Vehículo:", route.placa || "", "Entregador:", route.auxiliar || route.conductor || "");

  y += 2;
  const s1 = 0.45 * iw;
  celda(ix, y, s1, 8, "Valor Total Planilla", { size: 14 });
  celda(ix + s1, y, iw - s1, 8, money(cuadre.valorTotalPlanilla), { size: 16, align: "center" }); y += 8;
  celda(ix, y, s1, 8, "Cta. Total Facturas", { size: 14 });
  celda(ix + s1, y, iw - s1, 8, String(cuadre.ctaTotalFacturas), { size: 16, align: "center" }); y += 8;

  /* --- detalle --- */
  const wc = 0.45 * iw, wn = 0.22 * iw, wv = 0.33 * iw, RH = 8.4;
  y += 0;
  celda(ix, y, wc, 8, "", {}); celda(ix + wc, y, wn, 8, "Cta. Facturas", { size: 13, align: "center" });
  celda(ix + wc + wn, y, wv, 8, "Valor", { size: 13, align: "center" }); y += 8;
  const NEGRO = [51, 51, 51];
  const linea = (concepto, cant, valor) => {
    celda(ix, y, wc, RH, concepto, { align: "center" });
    if (cant === null) celda(ix + wc, y, wn, RH, "", { fill: NEGRO });
    else celda(ix + wc, y, wn, RH, String(cant), { align: "center" });
    celda(ix + wc + wn, y, wv, RH, money(valor), { align: "center" });
    y += RH;
  };
  linea("Dev.totales", b("Dev Totales").count, b("Dev Totales").valor);
  linea("Dev.parciales", null, b("Dev Parciales").valor);
  linea("Reenvio", b("Reenvío").count, b("Reenvío").valor);
  linea("Credito", b("Crédito").count, b("Crédito").valor);
  linea("Retenciones", null, b("Retenciones").valor);
  linea("Saldo a Favor", b("Saldo a Favor").count, b("Saldo a Favor").valor);
  linea("Transferencia", b("Transferencia").count, b("Transferencia").valor);
  // las tres últimas filas comparten la celda de cantidad (la de Mixta Transf.)
  celda(ix + wc, y, wn, RH * 3, String(b("Mixta Transferencia").count), { align: "center" });
  [["Mixta. Transf", b("Mixta Transferencia").valor], ["Mixta. Efectivo", b("Mixta Efectivo").valor], ["Efectivo", b("Efectivo").valor]].forEach(([c, v]) => {
    celda(ix, y, wc, RH, c, { align: "center" });
    celda(ix + wc + wn, y, wv, RH, money(v), { align: "center" });
    y += RH;
  });
  celda(ix, y, wc, RH, "Total Efectivo", { align: "center", fill: [221, 221, 221] });
  celda(ix + wc, y, wn + wv, RH, money(cuadre.totalEfectivo)); y += RH;
  celda(ix, y, wc, RH, "Total a Legalizar", { align: "center", fill: [221, 221, 221] });
  celda(ix + wc, y, wn + wv, RH, money(cuadre.totalALegalizar)); y += RH;

  y += 6;
  pdf.setLineWidth(LINE);
  pdf.rect(X, top, W, y - top);

  /* --- nota (si no cuadra, queda escrita la diferencia) --- */
  y += 14;
  const diff = Math.round(cuadre.valorTotalPlanilla - cuadre.totalALegalizar);
  const wl = 0.18 * W;
  celda(X, y, wl, 15, "NOTA:", { size: 13, align: "center" });
  pdf.rect(X + wl, y, W - wl, 15);
  if (diff) {
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text(`Diferencia de ${money(diff)} entre el total a legalizar y el valor total de la planilla.`, X + wl + 2, y + 7.5, { baseline: "middle", maxWidth: W - wl - 4 });
  }
  y += 15;

  /* --- dinero entregado en caja + firmas --- */
  y += 2 + 4;
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12);
  pdf.text("Dinero entregado en caja:", X + 5, y, { baseline: "middle" });
  const xs = X + 5 + pdf.getTextWidth("Dinero entregado en caja:") + 3;
  pdf.setFont("helvetica", "normal");
  pdf.text("$", xs, y, { baseline: "middle" });
  pdf.line(xs + 4, y + 3.5, X + W - 5, y + 3.5);

  y += 3.5 + 17;
  const sw = 0.46 * W;
  [[X, "RECIBIDO LOGISTICA"], [X + W - sw, "RECIBIDO CAJA"]].forEach(([x, t]) => {
    pdf.line(x, y, x + sw, y);
    pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
    pdf.text(t, x + sw / 2, y + 7 + 2, { align: "center", baseline: "middle" });
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
