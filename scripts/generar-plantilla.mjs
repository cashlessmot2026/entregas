// Genera public/plantilla_facturas_ruta.xlsx (también se descarga desde la app)
import * as XLSX from "xlsx";
import fs from "node:fs";
import { PLANTILLA_EJEMPLO, } from "../src/lib/excel.js";
import { PLANTILLA_COLUMNAS } from "../src/lib/constants.js";

const ws = XLSX.utils.aoa_to_sheet(PLANTILLA_EJEMPLO, { cellDates: true });
ws["!cols"] = PLANTILLA_COLUMNAS.map((c) => ({ wch: Math.max(16, c.length + 4) }));
const wb = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
fs.writeFileSync("public/plantilla_facturas_ruta.xlsx", XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
console.log("OK -> public/plantilla_facturas_ruta.xlsx");
