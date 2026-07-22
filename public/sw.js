// Service worker minimal : suffisant pour rendre Élan installable (PWA).
// Un handler 'fetch' (même passif) est requis par certains navigateurs pour
// proposer l'installation. Socle pour de l'offline / des notifs plus tard.

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Passthrough réseau. Pas de cache pour l'instant.
});
