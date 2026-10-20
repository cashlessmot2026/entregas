import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";

/* Inserta en dist/sw.js un id de build (cada despliegue invalida la caché anterior)
   y la lista de archivos js/css para precargarlos y que todo funcione offline. */
function swVersion() {
  return {
    name: "sw-version",
    apply: "build",
    closeBundle() {
      const file = path.resolve("dist/sw.js");
      if (!fs.existsSync(file)) return;
      const id = new Date().toISOString().replace(/[-:.TZ]/g, "");
      const assets = fs.readdirSync(path.resolve("dist/assets")).map((f) => "./assets/" + f);
      const src = fs.readFileSync(file, "utf8")
        .replace("__BUILD_ID__", id)
        .replace("const ASSETS = [];", "const ASSETS = " + JSON.stringify(assets) + ";");
      fs.writeFileSync(file, src);
    }
  };
}

export default defineConfig({
  // rutas relativas: la app funciona en la raíz del dominio o en una subcarpeta
  base: "./",
  plugins: [react(), swVersion()],
  build: {
    target: "es2019",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"]
        }
      }
    }
  }
});
