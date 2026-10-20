/* Service worker — Rutas LICONSUMAR
   - Navegación: red primero, si no hay señal usa la copia en caché (funciona offline).
   - Archivos de la app (js/css/imágenes): caché primero, se actualizan en segundo plano.
   - Supabase, Google Maps y demás dominios externos: siempre a la red. */
const CACHE = "rutas-__BUILD_ID__";
const CORE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./logo.png",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/favicon-48.png",
  "./plantilla_facturas_ruta.xlsx"
];
/* lista de js/css del build, la inserta vite.config.js */
const ASSETS = [];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.concat(ASSETS))));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html"))
    );
    return;
  }

  event.respondWith(
    caches.match(req).then((cached) => {
      const network = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || network;
    })
  );
});
