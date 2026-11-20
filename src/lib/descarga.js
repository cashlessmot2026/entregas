/* Entrega de archivos generados (PDF/JPG/Excel).
   - En el navegador: descarga normal.
   - En el APK (WebView de Android) las descargas por <a download> y window.print() NO funcionan:
     se guarda el archivo en la caché de la app y se abre el menú "Compartir" del celular
     (desde ahí se imprime, se guarda en Archivos o se envía por WhatsApp). */
import { Capacitor } from "@capacitor/core";

export const esApp = () => {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
};

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] || "");
    r.onerror = () => reject(r.error || new Error("No se pudo leer el archivo"));
    r.readAsDataURL(blob);
  });
}

/* Devuelve true si se entregó, false si el usuario canceló el menú de compartir */
export async function entregarArchivo(blob, filename) {
  if (esApp()) {
    const { Filesystem, Directory } = await import("@capacitor/filesystem");
    const { Share } = await import("@capacitor/share");
    const data = await blobToBase64(blob);
    const saved = await Filesystem.writeFile({ path: filename, data, directory: Directory.Cache });
    try {
      await Share.share({ title: filename, dialogTitle: "Guardar o imprimir " + filename, url: saved.uri });
    } catch (e) {
      if (/cancel/i.test(String(e && (e.message || e)))) return false;
      throw e;
    }
    return true;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}

export const entregarPdf = (pdf, nombre) => entregarArchivo(pdf.output("blob"), nombre.replace(/\.pdf$/i, "") + ".pdf");
