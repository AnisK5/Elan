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
    url: "/?ritual=1&pick=15",
    tag: "elan-ritual-morning",
    pick: "15",
    planMessage: "",
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
      data: {
        url: payload.url || "/?ritual=1&pick=15",
        pick: payload.pick,
        planMessage: payload.planMessage,
      },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const pick = data.pick || "15";
  const planMessage = data.planMessage || "";
  const url =
    data.url ||
    "/?ritual=1&pick=" +
      encodeURIComponent(pick) +
      (planMessage
        ? "&msg=" + encodeURIComponent(planMessage)
        : "");
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (list) => {
        for (const client of list) {
          if ("navigate" in client) {
            return client.navigate(url);
          }
        }
        for (const client of list) {
          if ("focus" in client) {
            client.postMessage({
              type: "elan-ritual-launch",
              pick,
              planMessage,
            });
            return client.focus();
          }
        }
        return self.clients.openWindow(url);
      },
    ),
  );
});
