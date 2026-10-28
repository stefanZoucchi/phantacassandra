// Service worker: installabilità PWA + data.json network-first (fallback cache).
const CACHE = "pc-v2";
self.addEventListener("install", e => {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(["./", "./index.html", "./data.json"]).catch(() => {})));
});
self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener("fetch", e => {
  const u = e.request.url;
  // dati sempre freschi dalla rete; se offline usa l'ultimo data.json in cache
  if (u.includes("data.json")) {
    e.respondWith(
      fetch(e.request, { cache: "no-store" })
        .then(r => {
          const copy = r.clone();
          caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
          return r;
        })
        .catch(() => caches.match(e.request))
    );
    return;
  }
  // asset statici: cache fallback
  if (e.request.method === "GET" && (u.endsWith(".html") || u.endsWith(".js") || u.endsWith(".png") || u.endsWith(".webmanifest"))) {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      }).catch(() => caches.match(e.request))
    );
  }
});
