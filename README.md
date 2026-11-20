# Rutas LICONSUMAR — v3 (React + PWA + Panel Administrador)

## Puesta en marcha (una sola vez)

1. En **Supabase** (proyecto `ufhnijlxtvuonxchdwdx`) → SQL Editor → pega y ejecuta todo `supabase/schema.sql`.
   Crea tablas, seguridad y las funciones que usa la app. **Contraseña inicial del administrador: `1234`**
   (cámbiala en Panel → Configuración).
2. `npm install` y `npm run build`. Se publica solo en GitHub Pages con cada push a `main`
   (`.github/workflows/deploy.yml`), o sube el contenido de `dist/` a cualquier hosting HTTPS.

La app usa la llave pública (publishable) de Supabase; las tablas no son accesibles con ella:
todo pasa por funciones RPC que validan la contraseña del admin o el usuario + PIN del auxiliar.

## Flujo

**Administrador** (pestaña "Administrador" en el login):
- **Rutas**: sube el reporte `RUTA - aaaa-mm-dd.xls`; cada planilla se asigna al auxiliar cuyo nombre
  coincide con "Nombre conductor". Si el auxiliar se crea después, la ruta se le asigna sola.
- **Auxiliares**: crear individual (nombre, usuario, PIN de 4 dígitos) o subir Excel (Nombre, Usuario, PIN, Teléfono).
- **Dashboard**: KPIs, entregas vs devoluciones por día, vehículos en operación, mejores entregadores,
  estado de facturas, actividad reciente y mapa GPS de entregas.
- **Reportes**: ranking de auxiliares, clientes con más devoluciones, detalle de devoluciones
  (auxiliar, fecha, planilla, vehículo, causal, producto, unidades, valor). Descarga en **PDF y Excel**.
- **Configuración**: cambiar la contraseña del administrador.

**Auxiliar** (usuario + PIN): ve su ruta asignada (placa, planilla, facturas), confirma entregas, registra
devoluciones, cuadre, reenvíos, etc. (igual que antes).
- GPS opcional: guarda la ubicación del cliente al confirmar la entrega y habilita el botón **Navegar**.
- Casilla **combos / obsequios**: el cliente debe firmar antes de confirmar (igual que en devoluciones).
- El avance se sincroniza solo; "Guardar ruta y comenzar nueva" cierra la ruta con firmas y comprobantes.

## Comandos

```
npm install        # una sola vez
npm run dev        # http://localhost:5173
npm run build      # genera dist/
```

## Estructura

```
src/App.jsx            enrutado: login → admin (lazy) o app del auxiliar
src/admin/             panel del administrador (dashboard, rutas, auxiliares, reportes, config)
src/lib/supabase.js    RPC de admin y auxiliar, guardado y cola offline
src/sections, components   app del auxiliar
supabase/schema.sql    tablas + funciones (ejecutar en el proyecto nuevo)
legacy/                versión original (respaldo)
```

## APK de Android

Proyecto Capacitor en `android/` (paquete `com.liconsumar.rutas`). Requiere JDK 21 y el SDK de Android:

```
npm run apk        # genera android/app/build/outputs/apk/debug/app-debug.apk
```

Instalar en el celular: copiar el `.apk`, abrirlo y permitir "instalar apps de orígenes desconocidos".
Tras cambiar el código web hay que volver a ejecutar `npm run apk`.
