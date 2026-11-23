/* PDF tamaño carta del Cuadre de ruta y del formato de Devolución (F-GL-001).
   Se arman directamente con jsPDF a partir de los datos (no dependen de window.print ni del DOM),
   así funcionan igual en el navegador y en el APK. */
import { CUADRE_BUCKETS } from "./constants.js";
import { money } from "./utils.js";
import { entregarPdf } from "./descarga.js";

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
  /* Casilla que se ajusta al texto: si no cabe en una línea, se parte en varias y la casilla crece.
     medir() devuelve el alto necesario para que la fila entera tome el de su casilla más alta. */
  const PASO = 0.36; // mm por punto de letra entre líneas
  const medir = (w, texto, o = {}) => {
    const size = o.size || 12;
    pdf.setFont("helvetica", o.bold === false ? "normal" : "bold"); pdf.setFontSize(size);
    const lineas = texto === "" || texto == null ? [] : pdf.splitTextToSize(String(texto), w - 3);
    return { lineas, size, alto: Math.max(o.h || 0, lineas.length > 1 ? lineas.length * size * PASO + 2.4 : 0) };
  };
  const celda = (x, y, w, h, texto, o = {}) => {
    if (o.fill) { pdf.setFillColor(...o.fill); pdf.rect(x, y, w, h, "FD"); } else pdf.rect(x, y, w, h);
    if (texto === "" || texto == null) return;
    const { lineas, size } = medir(w, texto, o);
    pdf.setFont("helvetica", o.bold === false ? "normal" : "bold"); pdf.setFontSize(size);
    const align = o.align || "left";
    const tx = align === "center" ? x + w / 2 : x + 1.6;
    const paso = size * PASO;
    const y0 = y + h / 2 - ((lineas.length - 1) * paso) / 2;
    lineas.forEach((l, i) => pdf.text(l, tx, y0 + i * paso, { align, baseline: "middle" }));
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
    const cols = [[a1, 0, false], [v1, 1, true], [a2, 2, false], [v2, 3, true]];
    const h = Math.max(7, ...cols.map(([t, i]) => medir(mw[i], t, { size: 13, h: 7 }).alto));
    let x = ix;
    cols.forEach(([t, i, centro]) => {
      celda(x, y, mw[i], h, t, { size: 13, align: centro ? "center" : "left" }); x += mw[i];
    });
    y += h;
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

/* Formato "DEVOLUCION DE PEDIDOS" (F-GL-001), A4 horizontal, igual a plantilla_devolucion_pedidos_liconsumar.html.
   Todas las casillas se ajustan al texto: si no cabe, se parte en varias líneas y la fila crece.
   devoluciones = [{ fecha, placa, cliente, factura, asesor, causal, codigoProducto, descripcion, cantidad, valor, firma }]
   route = { auxiliar, conductor, placa, fecha, planilla } */
export async function pdfDevolucion(route, devoluciones, nombreArchivo) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const PW = pdf.internal.pageSize.getWidth(), PH = pdf.internal.pageSize.getHeight();
  const GRIS = [85, 85, 85];
  const X = 10, W = PW - 20;
  pdf.setLineWidth(0.3); pdf.setDrawColor(51); pdf.setTextColor(34);

  /* Casilla con texto partido en líneas. Con dibujar:false solo mide. Devuelve el alto necesario. */
  const caja = (x, y, w, h, texto, o = {}) => {
    const size = o.size || 9;
    pdf.setFont("helvetica", o.bold ? "bold" : "normal"); pdf.setFontSize(size);
    const lineas = texto ? pdf.splitTextToSize(String(texto), w - 3.4) : [];
    const paso = size * 0.38;
    const alto = Math.max(h, lineas.length > 1 ? lineas.length * paso + 2.6 : 0);
    if (o.dibujar !== false) {
      pdf.rect(x, y, w, alto);
      const y0 = y + alto / 2 - ((lineas.length - 1) * paso) / 2;
      const align = o.align || "left";
      const tx = align === "center" ? x + w / 2 : align === "right" ? x + w - 1.6 : x + 1.6;
      lineas.forEach((l, i) => pdf.text(l, tx, y0 + i * paso, { align, baseline: "middle" }));
    }
    return alto;
  };

  /* encabezado: título + marca */
  const hTop = 17;
  pdf.rect(X, 8, W, hTop);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(16);
  pdf.text("FORMATO DEVOLUCION DE PEDIDOS", X + (W - 55) / 2, 8 + hTop / 2 + 1, { align: "center", baseline: "middle" });
  const bx = X + W - 4;
  const arco = (cx, y, w, h, g) => {
    pdf.setLineWidth(g); pdf.setDrawColor(...GRIS); pdf.setLineCap("round");
    const rx = w / 2 - g / 2, ry = h - g / 2, cy = y + h;
    let prev = null;
    for (let i = 0; i <= 40; i++) {
      const t = Math.PI + (Math.PI * i) / 40;
      const pt = [cx + rx * Math.cos(t), cy + ry * Math.sin(t)];
      if (prev) pdf.line(prev[0], prev[1], pt[0], pt[1]);
      prev = pt;
    }
    pdf.setLineCap("butt"); pdf.setDrawColor(51); pdf.setLineWidth(0.3);
  };
  arco(bx - 14, 9.2, 15, 4.2, 1.1);
  pdf.setTextColor(...GRIS);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(12); pdf.text("LICONSUMAR", bx, 17.6, { align: "right" });
  pdf.setFont("helvetica", "normal"); pdf.setFontSize(8); pdf.text("Del Magdalena", bx, 20.6, { align: "right" });
  pdf.setFontSize(7); pdf.text("CODIGO F-GL-001", bx, 23.4, { align: "right" });
  pdf.setTextColor(34);

  /* causales de devolución */
  let y = 8 + hTop;
  const cw = [0.19, 0.27, 0.27, 0.27].map((f) => f * W), RH = 5.6;
  const col = (i) => X + cw.slice(0, i).reduce((a, b) => a + b, 0);
  const filasC = [
    ["1- SIN DINERO", "4- NO HIZO PEDIDO", "7- PTO PTE POR ESTAMPILLAR"],
    ["2- ERROR DE DIGITACION", "5- O.C CERRADA", "8- FECHA DE VENCIMIENTO"],
    ["3- ERROR DE DESPACHO", "6- CLIENTE AUSENTE", "9- AVERIA EN TRANSPORTE"],
    ["", "", "10- ESTABLECIMIENTO CERRADO\n11- PROBLEMAS DE CALIDAD\n12- DEV TOTAL FACTURA"]
  ];
  const alturas = filasC.map((fila) => Math.max(RH, ...fila.map((t, c) => caja(col(c + 1), 0, cw[c + 1], RH, t, { dibujar: false }))));
  const hC = alturas.reduce((a, b) => a + b, 0);
  pdf.rect(col(0), y, cw[0], hC);
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(9);
  pdf.text("CAUSALES DE", col(0) + cw[0] / 2, y + hC / 2 - 1.8, { align: "center", baseline: "middle" });
  pdf.text("DEVOLUCION", col(0) + cw[0] / 2, y + hC / 2 + 1.8, { align: "center", baseline: "middle" });
  let yy = y;
  filasC.forEach((fila, r) => { fila.forEach((t, c) => caja(col(c + 1), yy, cw[c + 1], alturas[r], t)); yy += alturas[r]; });
  y += hC;

  /* fecha / placa: las casillas crecen con el texto */
  const fw = [0.19, 0.37, 0.12, 0.32].map((f) => f * W);
  const fcol = (i) => X + fw.slice(0, i).reduce((a, b) => a + b, 0);
  const vals = ["FECHA:", route.fecha || "", "PLACA:", route.placa || ""];
  const hF = Math.max(7, ...vals.map((t, i) => caja(fcol(i), y, fw[i], 7, t, { bold: true, size: 10, dibujar: false })));
  vals.forEach((t, i) => caja(fcol(i), y, fw[i], hF, t, { bold: true, size: 10, align: i === 2 ? "right" : "left" }));
  y += hF;

  /* registros: mínimo 12 filas y crece con el texto (varias páginas si hace falta) */
  const filas = devoluciones.map((d) => {
    const m = /^\s*(\d+)/.exec(d.causal || "");
    return [d.cliente || "", d.factura || "", d.asesor || "", m ? m[1] : d.causal || "", d.codigoProducto || "", d.descripcion || "",
      d.cantidad === "" || d.cantidad == null ? "" : String(d.cantidad), ""];
  });
  while (filas.length < 12) filas.push(["", "", "", "", "", "", "", ""]);
  const firmas = devoluciones.map((d) => d.firma || null);
  const pct = [20, 8, 15, 6, 7, 21, 8, 15];
  autoTable(pdf, {
    head: [["CLIENTE", "FACTURA", "ASESOR COMERCIAL", "CAUSAL", "CODIGO\nPRODUCTO", "DESCRIPCION", "CANTIDAD\nBOTELLAS", "FIRMA DE CLIENTE"]],
    body: filas, startY: y, theme: "grid", tableWidth: W,
    margin: { left: X, right: X, top: 8, bottom: 22 },
    styles: { font: "helvetica", fontSize: 9, cellPadding: { top: 1.2, bottom: 1.2, left: 1.6, right: 1.6 }, minCellHeight: 8.6, valign: "middle",
      lineColor: [51, 51, 51], lineWidth: 0.3, textColor: [34, 34, 34], overflow: "linebreak" },
    headStyles: { fillColor: [255, 255, 255], textColor: [34, 34, 34], fontStyle: "bold", fontSize: 7.5, halign: "center", minCellHeight: 9 },
    columnStyles: Object.fromEntries(pct.map((p, i) => [i, { cellWidth: (p / 100) * W, ...(i === 3 || i === 6 ? { halign: "center" } : {}) }])),
    didDrawCell: (h) => {
      if (h.section === "body" && h.column.index === 7 && firmas[h.row.index]) {
        const img = firmas[h.row.index];
        try { pdf.addImage(img, /image\/jpe?g/i.test(img) ? "JPEG" : "PNG", h.cell.x + 1.5, h.cell.y + 1, h.cell.width - 3, h.cell.height - 2); } catch { /* firma inválida: se omite */ }
      }
    }
  });

  /* firmas (la de quien entrega lleva el nombre del auxiliar/conductor, en varias líneas si es largo) */
  let fin = (pdf.lastAutoTable && pdf.lastAutoTable.finalY) || y + 100;
  const quien = route.auxiliar || route.conductor || "";
  pdf.setFont("helvetica", "bold"); pdf.setFontSize(10);
  const lq = pdf.splitTextToSize(quien ? "FIRMA DE QUIEN ENTREGA - " + quien : "FIRMA DE QUIEN ENTREGA", W / 2 - 6);
  const hS = Math.max(16, lq.length * 4.4 + 9);
  if (fin + hS > PH - 6) { pdf.addPage(); fin = 8; }
  pdf.rect(X, fin, W / 2, hS);
  pdf.rect(X + W / 2, fin, W / 2, hS);
  pdf.text("FIRMA RESPONSABLE DE RECIBO", X + W / 4, fin + hS - 3, { align: "center" });
  lq.forEach((l, i) => pdf.text(l, X + W * 0.75, fin + hS - 3 - (lq.length - 1 - i) * 4.4, { align: "center" }));
  return entregarPdf(pdf, nombreArchivo || `devolucion_${route.placa || "ruta"}_${route.fecha || ""}`);
}
