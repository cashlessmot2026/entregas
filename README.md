# Rutas LICONSUMAR — v2 (React + PWA)

## Qué subir

Sube **el contenido de la carpeta `dist/`** (no la carpeta del proyecto) a tu hosting
(Netlify, Vercel, GitHub Pages, Firebase Hosting, cPanel...). Debe servirse por **HTTPS**
para que se pueda instalar como app.

- Netlify / Vercel conectados al repositorio: comando de build `npm run build`, carpeta de publicación `dist`.
- Funciona en la raíz del dominio o en una subcarpeta.

## Comandos

```
npm install        # una sola vez
npm run dev        # probar en el computador (http://localhost:5173)
npm run build      # genera dist/ para subir
npm run preview    # probar el build final
```

## Supabase

Ejecuta `supabase/schema.sql` en Supabase → SQL Editor. Crea/actualiza las tablas
`rutas`, `facturas`, `devoluciones`, `reenvios` y permisos (la app solo inserta).
Si al guardar no hay internet, la ruta queda en el equipo y se sube sola al volver la conexión.

## Plantilla de carga

El reporte "RUTA - aaaa-mm-dd.xls" se carga tal cual. Se leen solo:
`Fecha planilla, Vehículo, Nombre conductor, Nro documento, Desc. sucursal despacho (cliente),
Nombre vendedor, Nro documento planilla`. Si trae varias planillas, el auxiliar elige la suya.

## Estructura

```
index.html                 entrada de Vite
public/                    manifest, service worker, íconos, logo, plantilla
src/main.jsx               arranque + registro del service worker
src/App.jsx                layout, navegación, guardar ruta
src/store.jsx              estado global y acciones (reemplaza el state + render*() del HTML viejo)
src/lib/                   cálculos, Excel, Supabase, exportar PDF/JPG, IndexedDB
src/components/            login, menú, modales (firma, escáner)
src/sections/              una pantalla por sección
supabase/schema.sql        esquema de base de datos
legacy/index.original.html versión anterior (respaldo)
```
