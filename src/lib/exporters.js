/* Exportar a JPG / PDF (html2canvas + jsPDF, tamaño carta). Se cargan solo cuando se usan. */
import { escapeHtml, money } from "./utils.js";
import { facturaValor, facturaTotalDescuentos, facturaDevParcialValor, facturaSaldoAPagar } from "./calc.js";
import { FORMA_MIXTA } from "./constants.js";

async function nodeToCanvas(node) {
  const { default: html2canvas } = await import("html2canvas");
  return html2canvas(node, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
}

export async function exportNodeAsJpg(node, filename) {
  const canvas = await nodeToCanvas(node);
  const link = document.createElement("a");
  link.download = filename + ".jpg";
  link.href = canvas.toDataURL("image/jpeg", 0.95);
  link.click();
}

export async function exportNodeAsPdf(node, filename) {
  const canvas = await nodeToCanvas(node);
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const pageW = pdf.internal.pageSize.getWidth() - 40;
  const pageH = pdf.internal.pageSize.getHeight() - 40;
  const ratio = Math.min(pageW / canvas.width, pageH / canvas.height);
  pdf.addImage(canvas.toDataURL("image/jpeg", 0.95), "JPEG", 20, 20, canvas.width * ratio, canvas.height * ratio);
  pdf.save(filename + ".pdf");
}

const row = (label, value) =>
  `<tr><td style="padding:4px 6px;border:1px solid #ddd;color:#555;">${label}</td><td style="padding:4px 6px;border:1px solid #ddd;text-align:right;">${value}</td></tr>`;

/* Comprobante de entrega de una factura (sin productos) */
export function buildFacturaPrintNode(f, route, devoluciones) {
  const total = facturaValor(f);
  const saldo = facturaSaldoAPagar(f, devoluciones);
  const devVal = facturaDevParcialValor(f, devoluciones);
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;left:-9999px;top:0;width:612px;background:#fff;padding:24px;font-family:Arial,sans-serif;color:#1a1a1a;";
  div.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #0f6b3f;padding-bottom:10px;margin-bottom:12px;">
      <img src="./logo.png" style="height:48px;">
      <div style="text-align:right;font-size:12px;">
        <div style="font-weight:bold;font-size:16px;">LICONSUMAR Del Magdalena</div>
        <div>Comprobante de entrega</div>
      </div>
    </div>
    <div style="font-size:13px;line-height:1.6;">
      <b>Factura:</b> ${escapeHtml(f.numero)} &nbsp;|&nbsp; <b>Cliente:</b> ${escapeHtml(f.cliente || "-")}<br>
      <b>Sucursal despacho:</b> ${escapeHtml(f.sucursal || "-")} &nbsp;|&nbsp; <b>Vendedor:</b> ${escapeHtml(f.vendedor || "-")}<br>
      ${f.direccion ? `<b>Dirección:</b> ${escapeHtml(f.direccion)}${f.ciudad ? ", " + escapeHtml(f.ciudad) : ""}<br>` : ""}
      <b>Fecha:</b> ${escapeHtml(f.fecha || route.fecha)} &nbsp;|&nbsp; <b>Vehículo:</b> ${escapeHtml(route.placa)} &nbsp;|&nbsp; <b>Planilla:</b> ${escapeHtml(f.planilla || route.planilla)}<br>
      <b>Conductor:</b> ${escapeHtml(route.conductor || "-")} &nbsp;|&nbsp; <b>Auxiliar:</b> ${escapeHtml(route.auxiliar || "-")}<br>
      <b>Forma de pago:</b> ${escapeHtml(f.formaPago || "-")} &nbsp;|&nbsp; <b>Estado:</b> ${escapeHtml(f.estado)}${f.causal ? " (" + escapeHtml(f.causal) + ")" : ""}
    </div>
    <table style="width:100%;border-collapse:collapse;margin-top:12px;font-size:12.5px;">
      ${row("Valor factura", money(total))}
      ${(f.descuentos || []).map((d) => row("Descuento — " + escapeHtml(d.concepto), "-" + money(d.valor))).join("")}
      ${f.retencion ? row("Retención", "-" + money(f.retencion)) : ""}
      ${f.saldoFavor ? row("Saldo a favor", "-" + money(f.saldoFavor)) : ""}
      ${devVal && f.estado === "Dev Parcial" ? row("Devolución parcial", "-" + money(devVal)) : ""}
      ${f.formaPago === FORMA_MIXTA ? row("Pagado en transferencia", money(f.mixtoTransferencia)) + row("Pagado en efectivo", money(f.mixtoEfectivo)) : ""}
      <tr><td style="padding:6px;border:1px solid #ddd;font-weight:bold;background:#eef6f1;">Saldo a pagar</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-weight:bold;font-size:15px;background:#eef6f1;">${money(saldo)}</td></tr>
    </table>
    <div style="font-size:11px;color:#666;margin-top:4px;">Total descuentos: ${money(facturaTotalDescuentos(f))}</div>
    ${f.observaciones ? `<div style="margin-top:8px;font-size:12px;"><b>Observaciones:</b> ${escapeHtml(f.observaciones)}</div>` : ""}
    ${f.firma ? `<div style="margin-top:14px;"><div style="font-size:11px;color:#666;">Firma del cliente:</div><img src="${f.firma}" style="height:70px;border-bottom:1px solid #999;"></div>` : ""}
  `;
  document.body.appendChild(div);
  return div;
}

export async function exportFactura(f, route, devoluciones, kind) {
  const node = buildFacturaPrintNode(f, route, devoluciones);
  try {
    const name = "factura_" + String(f.numero).replace(/[^\w-]/g, "");
    if (kind === "pdf") await exportNodeAsPdf(node, name);
    else await exportNodeAsJpg(node, name);
  } finally {
    node.remove();
  }
}

export function printWithClass(cls) {
  document.body.classList.add(cls);
  window.print();
  setTimeout(() => document.body.classList.remove(cls), 500);
}
