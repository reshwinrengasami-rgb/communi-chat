self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (error) {
    console.error("Unable to parse incoming call notification", error);
  }

  event.waitUntil(
    self.registration.showNotification(payload.title || "Incoming call", {
      body: payload.body || "Someone is calling you.",
      tag: payload.tag || "communichat-call",
      data: { url: payload.url || "/" },
      requireInteraction: true,
      silent: false,
      vibrate: [250, 150, 250],
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (clients) => {
        const existingClient = clients.find(
          (client) => new URL(client.url).origin === self.location.origin,
        );
        if (existingClient) {
          return existingClient.navigate(targetUrl).then(() =>
            existingClient.focus(),
          );
        }
        return self.clients.openWindow(targetUrl);
      },
    ),
  );
});
