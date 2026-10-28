// Service worker minimo: serve solo per rendere PhantaCassandra installabile come app.
// Non salva nulla in cache: i dati arrivano sempre freschi dal sito.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', () => {});
