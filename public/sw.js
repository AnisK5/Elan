// Service worker : PWA + notifications rituel (push + clic).

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // Passthrough réseau.
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Élan",
    body: "Ton créneau est prêt.",
    url: "/?ritual=1",
    tag: "elan-ritual-morning",
  };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    // garde le défaut
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      tag: payload.tag,
      icon: "/icon.svg",
      badge: "/icon.svg",
      data: { url: payload.url || "/?ritual=1" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url =
    (event.notification.data && event.notification.data.url) || "/?ritual=1";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (list) => {
        for (const client of list) {
          if ("focus" in client) {
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      },
    ),
  );
});
