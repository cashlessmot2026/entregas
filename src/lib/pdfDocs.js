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

/* cuadre = { buckets: { [concepto]: { count, valor } }, valorTotalPlanilla, ctaTotalFacturas, totalEfectivo, totalALegalizar }
   route  = { auxiliar, conductor, placa, fecha, planilla } */
export async function pdfCuadre(route, cuadre, nombreArchivo) {
  const { pdf, autoTable, W } = await nuevoPdf("portrait");
  const y0 = encabezado(pdf, W, "Cuadre de ruta", [
    `Auxiliar: ${route.auxiliar || "-"}      Conductor: ${route.conductor || "-"}`,
    `Vehículo: ${route.placa || "-"}      Fecha: ${route.fecha || "-"}      Planilla: ${route.planilla || "-"}`,
    `Valor total planilla: ${money(cuadre.valorTotalPlanilla)}      Cta. total facturas: ${cuadre.ctaTotalFacturas}`
  ]);
  const body = CUADRE_BUCKETS.map((b) => {
    const x = cuadre.buckets[b] || { count: 0, valor: 0 };
    return [b, String(x.count), money(x.valor)];
  });
  body.push([{ content: "Total Efectivo", styles: { fontStyle: "bold" } }, "", { content: money(cuadre.totalEfectivo), styles: { fontStyle: "bold" } }]);
  body.push([
    { content: "Total a Legalizar", styles: { fontStyle: "bold", fillColor: [224, 233, 255] } },
    { content: "", styles: { fillColor: [224, 233, 255] } },
    { content: money(cuadre.totalALegalizar), styles: { fontStyle: "bold", fillColor: [224, 233, 255] } }
  ]);
  autoTable(pdf, {
    head: [["Concepto", "Cta. Facturas", "Valor"]], body, startY: y0, theme: "grid",
    styles: { fontSize: 10, cellPadding: 6 },
    headStyles: { fillColor: AZUL, textColor: 255 },
    columnStyles: { 1: { halign: "center" }, 2: { halign: "right" } },
    margin: { left: 32, right: 32 }
  });
  const fin = (pdf.lastAutoTable && pdf.lastAutoTable.finalY) || y0 + 300;
  const diff = Math.round(cuadre.valorTotalPlanilla - cuadre.totalALegalizar);
  pdf.setFontSize(10);
  if (Math.abs(diff) < 1) { pdf.setTextColor(21, 128, 61); pdf.text("Cuadre correcto: el total a legalizar coincide con el valor total de la planilla.", 32, fin + 22); }
  else { pdf.setTextColor(180, 83, 9); pdf.text(`Hay una diferencia de ${money(diff)} entre el total a legalizar y el valor total de la planilla.`, 32, fin + 22); }
  pdf.setTextColor(30);
  const fy = Math.min(fin + 90, pdf.internal.pageSize.getHeight() - 60);
  pdf.line(32, fy, 240, fy); pdf.line(W - 240, fy, W - 32, fy);
  pdf.setFontSize(9);
  pdf.text("Firma auxiliar", 32, fy + 12); pdf.text("Firma quien recibe", W - 240, fy + 12);
  pie(pdf);
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
