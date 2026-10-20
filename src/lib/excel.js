/* Carga del reporte de rutas (ej. "RUTA - 2026-10-17.xls").
   Solo se leen: Fecha planilla, Vehículo, Nombre conductor, Nro documento,
   Desc. sucursal despacho (= nombre del cliente), Nombre vendedor, Nro documento planilla.
   El resto de columnas se ignora. Un mismo archivo puede traer varias planillas
   (una por vehículo): se agrupan para que el auxiliar elija la suya. */
import { normHeader, uid, num } from "./utils.js";
import { PLANTILLA_COLUMNAS } from "./constants.js";

const loadXlsx = () => import("xlsx");

const HEADER_CANDIDATES = {
  fecha: ["fecha", "fechadocumento", "fechafactura", "fechadespacho", "fechaplanilla"],
  vehiculo: ["vehiculo", "placa", "placavehiculo", "vehiculoplaca"],
  conductor: ["nombreconductor", "conductor", "nomconductor"],
  documento: ["nrodocumento", "numerodocumento", "nodocumento", "numdocumento", "documento", "numerofactura", "factura", "nrofactura"],
  sucursal: ["descsucursaldespacho", "sucursaldespacho", "descsucursal", "sucursal", "sucursalcliente"],
  vendedor: ["nombrevendedor", "vendedor", "nomvendedor", "asesor", "asesorcomercial"],
  planilla: ["nrodocumentoplanilla", "numerodocumentoplanilla", "documentoplanilla", "numeroplanilla", "nroplanilla", "noplanilla", "planilla", "numplanilla"]
};

/* Algunos reportes traen títulos arriba: se busca la fila que tenga los encabezados */
function findHeaderRow(matrix) {
  const all = new Set(Object.values(HEADER_CANDIDATES).flat());
  let best = { idx: -1, hits: 0 };
  matrix.slice(0, 25).forEach((row, idx) => {
    const hits = row.filter((c) => all.has(normHeader(c))).length;
    if (hits > best.hits) best = { idx, hits };
  });
  return best.hits >= 2 ? best.idx : -1;
}

function resolveColumns(headerRow) {
  const norm = headerRow.map(normHeader);
  const cols = {};
  Object.entries(HEADER_CANDIDATES).forEach(([field, cands]) => {
    // prioridad al candidato más específico (orden de la lista)
    const found = cands.map((c) => norm.indexOf(c)).find((i) => i >= 0);
    cols[field] = found === undefined ? -1 : found;
  });
  return cols;
}

function formatFecha(v) {
  if (v instanceof Date && !isNaN(v)) {
    return v.getFullYear() + "-" + String(v.getMonth() + 1).padStart(2, "0") + "-" + String(v.getDate()).padStart(2, "0");
  }
  const s = String(v || "").trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/); // dd/mm/aaaa
  if (m) return m[3] + "-" + m[2].padStart(2, "0") + "-" + m[1].padStart(2, "0");
  return s.slice(0, 10);
}

const cleanDoc = (v) => String(v == null ? "" : v).trim().replace(/\.0+$/, "");

export async function parsePlanillaExcel(file) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const matrix = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "", raw: true });
  if (!matrix.length) throw new Error("El archivo está vacío");

  const hIdx = findHeaderRow(matrix);
  if (hIdx < 0) throw new Error("No se encontraron los encabezados de la plantilla (" + PLANTILLA_COLUMNAS.join(", ") + ")");
  const cols = resolveColumns(matrix[hIdx]);
  if (cols.documento < 0) throw new Error("Falta la columna NUMERO DOCUMENTO");

  const get = (row, field) => (cols[field] >= 0 ? row[cols[field]] : "");
  const grupos = new Map(); // planilla -> { route, facturas }
  const vistos = new Set();

  matrix.slice(hIdx + 1).forEach((row) => {
    const numero = cleanDoc(get(row, "documento"));
    if (!numero) return;
    // un documento puede venir repetido (una fila por producto): se toma una sola vez
    if (vistos.has(numero)) return;
    vistos.add(numero);
    const planilla = cleanDoc(get(row, "planilla"));
    const placa = String(get(row, "vehiculo") || "").trim().toUpperCase();
    const key = planilla || placa || "SIN PLANILLA";
    if (!grupos.has(key)) {
      grupos.set(key, {
        key,
        route: { fecha: formatFecha(get(row, "fecha")), placa, conductor: String(get(row, "conductor") || "").trim(), planilla },
        facturas: []
      });
    }
    const sucursal = String(get(row, "sucursal") || "").trim();
    grupos.get(key).facturas.push({
      id: uid("fac"),
      numero,
      fecha: formatFecha(get(row, "fecha")),
      sucursal,
      planilla,
      cliente: sucursal, // "Desc. sucursal despacho" es el nombre del cliente
      vendedor: String(get(row, "vendedor") || "").trim().toUpperCase(),
      direccion: "",
      barrio: "",
      ciudad: "",
      telefono: "",
      valorFactura: 0,
      descuentos: [],
      retencion: 0,
      saldoFavor: 0,
      formaPago: "",
      mixtoTransferencia: 0,
      mixtoEfectivo: 0,
      transferenciaFoto: null,
      estado: "OK",
      causal: "",
      firma: null,
      observaciones: "",
      confirmada: false
    });
  });

  if (!grupos.size) throw new Error("No se encontró ninguna factura en la columna Nro documento");
  // [{ key, route:{fecha,placa,conductor,planilla}, facturas:[...] }] — una entrada por planilla
  return Array.from(grupos.values());
}

export const PLANTILLA_EJEMPLO = [
  PLANTILLA_COLUMNAS,
  [new Date(2026, 9, 16), "BHK744", "LOPEZ SANCHEZ VICTOR HUGO", "FVE-00110716", "INVERSIONES Y CONSTRUCCIONES 3H SAS", "BARROS ROCA JULIETH PAOLA", "1PL-00004853"],
  [new Date(2026, 9, 16), "BHK744", "LOPEZ SANCHEZ VICTOR HUGO", "FVE-00110798", "COURTYARD BY MARRIOTT SANTA MARTA", "BARROS ROCA JULIETH PAOLA", "1PL-00004853"]
];

export async function descargarPlantilla() {
  const XLSX = await loadXlsx();
  const ws = XLSX.utils.aoa_to_sheet(PLANTILLA_EJEMPLO, { cellDates: true });
  ws["!cols"] = PLANTILLA_COLUMNAS.map((c) => ({ wch: Math.max(16, c.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Planilla");
  XLSX.writeFile(wb, "plantilla_facturas_ruta.xlsx");
}

/* ---------- Productos (sección 6, se conserva igual) ---------- */
export async function parseProductosExcel(file, startIndex) {
  const XLSX = await loadXlsx();
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array" });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
  const out = [];
  rows.forEach((r) => {
    const nombre = r["PRODUCTO/REFERENCIA"] || r["PRODUCTO"] || r["producto"] || r["Producto"] || "";
    const valor = r["valor unitario"] || r["VALOR UNITARIO"] || r["Valor Unitario"] || r["valorUnitario"] || 0;
    const barras = r["CODIGO DE BARRAS"] || r["codigo_barras"] || r["Codigo Barras"] || "";
    if (!nombre) return;
    out.push({
      codigo: "P" + String(startIndex + out.length + 1).padStart(4, "0"),
      nombre: String(nombre).trim(),
      valorUnitario: num(valor),
      codigoBarras: String(barras || "")
    });
  });
  return out;
}
