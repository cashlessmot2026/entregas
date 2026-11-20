/* Exportación de reportes del administrador a Excel y PDF */
import { fmtMoney } from "./analytics.js";

/* Definición de cada reporte: título, columnas y filas */
export function buildReport(kind, { ranking, clientes, detalle, resumen }, rango) {
  const defs = {
    ranking: {
      titulo: "Ranking de auxiliares",
      cols: ["Puesto", "Auxiliar", "Rutas", "Facturas", "Entregadas", "Dev. parciales", "Dev. totales", "% Efectividad", "% Devolución", "Unidades devueltas", "Valor devuelto"],
      filas: ranking.map((a) => [a.puesto, a.auxiliar, a.rutas, a.facturas, a.entregadas, a.devParciales, a.devTotales, a.pctEfectividad + "%", a.pctDevolucion + "%", a.unidades, a.valorDev]),
      money: [10]
    },
    clientes: {
      titulo: "Clientes con más devoluciones",
      cols: ["Cliente", "Facturas con devolución", "Unidades devueltas", "Valor devuelto", "Última devolución", "Auxiliares"],
      filas: clientes.map((c) => [c.cliente, c.facturas, c.unidades, c.valor, c.ultima, c.auxiliares]),
      money: [3]
    },
    devoluciones: {
      titulo: "Detalle de devoluciones",
      cols: ["Fecha", "Auxiliar", "Planilla", "Vehículo", "Cliente", "Factura", "Tipo", "Causal", "Producto", "Cantidad", "Valor"],
      filas: detalle.map((d) => [d.fecha, d.auxiliar, d.planilla, d.placa, d.cliente, d.factura, d.tipo, d.causal, d.producto, d.cantidad, d.valor]),
      money: [10]
    },
    resumen: {
      titulo: "Resumen general",
      cols: ["Indicador", "Valor"],
      filas: [
        ["Rutas", resumen.rutas], ["Facturas", resumen.facturas], ["Entregadas", resumen.entregadas], ["Pendientes", resumen.pendientes],
        ["Facturas con devolución", resumen.conDevolucion], ["Clientes con novedad", resumen.clientesNovedad],
        ["Unidades devueltas", resumen.unidadesDevueltas], ["Valor devuelto", resumen.valorDevuelto],
        ["Valor facturado", resumen.valorFacturado], ["Efectividad", resumen.efectividad + "%"]
      ],
      money: []
    }
  };
  const d = defs[kind];
  return { ...d, subtitulo: rango };
}

const nombreArchivo = (kind) => "reporte_" + kind + "_" + new Date().toISOString().slice(0, 10);

export async function exportarExcel(kinds, data, rango) {
  const XLSX = await import("xlsx");
  const wb = XLSX.utils.book_new();
  kinds.forEach((kind) => {
    const r = buildReport(kind, data, rango);
    const aoa = [[r.titulo], [r.subtitulo], [], r.cols, ...r.filas];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = r.cols.map((c, i) => ({ wch: Math.max(12, c.length + 2, ...r.filas.slice(0, 80).map((f) => String(f[i] ?? "").length + 2)) }));
    XLSX.utils.book_append_sheet(wb, ws, r.titulo.slice(0, 30));
  });
  XLSX.writeFile(wb, nombreArchivo(kinds.length > 1 ? "completo" : kinds[0]) + ".xlsx");
}

export async function exportarPdf(kinds, data, rango) {
  const { jsPDF } = await import("jspdf");
  const autoTable = (await import("jspdf-autotable")).default;
  const pdf = new jsPDF({ orientation: "landscape", unit: "pt", format: "letter" });
  const W = pdf.internal.pageSize.getWidth();
  kinds.forEach((kind, idx) => {
    const r = buildReport(kind, data, rango);
    if (idx > 0) pdf.addPage();
    pdf.setFillColor(19, 53, 143);
    pdf.rect(0, 0, W, 54, "F");
    pdf.setTextColor(255);
    pdf.setFontSize(15); pdf.setFont("helvetica", "bold");
    pdf.text("LICONSUMAR Del Magdalena — " + r.titulo, 28, 25);
    pdf.setFontSize(9.5); pdf.setFont("helvetica", "normal");
    pdf.text(r.subtitulo + "  ·  Generado " + new Date().toLocaleString("es-CO"), 28, 42);
    const filas = r.filas.map((f) => f.map((v, i) => (r.money.includes(i) ? fmtMoney(v) : v ?? "")));
    autoTable(pdf, {
      head: [r.cols], body: filas, startY: 66, theme: "striped",
      styles: { fontSize: 8, cellPadding: 4 },
      headStyles: { fillColor: [47, 107, 255], textColor: 255 },
      alternateRowStyles: { fillColor: [243, 246, 255] },
      margin: { left: 28, right: 28 }
    });
  });
  pdf.save(nombreArchivo(kinds.length > 1 ? "completo" : kinds[0]) + ".pdf");
}

/* Plantilla de auxiliares */
export async function descargarPlantillaAux() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([
    ["Nombre", "Usuario", "PIN", "Teléfono"],
    ["SANCHEZ ARIÑA JESUS DAVID", "jsanchez", "1234", "3001234567"],
    ["VERDE GREIBI", "gverde", "5678", ""]
  ]);
  ws["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 8 }, { wch: 16 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Auxiliares");
  XLSX.writeFile(wb, "plantilla_auxiliares.xlsx");
}

/* Lee el Excel/CSV de auxiliares: columnas Nombre, Usuario, PIN, Teléfono */
export async function leerAuxiliaresExcel(file) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const norm = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
  const pick = (row, ...names) => {
    const k = Object.keys(row).find((c) => names.includes(norm(c)));
    return k ? String(row[k]).trim() : "";
  };
  return rows
    .map((r) => ({
      nombre: pick(r, "nombre", "auxiliar", "nombrecompleto"),
      usuario: pick(r, "usuario", "user", "login"),
      pin: pick(r, "pin", "clave", "contrasena", "password").padStart(4, "0").slice(-4),
      telefono: pick(r, "telefono", "celular", "tel")
    }))
    .filter((r) => r.nombre || r.usuario);
}
